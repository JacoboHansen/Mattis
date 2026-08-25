import { cookies } from 'next/headers';

import { ACCESS_COOKIE, ACTIVE_LEARNER_COOKIE } from './auth-cookies';
import {
  getAuthUser,
  listLearnerProfiles,
  SupabaseHttpError,
  type AuthUser,
  type LearnerProfile,
} from './supabase-http';
import { createTutorDataClient, type TutorDataClient } from './supabase/data';
import { BillingAccessError, getBillingAccount, isBillingEntitled } from './billing';

export class RequestAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 402 | 503,
  ) {
    super(message);
    this.name = 'RequestAuthError';
  }
}

export async function getAuthenticatedTutorData(options: { requireBilling?: boolean } = {}): Promise<{
  accessToken: string;
  user: AuthUser;
  learner: LearnerProfile;
  data: TutorDataClient;
}> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) throw new RequestAuthError('Du må være innlogget.', 401);
  try {
    const user = await getAuthUser(accessToken);
    const learners = await listLearnerProfiles(accessToken, user.id);
    if (!learners.length) throw new RequestAuthError('Du må sette opp en elevprofil.', 503);
    if (options.requireBilling && !isBillingEntitled(await getBillingAccount(accessToken, user.id))) {
      throw new BillingAccessError();
    }
    const activeLearnerId = cookieStore.get(ACTIVE_LEARNER_COOKIE)?.value;
    const learner = learners.find((candidate) => candidate.id === activeLearnerId) ?? learners[0];
    return {
      accessToken,
      user,
      learner,
      data: createTutorDataClient({ accessToken, userId: user.id, learnerId: learner.id }),
    };
  } catch (error) {
    if (error instanceof BillingAccessError) {
      throw new RequestAuthError(error.message, 402);
    }
    if (error instanceof SupabaseHttpError && error.status === 401) {
      throw new RequestAuthError('Innloggingen er utløpt.', 401);
    }
    throw new RequestAuthError('Innlogging kunne ikke bekreftes.', 503);
  }
}

export async function getAuthenticatedParent(): Promise<{
  accessToken: string;
  user: AuthUser;
  learners: LearnerProfile[];
}> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) throw new RequestAuthError('Du må være innlogget.', 401);
  try {
    const user = await getAuthUser(accessToken);
    const learners = await listLearnerProfiles(accessToken, user.id);
    return { accessToken, user, learners };
  } catch (error) {
    if (error instanceof RequestAuthError) throw error;
    if (error instanceof SupabaseHttpError && error.status === 401) {
      throw new RequestAuthError('Innloggingen er utløpt.', 401);
    }
    throw new RequestAuthError('Innlogging kunne ikke bekreftes.', 503);
  }
}
