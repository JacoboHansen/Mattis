import { NextRequest, NextResponse } from 'next/server';

import { ACCESS_COOKIE, clearSessionCookies } from '../../../../lib/auth-cookies';
import { signOutSession } from '../../../../lib/supabase-http';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) await signOutSession(accessToken).catch(() => undefined);

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
