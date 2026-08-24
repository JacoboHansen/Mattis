import { cookies } from 'next/headers';

import type { Json } from '../../../lib/database.types';
import { ACCESS_COOKIE } from '../../../lib/auth-cookies';
import { getAuthUser, SupabaseHttpError, type AuthUser } from '../../../lib/supabase-http';
import {
  createTutorDataClient,
  TutorDataError,
  type CreateTutorSessionInput,
  type TutorDataClient,
} from '../../../lib/supabase/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SessionDependencies = {
  accessToken?: string | null;
  authenticate?: (accessToken: string) => Promise<AuthUser>;
  createDataClient?: (
    accessToken: string,
    userId: string,
  ) => Pick<TutorDataClient, 'createSession' | 'appendMessage'>;
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function accessToken(dependencies: SessionDependencies) {
  if (dependencies.accessToken !== undefined) return dependencies.accessToken;
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_COOKIE)?.value ?? null;
}

function parsePlanSnapshot(value: unknown): Json | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TutorDataError('Øktplanen er ugyldig.', 400, 'invalid_input');
  }
  const source = value as Record<string, unknown>;
  const allowedKeys = [
    'version',
    'mode',
    'openingNb',
    'reasonNb',
    'previousNextTopicNb',
    'focusConcepts',
    'homeworkMinutes',
    'repetitionMinutes',
    'summaryMinutes',
    'timeline',
  ];
  if (Object.keys(source).some((key) => !allowedKeys.includes(key))) {
    throw new TutorDataError('Øktplanen inneholder ukjente felter.', 400, 'invalid_input');
  }
  const stringFields = ['version', 'openingNb', 'reasonNb', 'previousNextTopicNb'] as const;
  for (const key of stringFields) {
    const field = source[key];
    if (field !== undefined && field !== null && typeof field !== 'string') {
      throw new TutorDataError('Øktplanen er ugyldig.', 400, 'invalid_input');
    }
  }
  if (
    source.mode !== undefined &&
    source.mode !== 'suggested' &&
    source.mode !== 'homework' &&
    source.mode !== 'custom'
  ) {
    throw new TutorDataError('Øktplanen har en ugyldig modus.', 400, 'invalid_input');
  }
  if (
    source.focusConcepts !== undefined &&
    (!Array.isArray(source.focusConcepts) ||
      source.focusConcepts.length > 8 ||
      source.focusConcepts.some((value) => typeof value !== 'string'))
  ) {
    throw new TutorDataError('Øktplanens fokus er ugyldig.', 400, 'invalid_input');
  }
  const numericFields = ['homeworkMinutes', 'repetitionMinutes', 'summaryMinutes'] as const;
  for (const key of numericFields) {
    const field = source[key];
    if (
      field !== undefined &&
      (typeof field !== 'number' || !Number.isInteger(field) || field < 0 || field > 180)
    ) {
      throw new TutorDataError('Øktplanens tidsbruk er ugyldig.', 400, 'invalid_input');
    }
  }
  if (
    source.timeline !== undefined &&
    (!Array.isArray(source.timeline) ||
      source.timeline.length > 8 ||
      source.timeline.some((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
        const value = item as Record<string, unknown>;
        return (
          typeof value.id !== 'string' ||
          typeof value.label !== 'string' ||
          typeof value.phase !== 'string' ||
          !['homework', 'repetition', 'summary'].includes(value.phase) ||
          typeof value.minutes !== 'number' ||
          !Number.isInteger(value.minutes) ||
          value.minutes < 0 ||
          value.minutes > 180 ||
          (value.segmentType !== undefined &&
            (typeof value.segmentType !== 'string' ||
              !['homework', 'review', 'new_topic', 'mixed', 'summary'].includes(
                value.segmentType,
              ))) ||
          (value.conceptKey !== undefined && typeof value.conceptKey !== 'string')
        );
      }))
  ) {
    throw new TutorDataError('Øktplanens tidslinje er ugyldig.', 400, 'invalid_input');
  }
  return {
    ...(typeof source.version === 'string' ? { version: source.version.slice(0, 80) } : {}),
    ...(typeof source.mode === 'string' ? { mode: source.mode } : {}),
    ...(typeof source.openingNb === 'string'
      ? { openingNb: source.openingNb.trim().slice(0, 8000) }
      : {}),
    ...(typeof source.reasonNb === 'string'
      ? { reasonNb: source.reasonNb.trim().slice(0, 300) }
      : {}),
    ...(typeof source.previousNextTopicNb === 'string'
      ? { previousNextTopicNb: source.previousNextTopicNb.trim().slice(0, 300) }
      : {}),
    ...(Array.isArray(source.focusConcepts)
      ? {
          focusConcepts: source.focusConcepts.map((value) =>
            (value as string).trim().slice(0, 120),
          ),
        }
      : {}),
    ...(typeof source.homeworkMinutes === 'number'
      ? { homeworkMinutes: source.homeworkMinutes }
      : {}),
    ...(typeof source.repetitionMinutes === 'number'
      ? { repetitionMinutes: source.repetitionMinutes }
      : {}),
    ...(typeof source.summaryMinutes === 'number' ? { summaryMinutes: source.summaryMinutes } : {}),
    ...(Array.isArray(source.timeline)
      ? {
          timeline: source.timeline.slice(0, 8).map((item) => {
            const value = item as Record<string, unknown>;
            return {
              id: (value.id as string).trim().slice(0, 80),
              label: (value.label as string).trim().slice(0, 120),
              phase: value.phase as string,
              minutes: value.minutes as number,
              ...(typeof value.segmentType === 'string'
                ? { segmentType: value.segmentType.slice(0, 40) }
                : {}),
              ...(typeof value.conceptKey === 'string'
                ? { conceptKey: value.conceptKey.trim().slice(0, 120) }
                : {}),
            };
          }),
        }
      : {}),
  } as Json;
}

