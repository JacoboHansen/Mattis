import { NextRequest, NextResponse } from 'next/server';

import {
  isAllowedEmail,
  normalizeEmail,
  requestEmailOtp,
  SupabaseHttpError,
} from '../../../../lib/supabase-http';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';

  if (!isAllowedEmail(email)) {
    return NextResponse.json(
      { error: 'Denne e-postadressen er ikke invitert til testen.' },
      { status: 403 },
    );
  }

  try {
    await requestEmailOtp(email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SupabaseHttpError) {
      const message =
        error.status === 429
          ? 'Vent litt før du ber om en ny kode.'
          : error.status === 503
            ? 'Innloggingen er ikke ferdig konfigurert ennå.'
            : 'Vi klarte ikke å sende koden. Prøv igjen.';
      return NextResponse.json({ error: message }, { status: error.status });
    }
    return NextResponse.json(
      { error: 'Vi klarte ikke å sende koden. Prøv igjen.' },
      { status: 500 },
    );
  }
}
