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

function parseNextTopic(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length > 300) {
    throw new TutorDataError('Notatet er for langt.', 400, 'invalid_input');
  }
  return value.trim() || null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Ugyldig økt-ID.' }, 400);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Ugyldig notat.' }, 400);
  }
  if (Object.keys(body).some((key) => key !== 'nextTopicNb')) {
    return json({ error: 'Ukjente notatfelter.' }, 400);
  }

  let nextTopicNb: string | null;
  try {
    nextTopicNb = parseNextTopic(body.nextTopicNb);
  } catch (error) {
    return error instanceof TutorDataError
      ? json({ error: error.message }, error.status)
      : json({ error: 'Notatet er ugyldig.' }, 400);
  }

  try {
    const { data } = await getAuthenticatedTutorData();
    const session = await data.getSession(id);
    if (!session) return json({ error: 'Økten finnes ikke.' }, 404);
    if (session.status === 'completed' || session.status === 'cancelled') {
      return json({ error: 'Økten er avsluttet.' }, 409);
    }

    const updated = await data.updateSession(id, { nextTopicNb });
    return json({ nextTopicNb: updated.next_topic_nb });
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Notatet kunne ikke lagres.' }, 503);
  }
}
