import { redirect } from 'next/navigation';

import MattisApp, { type ProfileChooserData } from '../components/mattis-app';
import { getAuthenticatedParent } from '../../lib/request-auth';

export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string }>;
}) {
  let learners: Awaited<ReturnType<typeof getAuthenticatedParent>>['learners'] =
    [];
  try {
    ({ learners } = await getAuthenticatedParent());
  } catch {
    redirect('/');
  }
  if (!learners.length) redirect('/onboarding');
  const params = await searchParams;
  const profiles: ProfileChooserData = {
    pendingPayment: params.pending === '1',
    learners: learners.map((learner) => ({
      id: learner.id,
      displayName: learner.display_name,
      gradeLevel: learner.grade_level,
      courseCode: learner.course_code,
      onboardingComplete: Boolean(learner.onboarding_completed_at),
    })),
  };
  return <MattisApp screen="profiles" initialProfiles={profiles} />;
}
