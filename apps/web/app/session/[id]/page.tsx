import { notFound, redirect } from 'next/navigation';

import MattisApp, { type SessionPlanData } from '../../components/mattis-app';
import { getAuthenticatedTutorData } from '../../../lib/request-auth';
import { isUuid } from '../../../lib/uuid';

function normalizePlanSnapshot(value: unknown): SessionPlanData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const timeline = Array.isArray(source.timeline)
    ? source.timeline.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const value = item as Record<string, unknown>;
        if (
          typeof value.id !== 'string' ||
          typeof value.label !== 'string' ||
          (value.phase !== 'homework' &&
            value.phase !== 'repetition' &&
            value.phase !== 'summary') ||
          typeof value.minutes !== 'number'
        ) {
          return [];
        }
        return [
          {
            id: value.id,
            label: value.label,
            phase: value.phase as 'homework' | 'repetition' | 'summary',
            minutes: value.minutes,
            ...(typeof value.conceptKey === 'string' ? { conceptKey: value.conceptKey } : {}),
          },
        ];
      })
    : [];
  return {
    version: typeof source.version === 'string' ? source.version : undefined,
    reasonNb: typeof source.reasonNb === 'string' ? source.reasonNb : null,
    previousNextTopicNb:
      typeof source.previousNextTopicNb === 'string' ? source.previousNextTopicNb : null,
    focusConcepts: Array.isArray(source.focusConcepts)
      ? source.focusConcepts.filter((item): item is string => typeof item === 'string')
      : [],
    openingNb: typeof source.openingNb === 'string' ? source.openingNb : null,
    mode:
      source.mode === 'suggested' || source.mode === 'homework' || source.mode === 'custom'
        ? source.mode
        : undefined,
    homeworkMinutes: typeof source.homeworkMinutes === 'number' ? source.homeworkMinutes : undefined,
    repetitionMinutes:
      typeof source.repetitionMinutes === 'number' ? source.repetitionMinutes : undefined,
    summaryMinutes: typeof source.summaryMinutes === 'number' ? source.summaryMinutes : undefined,
    timeline,
  };
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  let data;
  try {
    ({ data } = await getAuthenticatedTutorData());
  } catch {
    redirect('/');
  }

  const [session, storedMessages, storedTasks] = await Promise.all([
    data.getSession(id),
    data.listMessages(id, 100),
    data.listTasks(id, 100),
  ]);
  if (!session) notFound();
  if (session.status === 'reviewing') redirect(`/session/${id}/review`);
  if (session.status === 'completed' || session.status === 'cancelled') {
    redirect(`/session/${id}/summary`);
  }
  const messages = storedMessages
    .filter((message) => message.role === 'student' || message.role === 'tutor')
    .map((message) => ({
      id: message.id,
      role: message.role as 'student' | 'tutor',
      text: message.content_nb,
      clientMessageId: message.client_message_id,
      createdAt: message.created_at,
    }));
  return (
    <MattisApp
      screen="session"
      sessionId={id}
      initialSession={{
        id: session.id,
        status: session.status,
        currentPhase: session.current_phase,
        durationMinutes: session.duration_minutes,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        planSnapshot: normalizePlanSnapshot(session.plan_snapshot),
        nextTopicNb: session.next_topic_nb,
        messages,
        tasks: storedTasks.map((task) => ({
          id: task.id,
          text: task.normalized_text,
          label: task.source_label,
          phase: task.phase === 'repetition' ? 'repetition' : 'homework',
          status: task.status,
          taskType: task.task_type,
          conceptKeys: task.concept_keys,
        })),
      }}
    />
  );
}
