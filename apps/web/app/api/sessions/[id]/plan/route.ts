import {
  getAuthenticatedTutorData,
  RequestAuthError,
} from '../../../../../lib/request-auth';
import { TutorDataError } from '../../../../../lib/supabase/data';
import { isUuid } from '../../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Ugyldig økt-ID.' }, 400);
  const body = await request.json().catch(() => undefined);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== 'planConfirmed') ||
    (body as Record<string, unknown>).planConfirmed !== true
  ) {
    return json({ error: 'Planen må bekreftes.' }, 400);
  }

  try {
    const { data } = await getAuthenticatedTutorData({ requireBilling: true });
    const session = await data.getSession(id);
    if (!session) return json({ error: 'Økten finnes ikke.' }, 404);
    if (session.status !== 'active')
      return json({ error: 'Økten er ikke aktiv.' }, 409);
    if (
      !session.plan_snapshot ||
      typeof session.plan_snapshot !== 'object' ||
      Array.isArray(session.plan_snapshot)
    ) {
      return json({ error: 'Økten mangler en plan.' }, 409);
    }
    const plan = {
      ...(session.plan_snapshot as Record<string, unknown>),
      planConfirmed: true,
    };
    await data.updateSession(id, { planSnapshot: plan });
    return json({ planConfirmed: true });
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Planen kunne ikke lagres.' }, 503);
  }
}
