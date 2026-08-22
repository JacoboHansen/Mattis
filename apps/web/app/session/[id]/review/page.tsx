import MattisApp from '../../../components/mattis-app';
import { notFound, redirect } from 'next/navigation';

import { getAuthenticatedTutorData } from '../../../../lib/request-auth';
import { isUuid } from '../../../../lib/uuid';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  let data;
  try {
    ({ data } = await getAuthenticatedTutorData());
  } catch {
    redirect('/');
  }
  const [session, tasks] = await Promise.all([data.getSession(id), data.listTasks(id, 100)]);
  if (!session) notFound();
  if (session.status === 'active') redirect(`/session/${id}`);
  if (session.status === 'completed' || session.status === 'cancelled') {
    redirect(`/session/${id}/summary`);
  }
  return (
    <MattisApp
      screen="review"
      sessionId={id}
      initialReview={{
        tasks: tasks
          .filter((task) => task.phase === 'homework')
          .map((task) => ({ id: task.id, text: task.normalized_text, label: task.source_label })),
      }}
    />
  );
}
