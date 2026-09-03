import MattisApp from '../../../components/mattis-app';
import { notFound, redirect } from 'next/navigation';

import {
  getAuthenticatedTutorData,
  RequestAuthError,
} from '../../../../lib/request-auth';
import {
  homeworkFigureAltText,
  homeworkFigureCrop,
} from '../../../../lib/homework-figures';
import { isUuid } from '../../../../lib/uuid';

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  let data;
  try {
    ({ data } = await getAuthenticatedTutorData({ requireBilling: true }));
  } catch (error) {
    if (error instanceof RequestAuthError && error.status === 402)
      redirect('/billing');
    redirect('/');
  }
  const [session, tasks] = await Promise.all([
    data.getSession(id),
    data.listTasks(id, 100),
  ]);
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
          .map((task) => ({
            id: task.id,
            text: task.normalized_text,
            label: task.source_label,
            hasFigure: Boolean(homeworkFigureCrop(task.figure_spec)),
            figureAlt: homeworkFigureAltText(task.figure_spec),
          })),
      }}
    />
  );
}