function parseInput(value: unknown): CreateTutorSessionInput {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value))
    throw new TutorDataError('Ugyldig økt-data.', 400, 'invalid_input');
  const source = value as Record<string, unknown>;
  if (
    Object.keys(source).some(
      (key) =>
        ![
          'durationMinutes',
          'plannedAt',
          'startImmediately',
          'openingMessageNb',
          'planSnapshot',
        ].includes(key),
    )
  ) {
    throw new TutorDataError('Ukjente økt-felter.', 400, 'invalid_input');
  }
  if (source.durationMinutes !== undefined && typeof source.durationMinutes !== 'number') {
    throw new TutorDataError('durationMinutes må være et tall.', 400, 'invalid_input');
  }
  if (
    source.plannedAt !== undefined &&
    source.plannedAt !== null &&
    typeof source.plannedAt !== 'string'
  ) {
    throw new TutorDataError('plannedAt er ugyldig.', 400, 'invalid_input');
  }
  if (source.startImmediately !== undefined && typeof source.startImmediately !== 'boolean') {
    throw new TutorDataError('startImmediately må være true eller false.', 400, 'invalid_input');
  }
  if (
    source.openingMessageNb !== undefined &&
    source.openingMessageNb !== null &&
    (typeof source.openingMessageNb !== 'string' || source.openingMessageNb.trim().length > 8000)
  ) {
    throw new TutorDataError('Startmeldingen er ugyldig.', 400, 'invalid_input');
  }
  return {
    ...(typeof source.durationMinutes === 'number'
      ? { durationMinutes: source.durationMinutes }
      : {}),
    ...(source.plannedAt === null || typeof source.plannedAt === 'string'
      ? { plannedAt: source.plannedAt }
      : {}),
    ...(typeof source.startImmediately === 'boolean'
      ? { startImmediately: source.startImmediately }
      : {}),
    ...(typeof source.openingMessageNb === 'string'
      ? { openingMessageNb: source.openingMessageNb.trim() || null }
      : {}),
    ...(source.planSnapshot !== undefined
      ? { planSnapshot: parsePlanSnapshot(source.planSnapshot) }
      : {}),
  };
}

export async function handleCreateSession(
  request: Request,
  dependencies: SessionDependencies = {},
) {
  const token = await accessToken(dependencies);
  if (!token) return jsonResponse({ error: 'Du må være innlogget.' }, 401);

  let user: AuthUser;
  try {
    user = await (dependencies.authenticate ?? getAuthUser)(token);
  } catch (error) {
    if (error instanceof SupabaseHttpError && error.status === 401) {
      return jsonResponse({ error: 'Innloggingen er utløpt.' }, 401);
    }
    return jsonResponse({ error: 'Innlogging kunne ikke bekreftes.' }, 503);
  }

  let input: CreateTutorSessionInput;
  try {
    const body = await request.json().catch(() => undefined);
    input = parseInput(body);
  } catch (error) {
    return error instanceof TutorDataError
      ? jsonResponse({ error: error.message }, error.status)
      : jsonResponse({ error: 'Ugyldig økt-data.' }, 400);
  }

  try {
    const client = (
      dependencies.createDataClient ??
      ((access, id) => createTutorDataClient({ accessToken: access, userId: id }))
    )(token, user.id);
    const session = await client.createSession(input);
    if (input.openingMessageNb?.trim()) {
      await client.appendMessage(session.id, {
        role: 'tutor',
        contentNb: input.openingMessageNb.trim(),
        clientMessageId: crypto.randomUUID(),
      });
    }
    return jsonResponse({ id: session.id }, 201);
  } catch (error) {
    if (error instanceof TutorDataError && error.status >= 400 && error.status < 500) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: 'Økten kunne ikke lagres.' }, 503);
  }
}

export async function POST(request: Request) {
  return handleCreateSession(request);
}
