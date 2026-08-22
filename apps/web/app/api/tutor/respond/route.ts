import { cookies } from 'next/headers';

import { ACCESS_COOKIE } from '../../../../lib/auth-cookies';
import { getAuthUser, SupabaseHttpError, type AuthUser } from '../../../../lib/supabase-http';
import {
  createTutorDataClient,
  TutorDataError,
  type TutorDataClient,
} from '../../../../lib/supabase/data';
import { generateTutorTurn } from '../../../../lib/ai/provider';
import { parseTutorRequest, type TutorRequest } from '../../../../lib/ai/contracts';
import { deriveTutorMessageId } from '../../../../lib/ai/message-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 100_000;

type TutorRouteDependencies = {
  accessToken?: string | null;
  authenticate?: (accessToken: string) => Promise<AuthUser>;
  generate?: (request: TutorRequest) => ReturnType<typeof generateTutorTurn>;
  responseFormat?: 'contract' | 'api';
  dataClient?: TutorPersistence;
  createDataClient?: (accessToken: string, userId: string) => TutorPersistence;
};

export type TutorPersistence = Pick<
  TutorDataClient,
  | 'getSession'
  | 'listMessages'
  | 'findMessageByClientMessageId'
  | 'appendMessage'
  | 'recordAiGeneration'
>;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function getAccessToken(dependencies: TutorRouteDependencies) {
  if (dependencies.accessToken !== undefined) return dependencies.accessToken;
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_COOKIE)?.value ?? null;
}

