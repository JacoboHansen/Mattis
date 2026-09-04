import { createHash } from 'node:crypto';

import {
  HOMEWORK_REQUEST_SCHEMA_VERSION,
  HOMEWORK_RESPONSE_SCHEMA_VERSION,
  DEFAULT_HOMEWORK_MODEL,
  HomeworkParserError,
  MAX_HOMEWORK_IMAGES,
  parseHomeworkImages,
  type HomeworkImageInput,
} from '../../../../../../lib/ai/homework-parser';
import {
  getAuthenticatedTutorData,
  RequestAuthError,
} from '../../../../../../lib/request-auth';
import {
  TutorDataError,
  type TutorDataClient,
} from '../../../../../../lib/supabase/data';
import { isUuid } from '../../../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function parseUploadIds(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    Object.keys(source).some((key) => key !== 'uploadIds') ||
    !Array.isArray(source.uploadIds)
  ) {
    return null;
  }
  const ids = [...new Set(source.uploadIds)];
  if (
    ids.length < 1 ||
    ids.length > MAX_HOMEWORK_IMAGES ||
    ids.some((id) => typeof id !== 'string' || !isUuid(id))
  ) {
    return null;
  }
  return ids as string[];
}

async function markUploads(
  data: TutorDataClient,
  uploadIds: string[],
  status: 'uploaded' | 'processing' | 'parsed' | 'failed',
) {
  await Promise.all(
    uploadIds.map((uploadId) =>
      data.updateHomeworkUpload(uploadId, { status }),
    ),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Ugyldig økt-ID.' }, 400);
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    return json({ error: 'Content-Type må være application/json.' }, 415);
  }
  const uploadIds = parseUploadIds(await request.json().catch(() => undefined));
  if (!uploadIds) {
    return json(
      {
        error: `Velg mellom ett og ${MAX_HOMEWORK_IMAGES} gyldige leksebilder.`,
      },
      400,
    );
  }

  let data: TutorDataClient | undefined;
  try {
    ({ data } = await getAuthenticatedTutorData({ requireBilling: true }));
    const [session, profile, uploads] = await Promise.all([
      data.getSession(id),
      data.getProfile(),
      Promise.all(
        uploadIds.map((uploadId) => data!.getHomeworkUpload(uploadId)),
      ),
    ]);
    if (!session) return json({ error: 'Økten finnes ikke.' }, 404);
    if (session.status === 'completed' || session.status === 'cancelled') {
      return json({ error: 'Økten er avsluttet.' }, 409);
    }
    if (
      uploads.some(
        (upload) =>
          !upload ||
          upload.session_id !== id ||
          !['prepared', 'uploaded', 'parsed'].includes(upload.status),
      )
    ) {
      return json({ error: 'Ett av bildene hører ikke til denne økten.' }, 409);
    }
    const readyUploads = uploads.filter((upload) => upload !== null);
    if (readyUploads.every((upload) => upload.status === 'parsed')) {
      const storedTasks = await data.listTasks(id, 100);
      return json({
        taskCount: storedTasks.filter((task) =>
          uploadIds.includes(task.upload_id ?? ''),
        ).length,
      });
    }

    await data.updateSession(id, { status: 'parsing' });
    await markUploads(data, uploadIds, 'processing');
    const images: HomeworkImageInput[] = await Promise.all(
      readyUploads.map(async (upload) => {
        const bytes = await data!.downloadHomeworkObject(upload.storage_path);
        if (bytes.byteLength < 1 || bytes.byteLength > 6_291_456) {
          throw new TutorDataError(
            'Et leksebilde har ugyldig størrelse.',
            400,
            'invalid_image',
          );
        }
        await data!.updateHomeworkUpload(upload.id, {
          status: 'processing',
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
        return {
          bytes,
          mimeType: upload.mime_type as HomeworkImageInput['mimeType'],
          pageNumber: upload.page_number,
        };
      }),
    );

    const startedAt = Date.now();
    const parsed = await parseHomeworkImages(images, {
      gradeLevel: profile?.grade_level ?? null,
      courseCode: profile?.course_code ?? null,
    });
    const tasks = await data.createTasks(
      id,
      parsed.tasks.map((task) => ({
        sourceText: task.sourceText,
        normalizedText: task.normalizedText,
        sourceLabel: task.sourceLabel,
        taskType: task.taskType,
        conceptKeys: task.conceptKeys,
        figureSpec: task.figureSpec,
        parseConfidence: task.confidence,
        uploadId:
          readyUploads.find((upload) => upload.page_number === task.pageNumber)
            ?.id ?? readyUploads[0]!.id,
        phase: 'homework',
        origin: 'image',
        estimatedMinutes: task.estimatedMinutes,
        status: 'detected',
      })),
    );
    await Promise.all([
      markUploads(data, uploadIds, 'parsed'),
      data.updateSession(id, { status: 'reviewing', currentPhase: 'homework' }),
      data
        .recordAiGeneration({
          capability: 'homework_parser',
          provider: parsed.provider,
          model: parsed.model,
          requestSchemaVersion: HOMEWORK_REQUEST_SCHEMA_VERSION,
          responseSchemaVersion: HOMEWORK_RESPONSE_SCHEMA_VERSION,
          status: 'succeeded',
          sessionId: id,
          latencyMs: Date.now() - startedAt,
          inputUnits: parsed.usage?.inputTokens ?? null,
          outputUnits: parsed.usage?.outputTokens ?? null,
        })
        .catch(() => undefined),
    ]);
    return json({ taskCount: tasks.length }, 201);
  } catch (error) {
    if (error instanceof HomeworkParserError) {
      // Keep production diagnostics free of student content and image data.
      console.error('Homework parser failed', {
        code: error.code,
        reason: error.message.slice(0, 120),
        gatewayStatus: error.statusCode ?? null,
        gatewayCode: error.gatewayCode ?? null,
        gatewayMessage: error.gatewayMessage ?? null,
      });
    }
    if (data) {
      await Promise.all([
        markUploads(data, uploadIds, 'failed').catch(() => undefined),
        data.updateSession(id, { status: 'capturing' }).catch(() => undefined),
        data
          .recordAiGeneration({
            capability: 'homework_parser',
            provider: 'gateway',
            model:
              process.env.MATTIS_HOMEWORK_MODEL?.trim() ||
              DEFAULT_HOMEWORK_MODEL,
            requestSchemaVersion: HOMEWORK_REQUEST_SCHEMA_VERSION,
            responseSchemaVersion: HOMEWORK_RESPONSE_SCHEMA_VERSION,
            status: 'failed',
            sessionId: id,
          })
          .catch(() => undefined),
      ]);
    }
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof HomeworkParserError) {
      return json(
        {
          error:
            error.code === 'invalid_output'
              ? 'Jeg fant ingen tydelige oppgaver. Prøv et skarpere bilde med hele arket.'
              : 'Leksebildene kunne ikke tolkes akkurat nå. Prøv igjen.',
        },
        error.code === 'invalid_output' ? 422 : 503,
      );
    }
    return json({ error: 'Leksebildene kunne ikke behandles.' }, 503);
  }
}
