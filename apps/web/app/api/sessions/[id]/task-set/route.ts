import { MATTIS_CONCEPT_KEYS } from '../../../../../lib/ai/homework-parser';
import { generateTaskSet, type TaskSetReason } from '../../../../../lib/ai/task-set';
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

function parseReason(value: unknown): TaskSetReason {
  return value === 'no_homework' ? 'no_homework' : 'more_practice';
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Ugyldig økt-ID.' }, 400);

  const body = await request.json().catch(() => ({}));
  const reason = parseReason(
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).reason
      : undefined,
  );

  try {
    const { data } = await getAuthenticatedTutorData();
    const [session, tasks, profile, mastery, messages] = await Promise.all([
      data.getSession(id),
      data.listTasks(id, 100),
      data.getProfile(),
      data.listMastery(100),
      data.listMessages(id, 12),
    ]);
    if (!session) return json({ error: 'Økten finnes ikke.' }, 404);
    if (session.status !== 'active') {
      return json({ error: 'Oppgavesett kan bare lages mens økten pågår.' }, 409);
    }
    if (tasks.some((task) => !['completed', 'skipped'].includes(task.status))) {
      return json({ error: 'Fullfør oppgaven dere holder på med først.' }, 409);
    }

    const startedAt = session.started_at ? Date.parse(session.started_at) : Date.now();
    const elapsedSeconds = Number.isFinite(startedAt)
      ? Math.max(0, (Date.now() - startedAt) / 1_000)
      : 0;
    const remainingMinutes = Math.max(
      0,
      Math.ceil((session.duration_minutes * 60 - elapsedSeconds) / 60),
    );
    if (remainingMinutes < 5) {
      return json({ error: 'Det er ikke nok tid igjen til et nytt oppgavesett.' }, 409);
    }

    const focusConcepts = [
      ...new Set([
        ...tasks.flatMap((task) => task.concept_keys),
        ...mastery.filter((item) => item.estimate < 0.72).map((item) => item.concept_key),
      ]),
    ]
      .filter((concept) =>
        MATTIS_CONCEPT_KEYS.includes(concept as (typeof MATTIS_CONCEPT_KEYS)[number]),
      )
      .slice(0, 4);

    const generation = await generateTaskSet({
      gradeLevel: profile?.grade_level ?? null,
      courseCode: profile?.course_code ?? null,
      durationMinutes: session.duration_minutes,
      remainingMinutes,
      reason,
      focusConcepts,
      existingTopics: tasks.map((task) => task.normalized_text),
      history: messages
        .filter((message) => message.role === 'student' || message.role === 'tutor')
        .slice(-8)
        .map((message) => ({
          role: message.role as 'student' | 'tutor',
          content: message.content_nb,
        })),
    });

    const created = await data.createTasks(
      id,
      generation.tasks.map((task, index) => ({
        sourceText: task.text,
        normalizedText: task.text,
        sourceLabel: 'Ekstra ' + (index + 1),
        taskType: task.taskType,
        conceptKeys: task.conceptKeys,
        parseConfidence: 0.9,
        phase: 'repetition',
        origin: 'manual',
        estimatedMinutes: task.estimatedMinutes,
        status: 'confirmed',
      })),
    );
    await data.updateSession(id, { currentPhase: 'repetition' });
    await data
      .recordAiGeneration({
        capability: 'task_set',
        provider: generation.provider,
        model: generation.model,
        requestSchemaVersion: 'task-set-request.v0.1',
        responseSchemaVersion: 'task-set.v0.1',
        status: 'succeeded',
        sessionId: id,
        latencyMs: null,
        inputUnits: generation.usage?.inputTokens ?? null,
        outputUnits: generation.usage?.outputTokens ?? null,
        safetyFlags: ['none'],
      })
      .catch(() => undefined);

    return json({
      title: generation.titleNb,
      message: generation.introNb,
      tasks: created.map((task) => ({
        id: task.id,
        text: task.normalized_text,
        label: task.source_label,
        phase: task.phase,
        status: task.status,
        taskType: task.task_type,
        conceptKeys: task.concept_keys,
      })),
    });
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Oppgavesettet kunne ikke lages akkurat nå.' }, 503);
  }
}
