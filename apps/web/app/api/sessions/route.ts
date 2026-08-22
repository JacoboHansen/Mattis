import { cookies } from 'next/headers';

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
  ) => Pick<TutorDataClient, 'createSession'>;
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

function parseInput(value: unknown): CreateTutorSessionInput {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value))
    throw new TutorDataError('Ugyldig økt-data.', 400, 'invalid_input');
  const source = value as Record<string, unknown>;
  if (
    Object.keys(source).some(
      (key) => !['durationMinutes', 'plannedAt', 'startImmediately'].includes(key),
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
