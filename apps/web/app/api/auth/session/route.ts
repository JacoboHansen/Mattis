import { NextRequest, NextResponse } from 'next/server';

import {
  ACCESS_COOKIE,
  ACTIVE_LEARNER_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setActiveLearnerCookie,
  setSessionCookies,
} from '../../../../lib/auth-cookies';
import {
  ensureFamilyAccount,
  getAuthUser,
  isValidEmail,
  refreshAuthSession,
  SupabaseHttpError,
} from '../../../../lib/supabase-http';

type SessionDestination = {
  email: string;
  destination: '/home' | '/onboarding' | '/profiles';
  learnerId?: string;
};

async function sessionDestination(
  accessToken: string,
  activeLearnerId?: string,
): Promise<SessionDestination | null> {
  const user = await getAuthUser(accessToken);
  if (!user.email || !isValidEmail(user.email)) return null;
  const learners = await ensureFamilyAccount(accessToken, user.id);
  const learner = activeLearnerId
    ? learners.find((candidate) => candidate.id === activeLearnerId)
    : learners.length === 1
      ? learners[0]
      : undefined;
  if (!learner) return { email: user.email, destination: '/profiles' };
  return {
    email: user.email,
    learnerId: learner.id,
    destination: learner.onboarding_completed_at ? '/home' : '/onboarding',
  };
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const redirectToApp = request.nextUrl.searchParams.get('redirect') === '1';

  function authenticatedResponse(
    destination: SessionDestination,
    session?: Parameters<typeof setSessionCookies>[1],
  ) {
    const response = redirectToApp
      ? NextResponse.redirect(new URL(destination.destination, request.url))
      : NextResponse.json({
          authenticated: true,
          email: destination.email,
          destination: destination.destination,
        });
    if (session) setSessionCookies(response, session);
    if (destination.learnerId) setActiveLearnerCookie(response, destination.learnerId);
    return response;
  }

  try {
    if (accessToken) {
      const destination = await sessionDestination(
        accessToken,
        request.cookies.get(ACTIVE_LEARNER_COOKIE)?.value,
      );
      if (destination) return authenticatedResponse(destination);
    }
  } catch (error) {
    if (!(error instanceof SupabaseHttpError) || error.status !== 401) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }
  }

  if (refreshToken) {
    try {
      const session = await refreshAuthSession(refreshToken);
      const destination = await sessionDestination(
        session.access_token,
        request.cookies.get(ACTIVE_LEARNER_COOKIE)?.value,
      );
      if (destination) return authenticatedResponse(destination, session);
    } catch {
      // Fall through and clear the invalid session cookies.
    }
  }

  const response = redirectToApp
    ? NextResponse.redirect(new URL('/', request.url))
    : NextResponse.json({ authenticated: false });
  clearSessionCookies(response);
  return response;
}
