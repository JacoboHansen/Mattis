import { getAuthenticatedTutorData, RequestAuthError } from '../../../../../lib/request-auth';
import { TutorDataError } from '../../../../../lib/supabase/data';
import { isUuid } from '../../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function parseDuration(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== 'durationMinutes')
  ) {
    return null;
  }
  const durationMinutes = (value as Record<string, unknown>).durationMinutes;
  return typeof durationMinutes === 'number' && [25, 45, 60].includes(durationMinutes)
    ? durationMinutes
    : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Ugyldig økt-ID.' }, 400);
  const durationMinutes = parseDuration(await request.json().catch(() => undefined));
  if (durationMinutes === null) return json({ error: 'Velg 25, 45 eller 60 minutter.' }, 400);

  try {
    const { data } = await getAuthenticatedTutorData();
    const session = await data.getSession(id);
    if (!session) return json({ error: 'Økten finnes ikke.' }, 404);
    if (!['planned', 'capturing'].includes(session.status)) {
      return json({ error: 'Økten kan ikke endres nå.' }, 409);
    }
    const updated = await data.updateSession(id, { durationMinutes });
    return json({ durationMinutes: updated.duration_minutes });
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Økttiden kunne ikke lagres.' }, 503);
  }
}
