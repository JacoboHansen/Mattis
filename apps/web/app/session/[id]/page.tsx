import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import MattisApp from '../../components/mattis-app';
import { ACCESS_COOKIE } from '../../../lib/auth-cookies';
import { getAuthUser } from '../../../lib/supabase-http';
import { createTutorDataClient } from '../../../lib/supabase/data';
import { isUuid } from '../../../lib/uuid';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) redirect('/');

  let user;
  try {
    user = await getAuthUser(accessToken);
  } catch {
    redirect('/');
  }

  const data = createTutorDataClient({ accessToken, userId: user.id });
  const [session, storedMessages] = await Promise.all([
    data.getSession(id),
    data.listMessages(id, 100),
  ]);
  if (!session) notFound();
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
      }}
    />
  );
}
