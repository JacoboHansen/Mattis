import { getAuthenticatedTutorData, RequestAuthError } from '../../../../lib/request-auth';
import {
  generateTutorImageTurn,
  TutorProviderError,
  type TutorImageInput,
} from '../../../../lib/ai/provider';
import { TUTOR_REQUEST_SCHEMA_VERSION, type TutorRequest } from '../../../../lib/ai/contracts';
import { deriveTutorMessageId } from '../../../../lib/ai/message-id';
import { isUuid } from '../../../../lib/uuid';
import {
  persistTutorOutcome,
  responseForTutorResult,
  type TutorPersistence,
} from '../respond/route';
import { TutorDataError, type TutorTask } from '../../../../lib/supabase/data';
import { detectSafetySignal, recordSafetySignal } from '../../../../lib/safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 2_000_000;
const ACCEPTED_MIME_TYPES = new Set<TutorImageInput['mimeType']>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function requiredUuid(value: FormDataEntryValue | null, field: string) {
  if (typeof value !== 'string' || !isUuid(value)) {
    throw new TutorDataError(`${field} må være en gyldig UUID.`, 400, 'invalid_input');
  }
  return value;
}

function boundedMessage(value: FormDataEntryValue | null) {
  const message = typeof value === 'string' ? value.trim() : '';
  if (message.length > 1200) {
    throw new TutorDataError('Meldingen er for lang.', 400, 'invalid_input');
  }
  return message || 'Jeg har sendt et bilde av utregningen min.';
}

function learnerContext(
  profile: Awaited<ReturnType<TutorPersistence['getProfile']>>,
  mastery: Awaited<ReturnType<TutorPersistence['listMastery']>>,
) {
  return {
    gradeLevel: profile?.grade_level ?? null,
    courseCode: profile?.course_code ?? null,
    mastery: mastery.map((item) => ({
      conceptKey: item.concept_key,
      estimate: item.estimate,
      confidence: item.confidence,
      evidenceCount: item.evidence_count,
    })),
  };
}

function storageError(error: unknown) {
  if (error instanceof TutorDataError && error.status >= 400 && error.status < 500) {
    return jsonResponse({ error: error.message }, error.status);
  }
  return jsonResponse({ error: 'Bildet kunne ikke behandles akkurat nå.' }, 503);
}

