import {
  generateTutorImageTurn,
  generateTutorTurn,
  type TutorImageInput,
} from '../../../../lib/ai/provider';
import { isUuid } from '../../../../lib/uuid';
import { handleTutorRequest } from '../respond/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Images use the same history, lesson tools, safety checks and replay contract as text. */
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 2_100_000)
    return Response.json(
      { error: 'Bildet må være mindre enn 2 MB.' },
      { status: 413 },
    );
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: 'Bildet kunne ikke leses.' },
      { status: 400 },
    );
  }
  const sessionId = form.get('sessionId');
  const taskId = form.get('taskId');
  const clientMessageId = form.get('clientMessageId') ?? crypto.randomUUID();
  if (
    !isUuid(sessionId) ||
    !isUuid(clientMessageId) ||
    (taskId !== null && !isUuid(taskId))
  )
    return Response.json(
      { error: 'Ugyldig økt-, oppgave- eller meldings-ID.' },
      { status: 400 },
    );
  const file = form.get('image');
  if (
    !(file instanceof File) ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size <= 0 ||
    file.size > 2_000_000
  )
    return Response.json(
      { error: 'Bruk JPG, PNG eller WebP under 2 MB.' },
      { status: 400 },
    );
  const message =
    String(form.get('message') ?? '').trim() ||
    'Jeg har sendt et bilde av utregningen min.';
  const image: TutorImageInput = {
    bytes: new Uint8Array(await file.arrayBuffer()),
    mimeType: file.type as TutorImageInput['mimeType'],
  };
  return handleTutorRequest(
    new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        ...(taskId ? { taskId } : {}),
        clientMessageId,
        message,
      }),
    }),
    {
      responseFormat: 'api',
      attachmentMimeType: file.type,
      generate: (context) =>
        context.actionResults
          ? generateTutorTurn(context)
          : generateTutorImageTurn(context, image),
    },
  );
}
