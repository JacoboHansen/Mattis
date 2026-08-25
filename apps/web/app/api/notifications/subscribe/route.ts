import { getAuthenticatedTutorData, RequestAuthError } from '../../../../lib/request-auth';
import { TutorDataError } from '../../../../lib/supabase/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function validEndpoint(value: unknown): value is string {
  if (!validText(value, 2048)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function handleError(error: unknown) {
  if (error instanceof RequestAuthError || error instanceof TutorDataError) {
    return json({ error: error.message }, error.status);
  }
  return json({ error: 'Push-varslet kunne ikke lagres.' }, 503);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => undefined);
  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => !['endpoint', 'keys', 'userAgent'].includes(key))
  ) {
    return json({ error: 'Ugyldig push-abonnement.' }, 400);
  }
  const keys = body.keys;
  if (
    !isRecord(keys) ||
    !validEndpoint(body.endpoint) ||
    !validText(keys.p256dh, 256) ||
    !validText(keys.auth, 256)
  ) {
    return json({ error: 'Push-abonnementet mangler nødvendige nøkler.' }, 400);
  }
  if (body.userAgent !== undefined && body.userAgent !== null && !validText(body.userAgent, 256)) {
    return json({ error: 'Nettleserinformasjonen er ugyldig.' }, 400);
  }

  try {
    const { data } = await getAuthenticatedTutorData();
    await data.upsertPushSubscription({
      endpoint: body.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: typeof body.userAgent === 'string' ? body.userAgent : null,
    });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => undefined);
  if (!isRecord(body) || !validEndpoint(body.endpoint)) {
    return json({ error: 'Ugyldig push-abonnement.' }, 400);
  }
  try {
    const { data } = await getAuthenticatedTutorData();
    await data.deletePushSubscription(body.endpoint);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
