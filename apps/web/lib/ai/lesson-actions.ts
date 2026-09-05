import type { TutorRequest, TutorTurnResponse } from './contracts';
import type {
  TutorDataClient,
  TutorSession,
  TutorTask,
} from '../supabase/data';
import type { Json } from '../database.types';
import { generateTaskSet } from './task-set';
import { deriveNamespacedUuid } from './message-id';
import {
  nextWeeklyOccurrence,
  weeklyRecurrenceRule,
  OSLO_TIMEZONE,
} from '../scheduling';

export type LessonData = Pick<
  TutorDataClient,
  | 'listTasks'
  | 'createTasks'
  | 'updateTask'
  | 'updateSession'
  | 'createSchedule'
  | 'createSession'
  | 'listSchedules'
>;
export type LessonEffects = {
  tasks?: TutorTask[];
  phase?: string;
  plan?: unknown;
  finished?: boolean;
  setupStep?: 'active' | 'review';
  focusTaskId?: string | null;
  startedAt?: string;
};
const namespace = '6a16de60-12de-43c0-aeb0-93d120d559fc';
const pending = (task: TutorTask) =>
  !['completed', 'skipped'].includes(task.status);

/** Execute server-owned actions before publishing the one visible tutor reply. */
export async function executeLessonActions(input: {
  data: LessonData;
  session: TutorSession;
  request: TutorRequest;
  turn: TutorTurnResponse;
  generateTasks?: typeof generateTaskSet;
}) {
  const { data, session, request, turn } = input;
  const effects: LessonEffects = {};
  const results: string[] = [];
  const directive = turn.directive ?? { type: 'none' };
  const id = (purpose: string) =>
    deriveNamespacedUuid(namespace, `${request.clientMessageId}:${purpose}`);
  if (
    turn.intent === 'safety' ||
    turn.safetyFlags.some((flag) => flag !== 'none')
  )
    return { effects, results };
  const snapshot =
    session.plan_snapshot &&
    typeof session.plan_snapshot === 'object' &&
    !Array.isArray(session.plan_snapshot)
      ? session.plan_snapshot
      : {};
  if (
    turn.learnerProfileUpdate?.complete &&
    request.lessonContext?.intakeComplete === false
  ) {
    effects.startedAt = new Date().toISOString();
    effects.phase = 'homework';
    await data.updateSession(session.id, {
      currentPhase: 'homework',
      startedAt: effects.startedAt,
    });
  }
  if (turn.focusTaskId) {
    const target = (await data.listTasks(session.id, 100)).find(
      (task) => task.id === turn.focusTaskId,
    );
    if (!target) throw new Error('Oppgaven finnes ikke i denne økten.');
    effects.focusTaskId = target.id;
  }
  if (turn.lessonPlan) {
    const plan = turn.lessonPlan;
    const timeline = plan.segments.map((segment, index) => ({
      ...segment,
      id: `lesson-${index}`,
    }));
    const nextSnapshot = {
      ...snapshot,
      ...(plan.confirmed
        ? { timeline, activeSegmentId: timeline[plan.activeIndex].id }
        : {}),
      proposedPlan: plan,
      planConfirmed: plan.confirmed,
    };
    await data.updateSession(session.id, {
      planSnapshot: nextSnapshot as Json,
      ...(plan.confirmed
        ? { currentPhase: timeline[plan.activeIndex].phase }
        : {}),
    });
    effects.plan = nextSnapshot;
    if (plan.confirmed) effects.phase = timeline[plan.activeIndex].phase;
    results.push(
      plan.confirmed
        ? 'Avtalt timeplan lagret.'
        : 'Planforslag lagret; eleven har ikke bekreftet det ennå.',
    );
  }
  if (turn.homeworkReview) {
    if (session.status !== 'reviewing')
      throw new Error('Leksene er ikke til kontroll.');
    const tasks = await data.listTasks(session.id, 100);
    const detected = tasks.filter((task) => task.status === 'detected');
    for (const correction of turn.homeworkReview.corrections) {
      if (!detected.some((task) => task.id === correction.taskId))
        throw new Error('Ugyldig lekseoppgave.');
    }
    for (const correction of turn.homeworkReview.corrections)
      await data.updateTask(correction.taskId, {
        normalizedText: correction.text,
      });
    if (turn.homeworkReview.confirmed) {
      for (const task of detected)
        await data.updateTask(task.id, { status: 'confirmed' });
      await data.updateSession(session.id, {
        status: 'active',
        currentPhase: 'homework',
        startedAt: session.started_at ?? new Date().toISOString(),
      });
      effects.phase = 'homework';
    }
    effects.setupStep = turn.homeworkReview.confirmed ? 'active' : 'review';
    effects.tasks = await data.listTasks(session.id, 100);
    results.push(
      `Leksekontroll lagret, godkjent: ${turn.homeworkReview.confirmed}. Oppgaver: ${JSON.stringify(effects.tasks.filter((task) => detected.some((item) => item.id === task.id)).map((task) => ({ text: task.normalized_text, id: task.id })))}.`,
    );
  }
  if (turn.scheduleRequest) {
    const schedule = turn.scheduleRequest;
    const startsAt =
      schedule.mode === 'weekly'
        ? nextWeeklyOccurrence(
            schedule.weekday!,
            schedule.localTime!,
            new Date(),
            OSLO_TIMEZONE,
          )
        : new Date(schedule.plannedAt!);
    if (
      !startsAt ||
      !Number.isFinite(startsAt.getTime()) ||
      startsAt.getTime() <= Date.now() ||
      startsAt.getTime() > Date.now() + 366 * 86400000
    ) {
      results.push(
        'Avtalen ble ikke lagret: datoen må være frem i tid, innen ett år. Avklar tidspunktet med eleven.',
      );
    } else {
      const recurrenceRule =
        schedule.mode === 'weekly'
          ? weeklyRecurrenceRule(
              schedule.weekday!,
              schedule.localTime!,
              OSLO_TIMEZONE,
            )
          : null;
      const existing = (await data.listSchedules(100)).find(
        (item) =>
          item.enabled &&
          item.duration_minutes === schedule.durationMinutes &&
          (recurrenceRule
            ? item.recurrence_rule === recurrenceRule
            : Date.parse(item.starts_at) === startsAt.getTime() &&
              !item.recurrence_rule),
      );
      const saved =
        existing ??
        (await data.createSchedule({
          id: id('schedule'),
          startsAt: startsAt.toISOString(),
          durationMinutes: schedule.durationMinutes,
          recurrenceRule,
        }));
      if (!existing || existing.id === id('schedule'))
        await data.createSession({
          creationKey: id('planned-session'),
          plannedAt: saved.starts_at,
          durationMinutes: saved.duration_minutes,
          scheduleId: saved.id,
          planSnapshot: {
            version: 'scheduled-session.v0.1',
            mode: 'scheduled',
          },
        });
      results.push(
        `Avtalen er lagret: ${saved.starts_at}, ${saved.duration_minutes} minutter, tidssone Europe/Oslo, ${recurrenceRule ? 'hver uke' : 'én gang'}.`,
      );
    }
  }
  const canAct =
    directive.timing !== 'after_current_task' ||
    !request.taskId ||
    turn.taskState === 'completed';
  if (
    canAct &&
    ['create_task_set', 'replace_task_set'].includes(directive.type)
  ) {
    const tasks = await data.listTasks(session.id, 100);
    const recovered = tasks.filter((task) =>
      Array.from({ length: 5 }, (_, i) => id(`task-${i}`)).includes(task.id),
    );
    const remaining = tasks.filter(
      (task) =>
        pending(task) &&
        !recovered.some((item) => item.id === task.id) &&
        !(task.id === request.taskId && turn.taskState === 'completed'),
    );
    const startedAt = effects.startedAt ?? session.started_at;
    const elapsed = startedAt
      ? Math.max(0, (Date.now() - Date.parse(startedAt)) / 60000)
      : 0;
    const remainingMinutes = Math.max(
      0,
      Math.ceil(session.duration_minutes - elapsed),
    );
    if (remaining.length && directive.type !== 'replace_task_set') {
      results.push(
        'Nytt sett ble ikke laget: det finnes fortsatt oppgaver i det aktive settet. Fortsett med disse, eller avklar et bytte.',
      );
    } else if (remainingMinutes < 2 && !recovered.length) {
      results.push(
        'Nytt sett ble ikke laget: under to minutter igjen. Avklar om eleven vil fortsette en annen gang.',
      );
    } else {
      const generation = recovered.length
        ? null
        : await (input.generateTasks ?? generateTaskSet)({
            gradeLevel: request.learnerContext?.gradeLevel ?? null,
            courseCode: request.learnerContext?.courseCode ?? null,
            durationMinutes: session.duration_minutes,
            remainingMinutes,
            reason: tasks.length ? 'more_practice' : 'no_homework',
            focusConcepts:
              request.learnerContext?.learnerProfile?.focusConceptKeys ?? [],
            existingTopics: tasks.map((task) => task.normalized_text),
            topic: directive.topicNb,
            history: [
              ...request.history,
              { role: 'student', content: request.message },
            ],
          });
      const created = generation
        ? await data.createTasks(
            session.id,
            generation.tasks.map((task, i) => ({
              id: id(`task-${i}`),
              sourceText: task.text,
              normalizedText: task.text,
              sourceLabel: generation.titleNb,
              taskType: task.taskType,
              conceptKeys: task.conceptKeys,
              estimatedMinutes: task.estimatedMinutes,
              phase: 'repetition',
              origin: 'manual',
              status: 'confirmed',
            })),
          )
        : recovered;
      // Retire the previous set only after the replacement exists.
      if (directive.type === 'replace_task_set')
        for (const task of remaining)
          await data.updateTask(task.id, { status: 'skipped' });
      await data.updateSession(session.id, { currentPhase: 'repetition' });
      effects.phase = 'repetition';
      effects.setupStep = 'active';
      effects.focusTaskId = null;
      effects.tasks = await data.listTasks(session.id, 100);
      results.push(
        `Oppgaver klare: ${JSON.stringify(created.map((task) => ({ text: task.normalized_text, id: task.id })))}. Første oppgave vises nå. Behold tilbakemeldingen på elevens forrige svar og led inn i akkurat denne første oppgaven.`,
      );
    }
  }
  return { effects, results };
}

export function taskForClient(task: TutorTask) {
  return {
    id: task.id,
    text: task.normalized_text,
    label: task.source_label,
    phase: task.phase,
    status: task.status,
    taskType: task.task_type,
    conceptKeys: task.concept_keys,
    hasFigure: Boolean(task.figure_spec),
    figureAlt: null,
  };
}
