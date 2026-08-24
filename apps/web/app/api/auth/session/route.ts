import { NextRequest, NextResponse } from 'next/server';

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from '../../../../lib/auth-cookies';
import {
  ensureDemoProfile,
  getAuthUser,
  isAllowedEmail,
  refreshAuthSession,
  SupabaseHttpError,
} from '../../../../lib/supabase-http';

type SessionDestination = {
  email: string;
  destination: '/home' | '/onboarding';
};

async function sessionDestination(accessToken: string): Promise<SessionDestination | null> {
  const user = await getAuthUser(accessToken);
  if (!user.email || !isAllowedEmail(user.email)) return null;
  const profile = await ensureDemoProfile(accessToken, user.id);
  return {
    email: user.email,
    destination: profile.onboarding_completed_at ? '/home' : '/onboarding',
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
    return response;
  }

  try {
    if (accessToken) {
      const destination = await sessionDestination(accessToken);
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
      const destination = await sessionDestination(session.access_token);
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
