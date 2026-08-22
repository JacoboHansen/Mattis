import MattisApp from '../../../components/mattis-app';
import { notFound, redirect } from 'next/navigation';

import { getAuthenticatedTutorData } from '../../../../lib/request-auth';
import { isUuid } from '../../../../lib/uuid';

export default async function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  let data;
  try {
    ({ data } = await getAuthenticatedTutorData());
  } catch {
    redirect('/');
  }
  const session = await data.getSession(id);
  if (!session) notFound();
  if (session.status === 'reviewing') redirect(`/session/${id}/review`);
  if (session.status === 'active') redirect(`/session/${id}`);
  if (session.status === 'completed' || session.status === 'cancelled') {
    redirect(`/session/${id}/summary`);
  }
  return <MattisApp screen="capture" sessionId={id} />;
}
