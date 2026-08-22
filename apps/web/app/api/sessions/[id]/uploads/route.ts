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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Ugyldig økt-ID.' }, 400);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'Content-Type må være application/json.' }, 415);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Forespørselen må inneholde gyldig JSON.' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Ugyldig bildedata.' }, 400);
  }
  const source = body as Record<string, unknown>;
  if (
    Object.keys(source).some((key) => !['mimeType', 'byteSize'].includes(key)) ||
    typeof source.mimeType !== 'string' ||
    typeof source.byteSize !== 'number'
  ) {
    return json({ error: 'Ugyldig bildedata.' }, 400);
  }

  try {
    const { data } = await getAuthenticatedTutorData();
    const [session, uploads] = await Promise.all([
      data.getSession(id),
      data.listHomeworkUploads(id, 10),
    ]);
    if (!session) return json({ error: 'Økten finnes ikke.' }, 404);
    if (session.status === 'completed' || session.status === 'cancelled') {
      return json({ error: 'Økten er avsluttet.' }, 409);
    }
    if (uploads.filter((upload) => upload.status !== 'deleted').length >= 4) {
      return json({ error: 'Du kan legge til opptil fire bilder per økt.' }, 409);
    }
    const pageNumber =
      uploads.reduce((maximum, upload) => Math.max(maximum, upload.page_number), 0) + 1;
    if (session.status === 'planned') {
      await data.updateSession(id, { status: 'capturing' });
    }
    const prepared = await data.prepareHomeworkUpload(id, {
      mimeType: source.mimeType,
      byteSize: source.byteSize,
      pageNumber,
    });
    return json(
      {
        uploadId: prepared.upload.id,
        pageNumber: prepared.upload.page_number,
        signedUrl: prepared.signedUrl,
      },
      201,
    );
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Bildeopplastingen kunne ikke forberedes.' }, 503);
  }
}
