import type { NextResponse } from 'next/server';

import type { AuthSession } from './supabase-http';

export const ACCESS_COOKIE = 'mattis_access_token';
export const REFRESH_COOKIE = 'mattis_refresh_token';
export const ACTIVE_LEARNER_COOKIE = 'mattis_active_learner_id';

const cookieBase = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export function setSessionCookies(response: NextResponse, session: AuthSession) {
  response.cookies.set(ACCESS_COOKIE, session.access_token, {
    ...cookieBase,
    maxAge: Math.max(60, session.expires_in),
  });
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, {
    ...cookieBase,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, '', { ...cookieBase, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, '', { ...cookieBase, maxAge: 0 });
  response.cookies.set(ACTIVE_LEARNER_COOKIE, '', { ...cookieBase, maxAge: 0 });
}

export function setActiveLearnerCookie(response: NextResponse, learnerId: string) {
  response.cookies.set(ACTIVE_LEARNER_COOKIE, learnerId, {
    ...cookieBase,
    maxAge: 60 * 60 * 24 * 30,
  });
}
