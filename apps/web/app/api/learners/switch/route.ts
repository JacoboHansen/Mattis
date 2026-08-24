import { NextRequest, NextResponse } from 'next/server';

import { setActiveLearnerCookie } from '../../../../lib/auth-cookies';
import { getAuthenticatedParent } from '../../../../lib/request-auth';
import { SupabaseHttpError } from '../../../../lib/supabase-http';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { learnerId?: unknown };
  const learnerId = typeof body.learnerId === 'string' ? body.learnerId.trim() : '';
  if (!learnerId) return NextResponse.json({ error: 'Velg en elevprofil.' }, { status: 400 });

  try {
    const { learners } = await getAuthenticatedParent();
    const learner = learners.find((candidate) => candidate.id === learnerId);
    if (!learner) return NextResponse.json({ error: 'Elevprofilen finnes ikke.' }, { status: 404 });
    const destination = learner.onboarding_completed_at ? '/home' : '/onboarding';
    const response = NextResponse.json({ ok: true, destination });
    setActiveLearnerCookie(response, learner.id);
    return response;
  } catch (error) {
    const status = error instanceof SupabaseHttpError ? error.status : 401;
    return NextResponse.json({ error: 'Vi klarte ikke å bytte elevprofil.' }, { status });
  }
}
