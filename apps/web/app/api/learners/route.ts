import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedParent } from '../../../lib/request-auth';
import { createLearnerProfile, SupabaseHttpError } from '../../../lib/supabase-http';

export async function GET() {
  try {
    const { learners } = await getAuthenticatedParent();
    return NextResponse.json({ learners });
  } catch (error) {
    const status = error instanceof SupabaseHttpError ? error.status : 401;
    return NextResponse.json({ error: 'Vi klarte ikke å hente elevprofilene.' }, { status });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    displayName?: unknown;
    gradeLevel?: unknown;
  };
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const rawGradeLevel = body.gradeLevel;
  const gradeLevel =
    rawGradeLevel === null || rawGradeLevel === undefined || rawGradeLevel === ''
      ? null
      : Number(rawGradeLevel);
  if (
    displayName.length < 1 ||
    displayName.length > 40 ||
    (gradeLevel !== null && (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 13))
  ) {
    return NextResponse.json({ error: 'Skriv inn et navn og eventuelt trinn.' }, { status: 400 });
  }

  try {
    const { accessToken, user } = await getAuthenticatedParent();
    const learner = await createLearnerProfile(accessToken, user.id, { displayName, gradeLevel });
    return NextResponse.json({ learner, destination: '/onboarding' }, { status: 201 });
  } catch (error) {
    const status = error instanceof SupabaseHttpError ? error.status : 500;
    const message =
      status === 409
        ? 'Det finnes allerede en elev med dette navnet.'
        : 'Elevprofilen kunne ikke opprettes.';
    return NextResponse.json({ error: message }, { status });
  }
}
