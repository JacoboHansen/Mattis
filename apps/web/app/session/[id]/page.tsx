import { notFound, redirect } from 'next/navigation';

import MattisApp from '../../components/mattis-app';
import { getAuthenticatedTutorData } from '../../../lib/request-auth';
import { isUuid } from '../../../lib/uuid';

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
  if (['planned', 'capturing', 'parsing'].includes(session.status)) {
    redirect(`/session/${id}/capture`);
  }
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
