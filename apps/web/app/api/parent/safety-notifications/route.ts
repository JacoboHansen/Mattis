import {
  getAuthenticatedParent,
  RequestAuthError,
} from '../../../../lib/request-auth';
import { ageBandForGrade } from '../../../../lib/learner-profile';
import {
  getParentSafetyPreference,
  setParentSafetyPreference,
} from '../../../../lib/safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET() {
  try {
    const parent = await getAuthenticatedParent();
    const preference = await getParentSafetyPreference(
      parent.accessToken,
      parent.user.id,
    );
    const hasUnder12 = parent.learners.some(
      (learner) =>
        (learner.age_band ?? ageBandForGrade(learner.grade_level)) ===
        'under_12',
    );
    return jsonResponse({ enabled: preference.enabled || hasUnder12 });
  } catch (error) {
    if (error instanceof RequestAuthError)
      return jsonResponse({ error: error.message }, error.status);
    return jsonResponse(
      { error: 'Varslingsinnstillingen kunne ikke hentes.' },
      503,
    );
  }
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Ugyldig forespørsel.' }, 400);
  }
  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as { enabled?: unknown }).enabled !== 'boolean'
  ) {
    return jsonResponse({ error: 'enabled må være true eller false.' }, 400);
  }

  try {
    const parent = await getAuthenticatedParent();
    const hasUnder12 = parent.learners.some(
      (learner) =>
        (learner.age_band ?? ageBandForGrade(learner.grade_level)) ===
        'under_12',
    );
    const preference = await setParentSafetyPreference(
      parent.accessToken,
      parent.user.id,
      (body as { enabled: boolean }).enabled || hasUnder12,
    );
    return jsonResponse({ enabled: preference.enabled });
  } catch (error) {
    if (error instanceof RequestAuthError)
      return jsonResponse({ error: error.message }, error.status);
    return jsonResponse(
      { error: 'Varslingsinnstillingen kunne ikke lagres.' },
      503,
    );
  }
}