export async function handleTutorRequest(
  request: Request,
  dependencies: TutorRouteDependencies = {},
) {
  const accessToken = await getAccessToken(dependencies);
  if (!accessToken) return jsonResponse({ error: 'Du må være innlogget.' }, 401);

  let user: AuthUser;
  try {
    const authenticate = dependencies.authenticate ?? getAuthUser;
    user = await authenticate(accessToken);
    if (!user.id) return jsonResponse({ error: 'Innloggingen mangler bruker-ID.' }, 503);
  } catch (error) {
    if (error instanceof SupabaseHttpError && error.status === 401) {
      return jsonResponse({ error: 'Innloggingen er utløpt.' }, 401);
    }
    return jsonResponse({ error: 'Innlogging kunne ikke bekreftes.' }, 503);
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Forespørselen er for stor.' }, 413);
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return jsonResponse({ error: 'Content-Type må være application/json.' }, 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Forespørselen må inneholde gyldig JSON.' }, 400);
  }
  const parsed = parseTutorRequest(body);
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);

  if (!parsed.value.sessionId) {
    return jsonResponse({ error: 'sessionId er påkrevd for å lagre tutorøkten.' }, 400);
  }

  const data =
    dependencies.dataClient ??
    (
      dependencies.createDataClient ??
      ((access, id) => createTutorDataClient({ accessToken: access, userId: id }))
    )(accessToken, user.id);
  const clientMessageId = parsed.value.clientMessageId ?? crypto.randomUUID();
  const tutorMessageId = deriveTutorMessageId(clientMessageId);
  let tutorRequest = parsed.value;
  try {
    const session = await data.getSession(parsed.value.sessionId);
    if (!session) return jsonResponse({ error: 'Økten finnes ikke.' }, 404);

    const existingStudent = await data.findMessageByClientMessageId(clientMessageId);
    if (existingStudent) {
      if (existingStudent.session_id !== session.id || existingStudent.role !== 'student') {
        return jsonResponse({ error: 'Meldings-ID-en er allerede brukt i en annen økt.' }, 409);
      }
      const existingTutorMessage = await data.findMessageByClientMessageId(tutorMessageId);
      if (existingTutorMessage) {
        if (
          existingTutorMessage.session_id !== session.id ||
          existingTutorMessage.role !== 'tutor'
        ) {
          return jsonResponse({ error: 'Meldings-ID-en er allerede brukt i en annen økt.' }, 409);
        }
        return responseForStoredTutorMessage(
          existingTutorMessage.content_nb,
          dependencies.responseFormat,
        );
      }
    }

    if (session.status === 'completed' || session.status === 'cancelled') {
      return jsonResponse({ error: 'Økten er avsluttet.' }, 409);
    }

    const studentContent = existingStudent?.content_nb ?? parsed.value.message;
    if (!existingStudent) {
      await data.appendMessage(parsed.value.sessionId, {
        role: 'student',
        contentNb: studentContent,
        clientMessageId,
        taskId: parsed.value.taskId ?? null,
      });
    }

    const storedMessages = await data.listMessages(parsed.value.sessionId, 100);
    const excludedIds = new Set([clientMessageId.toLowerCase(), tutorMessageId.toLowerCase()]);
    const history = storedMessages
      .filter((message) => message.role === 'student' || message.role === 'tutor')
      .filter(
        (message) =>
          !message.client_message_id || !excludedIds.has(message.client_message_id.toLowerCase()),
      )
      .slice(-11)
      .map((message) => ({
        role: message.role as 'student' | 'tutor',
        content: message.content_nb,
      }));

    tutorRequest = {
      ...parsed.value,
      message: studentContent,
      history,
      clientMessageId,
    };
  } catch (error) {
    return storageErrorResponse(error, 'Elevmeldingen kunne ikke lagres.');
  }

  const generate = dependencies.generate ?? generateTutorTurn;
  const startedAt = Date.now();
  const result = await generate(tutorRequest);
  try {
    await data.appendMessage(parsed.value.sessionId, {
      role: 'tutor',
      contentNb: result.response.assistantMessageNb,
      clientMessageId: tutorMessageId,
      taskId: parsed.value.taskId ?? null,
      intent: result.response.intent,
    });
    await data.recordAiGeneration({
      capability: 'tutor',
      provider: result.provider,
      model: result.model,
      requestSchemaVersion: parsed.value.schemaVersion,
      responseSchemaVersion: result.response.schemaVersion,
      status: 'succeeded',
      sessionId: parsed.value.sessionId,
      taskId: parsed.value.taskId ?? null,
      latencyMs: Date.now() - startedAt,
      inputUnits: result.usage?.inputTokens ?? null,
      outputUnits: result.usage?.outputTokens ?? null,
      safetyFlags: result.response.safetyFlags,
    });
  } catch (error) {
    return storageErrorResponse(error, 'Tutor-svaret ble laget, men kunne ikke lagres.');
  }
  return responseForTutorResult(result, dependencies.responseFormat);
}

function responseForTutorResult(
  result: Awaited<ReturnType<typeof generateTutorTurn>>,
  responseFormat: TutorRouteDependencies['responseFormat'],
) {
  if (responseFormat === 'api') {
    return jsonResponse({
      reply: result.response.assistantMessageNb,
      model: result.model,
      mode: result.provider === 'gateway' ? 'gateway' : 'fallback',
      ...(result.usage ? { usage: result.usage } : {}),
    });
  }
  return jsonResponse(result.response);
}

function responseForStoredTutorMessage(
  content: string,
  responseFormat: TutorRouteDependencies['responseFormat'],
) {
  if (responseFormat === 'api') {
    return jsonResponse({ reply: content, model: 'stored', mode: 'fallback' });
  }
  return jsonResponse({
    schemaVersion: 'tutor-turn.v0.1',
    assistantMessageNb: content,
    intent: 'feedback',
    taskState: 'in_progress',
    expectedStudentAction: 'none',
    hintLevel: 0,
    confidence: 0.5,
    learningEvidence: [],
    safetyFlags: ['none'],
  });
}

function storageErrorResponse(error: unknown, fallback: string) {
  if (error instanceof TutorDataError && error.status >= 400 && error.status < 500) {
    return jsonResponse({ error: error.message }, error.status);
  }
  return jsonResponse({ error: fallback }, 503);
}

export async function POST(request: Request) {
  return handleTutorRequest(request);
}
