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

async function sessionResponse(accessToken: string) {
  const user = await getAuthUser(accessToken);
  if (!user.email || !isAllowedEmail(user.email)) return null;
  const profile = await ensureDemoProfile(accessToken, user.id);
  return NextResponse.json({
    authenticated: true,
    email: user.email,
    destination: profile.onboarding_completed_at ? '/home' : '/onboarding',
  });
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  try {
    if (accessToken) {
      const response = await sessionResponse(accessToken);
      if (response) return response;
    }
  } catch (error) {
    if (!(error instanceof SupabaseHttpError) || error.status !== 401) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }
  }

  if (refreshToken) {
    try {
      const session = await refreshAuthSession(refreshToken);
      const response = await sessionResponse(session.access_token);
      if (response) {
        setSessionCookies(response, session);
        return response;
      }
    } catch {
      // Fall through and clear the invalid session cookies.
    }
  }

  const response = NextResponse.json({ authenticated: false });
  clearSessionCookies(response);
  return response;
}
