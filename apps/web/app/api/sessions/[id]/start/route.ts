import { createHash } from 'node:crypto';

import { buildSessionPlan } from '../../../../../lib/planning/session-plan';
import { cleanStoredNextTopic } from '../../../../../lib/learner-context';
import { nextWeeklyOccurrence } from '../../../../../lib/scheduling';
import {
  getAuthenticatedTutorData,
  RequestAuthError,
} from '../../../../../lib/request-auth';
import { TutorDataError } from '../../../../../lib/supabase/data';
import { isUuid } from '../../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function hasV1Plan(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ((value as Record<string, unknown>).version === 'session-plan.v0.1' ||
      (value as Record<string, unknown>).version === 'session-plan.v0.2')
  );
}

function weeklyRule(value: string | null) {
  if (!value) return null;
  const weekday = value.match(/(?:^|;)BYDAY=([1-7])(?:;|$)/i)?.[1];
  const localTime = value.match(/(?:^|;)TIME=(\d{2}:\d{2})(?:;|$)/i)?.[1];
  const timezone = value.match(/(?:^|;)TZ=([^;]+)(?:;|$)/i)?.[1];
  if (!weekday || !localTime) return null;
  return {
    weekday: Number(weekday),
    localTime,
    timezone: timezone || 'Europe/Oslo',
  };
}

