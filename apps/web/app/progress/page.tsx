import { redirect } from 'next/navigation';

import MattisApp, { type ProgressScreenData } from '../components/mattis-app';
import { buildProgressOverview } from '../../lib/progress';
import { getAuthenticatedTutorData, RequestAuthError } from '../../lib/request-auth';

export default async function ProgressPage() {
  let data;
  try {
    ({ data } = await getAuthenticatedTutorData({ requireBilling: true }));
  } catch (error) {
    if (error instanceof RequestAuthError && error.status === 402) redirect('/billing');
    redirect('/');
  }

  const [profile, concepts, mastery] = await Promise.all([
    data.getProfile(),
    data.listCurriculumConcepts(100),
    data.listMastery(100),
  ]);

  const initialProgress: ProgressScreenData = {
    displayName: profile?.display_name?.trim() || 'Nora',
    overview: buildProgressOverview(concepts, mastery, profile?.grade_level ?? null),
  };

  return <MattisApp screen="progress" initialProgress={initialProgress} />;
}
