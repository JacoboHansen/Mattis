import { parseTutorApiRequest, tutorApiRequestToTutorRequest } from '../../../lib/ai/contracts';
import { handleTutorRequest } from './respond/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // Parse the public API shape before handing the normalized request to the shared route.
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return Response.json({ error: 'Forespørselen må inneholde gyldig JSON.' }, { status: 400 });
  }
  const parsed = parseTutorApiRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const normalizedRequest = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(tutorApiRequestToTutorRequest(parsed.value)),
  });
  return handleTutorRequest(normalizedRequest, { responseFormat: 'api' });
}
