import {
  getAuthenticatedTutorData,
  RequestAuthError,
} from '../../../../../lib/request-auth';
import { TutorDataError } from '../../../../../lib/supabase/data';
import { isUuid } from '../../../../../lib/uuid';
import { reviseSessionTimeline } from '../../../../../lib/planning/session-plan';

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
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return json({ error: 'Planen er ugyldig.' }, 400);
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['planConfirmed', 'change'].includes(key),
    ) ||
    (input.planConfirmed !== true && typeof input.change !== 'string')
  ) {
    return json({ error: 'Planen må bekreftes eller endres.' }, 400);
  }
  const change =
    typeof input.change === 'string' ? input.change.trim().slice(0, 240) : '';
  if (input.change !== undefined && !change) {
    return json({ error: 'Skriv kort hva du vil endre.' }, 400);
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
    const currentPlan = session.plan_snapshot as Record<string, unknown>;
    const currentTimeline = Array.isArray(currentPlan.timeline)
      ? currentPlan.timeline
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === 'object' && !Array.isArray(item),
          )
          .filter(
            (item) =>
              typeof item.id === 'string' &&
              typeof item.label === 'string' &&
              typeof item.phase === 'string' &&
              typeof item.minutes === 'number',
          )
          .map((item) => ({
            id: item.id as string,
            label: item.label as string,
            phase: item.phase as
              'intro' | 'homework' | 'repetition' | 'summary',
            minutes: item.minutes as number,
            ...(typeof item.segmentType === 'string'
              ? {
                  segmentType: item.segmentType as
                    | 'intro'
                    | 'homework'
                    | 'review'
                    | 'new_topic'
                    | 'mixed'
                    | 'summary',
                }
              : {}),
            ...(typeof item.conceptKey === 'string'
              ? { conceptKey: item.conceptKey as never }
              : {}),
          }))
      : [];
    const plan = {
      ...currentPlan,
      ...(change
        ? {
            timeline: reviseSessionTimeline(currentTimeline, change),
            planConfirmed: false,
            planRevisionNb: change,
          }
        : { planConfirmed: true }),
    };
    await data.updateSession(id, { planSnapshot: plan });
    return json({ planConfirmed: plan.planConfirmed, plan });
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Planen kunne ikke lagres.' }, 503);
  }
}
