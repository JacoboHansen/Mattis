import { NextRequest, NextResponse } from 'next/server';

import {
  ACTIVE_LEARNER_COOKIE,
  ACCESS_COOKIE,
} from '../../../../lib/auth-cookies';
import {
  ensureFamilyAccount,
  getAuthUser,
  SupabaseHttpError,
  updateLearnerIntake,
} from '../../../../lib/supabase-http';

const INTAKE_STEPS = new Set([
  'goal',
  'confidence',
  'learning_style',
  'work_mode',
  'frequency',
  'duration',
  'schedule_mode',
  'schedule',
  'school',
  'homework',
  'done',
]);

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken)
    return NextResponse.json(
      { error: 'Økten din har utløpt.' },
      { status: 401 },
    );
  const body = (await request.json().catch(() => ({}))) as {
    intakeStep?: unknown;
    intakeData?: unknown;
    complete?: unknown;
  };
  if (
    typeof body.intakeStep !== 'string' ||
    !INTAKE_STEPS.has(body.intakeStep) ||
    !body.intakeData ||
    typeof body.intakeData !== 'object' ||
    Array.isArray(body.intakeData)
  ) {
    return NextResponse.json(
      { error: 'Bli-kjent-svaret er ugyldig.' },
      { status: 400 },
    );
  }
  const intakeData = body.intakeData as Record<string, unknown>;
  if (JSON.stringify(intakeData).length > 12_000) {
    return NextResponse.json(
      { error: 'Bli-kjent-svaret er for langt.' },
      { status: 400 },
    );
  }
  try {
    const user = await getAuthUser(accessToken);
    const learners = await ensureFamilyAccount(accessToken, user.id);
    const requestedLearnerId = request.cookies.get(
      ACTIVE_LEARNER_COOKIE,
    )?.value;
    const learner =
      learners.find((candidate) => candidate.id === requestedLearnerId) ??
      learners[0];
    await updateLearnerIntake(accessToken, user.id, learner.id, {
      intakeStep: body.intakeStep,
      intakeData,
      complete: body.complete === true,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof SupabaseHttpError ? error.status : 500;
    return NextResponse.json(
      { error: 'Bli-kjent-svaret kunne ikke lagres.' },
      { status },
    );
  }
}
