import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import MattisApp, {
  type OnboardingProfileData,
} from '../components/mattis-app';
import { ACTIVE_LEARNER_COOKIE } from '../../lib/auth-cookies';
import { getAuthenticatedParent } from '../../lib/request-auth';
import { ageBandForGrade } from '../../lib/learner-profile';

export default async function OnboardingPage() {
  let parent;
  try {
    parent = await getAuthenticatedParent();
  } catch {
    redirect('/');
  }
  const cookieStore = await cookies();
  const activeId = cookieStore.get(ACTIVE_LEARNER_COOKIE)?.value;
  const learner =
    parent.learners.find((candidate) => candidate.id === activeId) ??
    parent.learners[0];
  const initialProfile: OnboardingProfileData | undefined = learner
    ? {
        displayName: learner.display_name,
        gradeLevel: learner.grade_level,
        courseCode: learner.course_code,
        identityComplete: Boolean(
          learner.grade_level && learner.display_name !== 'Elev',
        ),
        ageBand:
          (learner.age_band as OnboardingProfileData['ageBand'] | null) ??
          ageBandForGrade(learner.grade_level),
        parentTogetherConfirmed: learner.parent_together_confirmed,
        safetyAcknowledged: Boolean(learner.safety_acknowledged_at),
      }
    : undefined;
  return <MattisApp screen="onboarding" initialProfile={initialProfile} />;
}
