import { buildSessionPlan } from '../../../../../lib/planning/session-plan';
import { getAuthenticatedTutorData, RequestAuthError } from '../../../../../lib/request-auth';
import { TutorDataError } from '../../../../../lib/supabase/data';
import { isUuid } from '../../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function hasV1Plan(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).version === 'session-plan.v0.1'
  );
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Ugyldig økt-ID.' }, 400);
  try {
    const { data } = await getAuthenticatedTutorData();
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

    let tasks = initialTasks;
    let planSnapshot = session.plan_snapshot;
    if (!hasV1Plan(planSnapshot)) {
      const homeworkTasks = tasks.filter((task) => task.phase === 'homework');
      const previousNextTopic = sessions.find(
        (item) => item.id !== id && item.status === 'completed' && item.next_topic_nb,
      )?.next_topic_nb;
      const plan = buildSessionPlan({
        durationMinutes: session.duration_minutes,
        homeworkTasks,
        mastery,
        nextTopicNb: previousNextTopic,
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
        homeworkMinutes: plan.homeworkMinutes,
        repetitionMinutes: plan.repetitionMinutes,
        summaryMinutes: plan.summaryMinutes,
        focusConcepts: plan.focusConcepts,
        reasonNb: plan.reasonNb,
        createdAt: new Date().toISOString(),
      };
      tasks = await data.listTasks(id, 100);
    }

    const currentPhase = tasks.some(
      (task) => task.phase === 'homework' && !['completed', 'skipped'].includes(task.status),
    )
      ? 'homework'
      : tasks.some(
            (task) =>
              task.phase === 'repetition' && !['completed', 'skipped'].includes(task.status),
          )
        ? 'repetition'
        : 'homework';
    const updatedSession = await data.updateSession(id, {
      status: 'active',
      currentPhase,
      startedAt: session.started_at ?? new Date().toISOString(),
      planSnapshot,
    });
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
    });
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Økten kunne ikke planlegges.' }, 503);
  }
}