export async function POST(request: Request) {
  let data: TutorPersistence;
  let authenticatedUser: Awaited<ReturnType<typeof getAuthenticatedTutorData>>['user'];
  let authenticatedLearner: Awaited<ReturnType<typeof getAuthenticatedTutorData>>['learner'];
  try {
    ({
      data,
      user: authenticatedUser,
      learner: authenticatedLearner,
    } = await getAuthenticatedTutorData({ requireBilling: true }));
  } catch (error) {
    if (error instanceof RequestAuthError)
      return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: 'Innlogging kunne ikke bekreftes.' }, 503);
  }

  let sessionId: string;
  let clientMessageId: string;
  let taskId: string | undefined;
  let message: string;
  let image: File;
  try {
    const form = await request.formData();
    sessionId = requiredUuid(form.get('sessionId'), 'sessionId');
    const candidateMessageId = form.get('clientMessageId');
    clientMessageId = candidateMessageId
      ? requiredUuid(candidateMessageId, 'clientMessageId')
      : crypto.randomUUID();
    const candidateTaskId = form.get('taskId');
    taskId = candidateTaskId ? requiredUuid(candidateTaskId, 'taskId') : undefined;
    message = boundedMessage(form.get('message'));
    const candidateImage = form.get('image');
    if (!(candidateImage instanceof File)) {
      throw new TutorDataError('Velg et bilde av utregningen først.', 400, 'invalid_image');
    }
    if (!ACCEPTED_MIME_TYPES.has(candidateImage.type as TutorImageInput['mimeType'])) {
      throw new TutorDataError('Bruk JPG, PNG eller WebP.', 400, 'invalid_image');
    }
    if (candidateImage.size <= 0 || candidateImage.size > MAX_IMAGE_BYTES) {
      throw new TutorDataError('Bildet må være mindre enn 2 MB.', 413, 'invalid_image');
    }
    image = candidateImage;
  } catch (error) {
    return storageError(error);
  }

  const tutorMessageId = deriveTutorMessageId(clientMessageId);
  let activeTask: TutorTask | null = null;
  try {
    const session = await data.getSession(sessionId);
    if (!session) return jsonResponse({ error: 'Økten finnes ikke.' }, 404);
    if (session.status === 'completed' || session.status === 'cancelled') {
      return jsonResponse({ error: 'Økten er avsluttet.' }, 409);
    }
    if (taskId) {
      activeTask = await data.getTask(taskId);
      if (!activeTask || activeTask.session_id !== session.id) {
        return jsonResponse({ error: 'Oppgaven finnes ikke i denne økten.' }, 404);
      }
    }

    const existingStudent = await data.findMessageByClientMessageId(clientMessageId);
    if (existingStudent) {
      if (existingStudent.session_id !== session.id || existingStudent.role !== 'student') {
        return jsonResponse({ error: 'Meldings-ID-en er allerede brukt i en annen økt.' }, 409);
      }
      const existingTutor = await data.findMessageByClientMessageId(tutorMessageId);
      if (existingTutor) {
        return jsonResponse({
          reply: existingTutor.content_nb,
          model: 'stored',
          mode: 'stored',
          taskState: 'in_progress',
          expectedStudentAction: 'none',
          suggestedActions: [],
        });
      }
      message = existingStudent.content_nb;
    } else {
      await data.appendMessage(sessionId, {
        role: 'student',
        contentNb: message,
        clientMessageId,
        taskId: taskId ?? null,
        metadata: { attachment: { type: 'image', mimeType: image.type } },
      });
    }

    const [storedMessages, profile, mastery] = await Promise.all([
      data.listMessages(sessionId, 100),
      data.getProfile(),
      data.listMastery(40),
    ]);
    const excludedIds = new Set([clientMessageId.toLowerCase(), tutorMessageId.toLowerCase()]);
    const history = storedMessages
      .filter(
        (item) =>
          (item.role === 'student' || item.role === 'tutor') &&
          (!item.client_message_id || !excludedIds.has(item.client_message_id.toLowerCase())),
      )
      .slice(-5)
      .map((item) => ({
        role: item.role as 'student' | 'tutor',
        content: item.content_nb.slice(0, 600),
      }));
    const tutorRequest: TutorRequest = {
      schemaVersion: TUTOR_REQUEST_SCHEMA_VERSION,
      sessionId,
      message,
      history,
      locale: profile?.locale ?? 'nb-NO',
      clientMessageId,
      ...(activeTask
        ? {
            taskId: activeTask.id,
            taskText: activeTask.normalized_text,
            taskTopic: activeTask.concept_keys.join(', ') || activeTask.task_type,
          }
        : {}),
      learnerContext: learnerContext(profile, mastery),
    };
    const startedAt = Date.now();
    const result = await generateTutorImageTurn(tutorRequest, {
      bytes: new Uint8Array(await image.arrayBuffer()),
      mimeType: image.type as TutorImageInput['mimeType'],
    });
    const safetySignal = detectSafetySignal(message, result.response);
    const tutorMessage = await data.appendMessage(sessionId, {
      role: 'tutor',
      contentNb: result.response.assistantMessageNb,
      clientMessageId: tutorMessageId,
      taskId: activeTask?.id ?? null,
      intent: result.response.intent,
      metadata: { tutorTurn: result.response },
    });
    await persistTutorOutcome(data, sessionId, activeTask, tutorMessage.id, result.response);
    await data
      .recordAiGeneration({
        capability: 'tutor',
        provider: result.provider,
        model: result.model,
        requestSchemaVersion: TUTOR_REQUEST_SCHEMA_VERSION,
        responseSchemaVersion: result.response.schemaVersion,
        status: 'succeeded',
        sessionId,
        taskId: activeTask?.id ?? null,
        latencyMs: Date.now() - startedAt,
        inputUnits: result.usage?.inputTokens ?? null,
        outputUnits: result.usage?.outputTokens ?? null,
        safetyFlags: result.response.safetyFlags,
      })
      .catch(() => undefined);
    if (safetySignal) {
      await recordSafetySignal({
        userId: authenticatedUser.id,
        learnerId: authenticatedLearner.id,
        sessionId,
        parentEmail: authenticatedUser.email,
        signal: safetySignal,
      }).catch((error) => {
        console.error('Safety signal could not be recorded', {
          code: error instanceof Error ? error.message : 'unknown',
        });
      });
    }
    return responseForTutorResult(result, 'api', safetySignal);
  } catch (error) {
    if (error instanceof TutorProviderError) {
      console.error('Tutor image response unavailable', { code: error.code, model: 'image' });
      return jsonResponse(
        {
          error:
            'Det skjedde en teknisk feil mens Mattis prøvde å lese bildet. Bildet er ikke lagret som bilde. Prøv igjen.',
        },
        503,
      );
    }
    return storageError(error);
  }
}
