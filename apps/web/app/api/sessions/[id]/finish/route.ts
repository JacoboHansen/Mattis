import { CONCEPT_TITLES_NB } from '../../../../../lib/planning/session-plan';
import type { MattisConceptKey } from '../../../../../lib/ai/homework-parser';
import { cleanStoredNextTopic } from '../../../../../lib/learner-context';
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

function planFocusTopic(planSnapshot: unknown) {
  if (
    !planSnapshot ||
    typeof planSnapshot !== 'object' ||
    Array.isArray(planSnapshot)
  )
    return null;
  const focusConcepts = (planSnapshot as Record<string, unknown>).focusConcepts;
  if (!Array.isArray(focusConcepts)) return null;
  const concept = focusConcepts.find(
    (value): value is MattisConceptKey =>
      typeof value === 'string' && value in CONCEPT_TITLES_NB,
  );
  return concept ? CONCEPT_TITLES_NB[concept] : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Ugyldig økt-ID.' }, 400);
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Ugyldig oppsummering.' }, 400);
  }
  if (Object.keys(body).length > 0) {
    return json({ error: 'Ukjente oppsummeringsfelter.' }, 400);
  }

  try {
    const { data } = await getAuthenticatedTutorData({ requireBilling: true });
    const [session, tasks, mastery] = await Promise.all([
      data.getSession(id),
      data.listTasks(id, 100),
      data.listMastery(100),
    ]);
    if (!session) return json({ error: 'Økten finnes ikke.' }, 404);
    if (session.status === 'cancelled')
      return json({ error: 'Økten er avbrutt.' }, 409);
    if (session.status === 'completed') {
      return json({
        summary: session.summary_nb,
        completedTasks: tasks.filter((task) => task.status === 'completed')
          .length,
        totalTasks: tasks.length,
      });
    }

    await Promise.all(
      tasks
        .filter((task) => !['completed', 'skipped'].includes(task.status))
        .map((task) => data.updateTask(task.id, { status: 'skipped' })),
    );
    const completedTasks = tasks.filter(
      (task) => task.status === 'completed',
    ).length;
    const relevantConcepts = new Set(
      tasks.flatMap((task) => task.concept_keys),
    );
    const needsPractice = mastery.find(
      (item) =>
        relevantConcepts.has(item.concept_key) && item.evidence_count > 0,
    );
    const conceptTitle = needsPractice
      ? CONCEPT_TITLES_NB[needsPractice.concept_key as MattisConceptKey]
      : undefined;
    const plannedNextTopic =
      cleanStoredNextTopic(session.next_topic_nb) ??
      planFocusTopic(session.plan_snapshot) ??
      cleanStoredNextTopic(conceptTitle);
    const summary = tasks.length
      ? `Du fullførte ${completedTasks} av ${tasks.length} oppgaver${conceptTitle ? `, og vi bør øve litt mer på ${conceptTitle}` : ''}.`
      : 'Du brukte økten på egne mattespørsmål og forklaringer.';
    const updated = await data.updateSession(id, {
      status: 'completed',
      currentPhase: 'summary',
      endedAt: new Date().toISOString(),
      summaryNb: summary,
      nextTopicNb: plannedNextTopic,
    });
    return json({
      summary: updated.summary_nb,
      completedTasks,
      totalTasks: tasks.length,
    });
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Økten kunne ikke oppsummeres.' }, 503);
  }
}
