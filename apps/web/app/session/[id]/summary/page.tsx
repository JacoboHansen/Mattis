import MattisApp from '../../../components/mattis-app';
import { notFound, redirect } from 'next/navigation';

import { getAuthenticatedTutorData } from '../../../../lib/request-auth';
import { isUuid } from '../../../../lib/uuid';

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
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
  return (
    <MattisApp
      screen="summary"
      sessionId={id}
      initialSummary={{
        status: session.status,
        durationMinutes: session.duration_minutes,
        summary: session.summary_nb,
        completedTasks: tasks.filter((task) => task.status === 'completed').length,
        totalTasks: tasks.length,
      }}
    />
  );
}
