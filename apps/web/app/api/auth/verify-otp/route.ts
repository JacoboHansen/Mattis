import { NextRequest, NextResponse } from 'next/server';

import { setSessionCookies } from '../../../../lib/auth-cookies';
import {
  ensureDemoProfile,
  isAllowedEmail,
  isValidOtp,
  normalizeEmail,
  SupabaseHttpError,
  verifyEmailOtp,
} from '../../../../lib/supabase-http';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    token?: unknown;
  };
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!isAllowedEmail(email) || !isValidOtp(token)) {
    return NextResponse.json(
      { error: 'Sjekk e-postadressen og den sekssifrede koden.' },
      { status: 400 },
    );
  }

  try {
    const session = await verifyEmailOtp(email, token);
    if (normalizeEmail(session.user.email ?? '') !== email) {
      return NextResponse.json(
        { error: 'Koden tilhører ikke denne testbrukeren.' },
        { status: 403 },
      );
    }
    const profile = await ensureDemoProfile(session.access_token, session.user.id);
    const destination = profile.onboarding_completed_at ? '/home' : '/onboarding';
    const response = NextResponse.json({ ok: true, destination });
    setSessionCookies(response, session);
    return response;
  } catch (error) {
    if (error instanceof SupabaseHttpError) {
      const message =
        error.status === 503
          ? 'Innloggingen er ikke ferdig konfigurert ennå.'
          : 'Koden er feil eller utløpt. Prøv igjen.';
      return NextResponse.json({ error: message }, { status: error.status });
    }
    return NextResponse.json(
      { error: 'Vi klarte ikke å logge deg inn. Prøv igjen.' },
      { status: 500 },
    );
  }
}