function scheduleOccurrenceKey(scheduleId: string, startsAt: string) {
  const hex = createHash('sha256')
    .update(`mattis:schedule:${scheduleId}:${startsAt}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16]!, 16) % 4]!;
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Ugyldig økt-ID.' }, 400);
  try {
    const { data } = await getAuthenticatedTutorData({ requireBilling: true });
    const [session, initialTasks, mastery, sessions] = await Promise.all([
      data.getSession(id),
      data.listTasks(id, 100),
      data.listMastery(100),
      data.listSessions(20),
    ]);
    if (!session) return json({ error: 'Økten finnes ikke.' }, 404);
    if (session.status === 'completed' || session.status === 'cancelled') {
      return json({ error: 'Økten er avsluttet.' }, 409);
    }
    const schedule = session.schedule_id
      ? await data.getSchedule(session.schedule_id)
      : null;
    const wasAlreadyActive = session.status === 'active';

    let tasks = initialTasks;
    let planSnapshot = session.plan_snapshot;
    let previousNextTopicNb: string | null = null;
    if (!hasV1Plan(planSnapshot)) {
      const homeworkTasks = tasks.filter((task) => task.phase === 'homework');
      previousNextTopicNb = cleanStoredNextTopic(
        sessions.find(
          (item) =>
            item.id !== id && item.status === 'completed' && item.next_topic_nb,
        )?.next_topic_nb,
      );
      const plan = buildSessionPlan({
        durationMinutes: session.duration_minutes,
        homeworkTasks,
        mastery,
        nextTopicNb: previousNextTopicNb,
      });
      if (plan.reviewTasks.length > 0) {
        await data.createTasks(
          id,
          plan.reviewTasks.map((task, index) => ({
            sourceText: task.sourceText,
            normalizedText: task.sourceText,
            sourceLabel: `Repetisjon ${index + 1}`,
            taskType: task.taskType,
            conceptKeys: task.conceptKeys,
            parseConfidence: 1,
            phase: 'repetition',
            origin: 'planned_review',
            estimatedMinutes: task.estimatedMinutes,
            status: 'confirmed',
          })),
        );
      }
      await Promise.all(
        homeworkTasks
          .filter((task) => task.status === 'detected')
          .map((task) => data.updateTask(task.id, { status: 'confirmed' })),
      );
      planSnapshot = {
        version: 'session-plan.v0.1',
        mode: 'suggested',
        planConfirmed: false,
        homeworkMinutes: plan.homeworkMinutes,
        repetitionMinutes: plan.repetitionMinutes,
        summaryMinutes: plan.summaryMinutes,
        focusConcepts: plan.focusConcepts,
        timeline: plan.timeline,
        reasonNb: plan.reasonNb,
        previousNextTopicNb,
        createdAt: new Date().toISOString(),
      };
      tasks = await data.listTasks(id, 100);
    }

    if (
      planSnapshot &&
      typeof planSnapshot === 'object' &&
      !Array.isArray(planSnapshot)
    ) {
      const plan = planSnapshot as Record<string, unknown>;
      const timeline = Array.isArray(plan.timeline) ? plan.timeline : [];
      if (
        typeof plan.activeSegmentId !== 'string' &&
        timeline[0] &&
        typeof timeline[0] === 'object' &&
        !Array.isArray(timeline[0]) &&
        typeof (timeline[0] as Record<string, unknown>).id === 'string'
      ) {
        planSnapshot = {
          ...plan,
          activeSegmentId: String((timeline[0] as Record<string, unknown>).id),
        };
      }
    }

    if (
      hasV1Plan(planSnapshot) &&
      planSnapshot &&
      typeof planSnapshot === 'object' &&
      !Array.isArray(planSnapshot)
    ) {
      const storedPreviousTopic = (planSnapshot as Record<string, unknown>)
        .previousNextTopicNb;
      previousNextTopicNb = cleanStoredNextTopic(
        typeof storedPreviousTopic === 'string' ? storedPreviousTopic : null,
      );
    }

    const planMode =
      planSnapshot &&
      typeof planSnapshot === 'object' &&
      !Array.isArray(planSnapshot)
        ? (planSnapshot as Record<string, unknown>).mode
        : null;
    const activeSegment =
      planSnapshot &&
      typeof planSnapshot === 'object' &&
      !Array.isArray(planSnapshot) &&
      Array.isArray((planSnapshot as Record<string, unknown>).timeline)
        ? (
            (planSnapshot as Record<string, unknown>).timeline as Array<
              Record<string, unknown>
            >
          ).find(
            (item) =>
              item.id ===
              (planSnapshot as Record<string, unknown>).activeSegmentId,
          )
        : null;
    const currentPhase =
      planMode === 'getting_to_know'
        ? 'intro'
        : activeSegment && typeof activeSegment.phase === 'string'
          ? activeSegment.phase
          : tasks.some(
                (task) =>
                  task.phase === 'homework' &&
                  !['completed', 'skipped'].includes(task.status),
              )
            ? 'homework'
            : tasks.some(
                  (task) =>
                    task.phase === 'repetition' &&
                    !['completed', 'skipped'].includes(task.status),
                )
              ? 'repetition'
              : 'homework';
    const updatedSession = await data.updateSession(id, {
      status: 'active',
      currentPhase,
      startedAt: session.started_at ?? new Date().toISOString(),
      planSnapshot,
    });
    if (schedule) {
      const recurrence = weeklyRule(schedule.recurrence_rule);
      if (recurrence) {
        const next = wasAlreadyActive
          ? new Date(schedule.starts_at)
          : nextWeeklyOccurrence(
              recurrence.weekday,
              recurrence.localTime,
              new Date(schedule.starts_at),
              recurrence.timezone,
            );
        if (next && Number.isFinite(next.getTime())) {
          if (!wasAlreadyActive) {
            await data.updateSchedule(schedule.id, {
              startsAt: next.toISOString(),
              enabled: true,
            });
          }
          const alreadyPlanned = sessions.some(
            (item) =>
              item.status === 'planned' &&
              item.schedule_id === schedule.id &&
              item.planned_at &&
              Math.abs(Date.parse(item.planned_at) - next.getTime()) < 1_000,
          );
          if (!alreadyPlanned) {
            await data.createSession({
              durationMinutes: schedule.duration_minutes,
              plannedAt: next.toISOString(),
              scheduleId: schedule.id,
              creationKey: scheduleOccurrenceKey(
                schedule.id,
                next.toISOString(),
              ),
              planSnapshot: {
                version: 'scheduled-session.v0.1',
                mode: 'scheduled',
              },
            });
          }
        }
      } else {
        if (!wasAlreadyActive) {
          await data.updateSchedule(schedule.id, { enabled: false });
        }
      }
    }
    return json({
      session: {
        id: updatedSession.id,
        status: updatedSession.status,
        startedAt: updatedSession.started_at,
        currentPhase: updatedSession.current_phase,
      },
      tasks: tasks.map((task) => ({
        id: task.id,
        text: task.normalized_text,
        label: task.source_label,
        phase: task.phase,
        status: task.status,
        taskType: task.task_type,
        conceptKeys: task.concept_keys,
        estimatedMinutes: task.estimated_minutes,
      })),
      plan: planSnapshot,
      previousNextTopicNb,
    });
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Økten kunne ikke planlegges.' }, 503);
  }
}
