import { NextRequest, NextResponse } from 'next/server';

import { normalizeCurriculumSelection } from '../../../../lib/curriculum/catalog';
import {
  ACCESS_COOKIE,
  ACTIVE_LEARNER_COOKIE,
  setActiveLearnerCookie,
} from '../../../../lib/auth-cookies';
import {
  completeLearnerOnboarding,
  ensureFamilyAccount,
  getAuthUser,
  SupabaseHttpError,
} from '../../../../lib/supabase-http';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return NextResponse.json({ error: 'Økten din har utløpt.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    displayName?: unknown;
    gradeLevel?: unknown;
    courseCode?: unknown;
    weeklyGoalMinutes?: unknown;
  };
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const gradeLevel = Number(body.gradeLevel);
  const courseCode = typeof body.courseCode === 'string' ? body.courseCode.trim() : null;
  const weeklyGoalMinutes = Number(body.weeklyGoalMinutes);
  const curriculum = normalizeCurriculumSelection(gradeLevel, courseCode);

  if (
    displayName.length < 1 ||
    displayName.length > 40 ||
    !curriculum ||
    ![60, 120, 180].includes(weeklyGoalMinutes)
  ) {
    return NextResponse.json(
      { error: 'Sjekk navn, trinn, matematikkfag og ukesmål.' },
      { status: 400 },
    );
  }

  try {
    const user = await getAuthUser(accessToken);
    const learners = await ensureFamilyAccount(accessToken, user.id);
    const requestedLearnerId = request.cookies.get(ACTIVE_LEARNER_COOKIE)?.value;
    const learner =
      learners.find((candidate) => candidate.id === requestedLearnerId) ?? learners[0];
    await completeLearnerOnboarding(accessToken, user.id, learner.id, {
      displayName,
      gradeLevel,
      courseCode: curriculum.code,
      weeklyGoalMinutes,
    });
    const response = NextResponse.json({ ok: true });
    setActiveLearnerCookie(response, learner.id);
    return response;
  } catch (error) {
    const status = error instanceof SupabaseHttpError ? error.status : 500;
    return NextResponse.json({ error: 'Vi klarte ikke å lagre profilen. Prøv igjen.' }, { status });
  }
}
