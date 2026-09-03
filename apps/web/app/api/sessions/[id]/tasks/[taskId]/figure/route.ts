import {
  getAuthenticatedTutorData,
  RequestAuthError,
} from '../../../../../../../lib/request-auth';
import {
  cropHomeworkFigure,
  homeworkFigureCrop,
} from '../../../../../../../lib/homework-figures';
import { TutorDataError } from '../../../../../../../lib/supabase/data';
import { isUuid } from '../../../../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params;
  if (!isUuid(id) || !isUuid(taskId))
    return json({ error: 'Ugyldig bildeforespørsel.' }, 400);

  try {
    const { data } = await getAuthenticatedTutorData({ requireBilling: true });
    const task = await data.getTask(taskId);
    if (!task || task.session_id !== id || !task.upload_id) {
      return json({ error: 'Illustrasjonen finnes ikke.' }, 404);
    }

    const crop = homeworkFigureCrop(task.figure_spec);
    if (!crop) return json({ error: 'Oppgaven har ingen illustrasjon.' }, 404);

    const upload = await data.getHomeworkUpload(task.upload_id);
    if (!upload || upload.session_id !== id) {
      return json({ error: 'Leksebildet finnes ikke.' }, 404);
    }

    const source = await data.downloadHomeworkObject(upload.storage_path);
    const result = await cropHomeworkFigure(source, crop);
    return new Response(Buffer.from(result) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'image/jpeg',
        'Content-Length': String(result.byteLength),
        'Content-Disposition': 'inline; filename="mattis-illustrasjon.jpg"',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    console.error('Homework figure could not be cropped', {
      reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    });
    return json({ error: 'Illustrasjonen kunne ikke vises.' }, 503);
  }
}
