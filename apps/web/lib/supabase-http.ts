import type { Database } from './database.types';

type Fetcher = typeof fetch;
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type LearnerProfileRow = Database['public']['Tables']['learner_profiles']['Row'];

export type LearnerProfile = LearnerProfileRow;

export type AuthUser = {
  id: string;
  email?: string;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
};

export class SupabaseHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'SupabaseHttpError';
  }
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new SupabaseHttpError('Supabase er ikke konfigurert.', 503, 'missing_config');
  }

  return { url, publishableKey };
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => ({}));
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

function errorMessage(payload: Record<string, unknown>) {
  const candidates = [payload.msg, payload.message, payload.error_description, payload.error];
  return candidates.find((value): value is string => typeof value === 'string') ?? 'Ukjent feil';
}

async function supabaseRequest(
  path: string,
  init: RequestInit,
  accessToken?: string,
  fetcher: Fetcher = fetch,
) {
  const { url, publishableKey } = getConfig();
  const response = await fetcher(`${url}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken ?? publishableKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await readPayload(response);

  if (!response.ok) {
    throw new SupabaseHttpError(
      errorMessage(payload),
      response.status,
      typeof payload.code === 'string' ? payload.code : undefined,
    );
  }

  return payload;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isAllowedEmail(value: string) {
  const email = normalizeEmail(value);
  const allowed = (process.env.MATTIS_ALLOWED_EMAILS ?? '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);

  return /^\S+@\S+\.\S+$/.test(email) && email.length <= 254 && allowed.includes(email);
}

export function isValidOtp(value: string) {
  return /^\d{6}$/.test(value);
}

export async function requestEmailOtp(email: string, fetcher: Fetcher = fetch) {
  await supabaseRequest(
    '/auth/v1/otp',
    {
      method: 'POST',
      body: JSON.stringify({
        email: normalizeEmail(email),
        data: { display_name: 'Nora' },
        create_user: true,
      }),
    },
    undefined,
    fetcher,
  );
}

function parseSession(payload: Record<string, unknown>): AuthSession {
  const source =
    payload.session && typeof payload.session === 'object'
      ? (payload.session as Record<string, unknown>)
      : payload;
  const userSource =
    payload.user && typeof payload.user === 'object'
      ? (payload.user as Record<string, unknown>)
      : source.user && typeof source.user === 'object'
        ? (source.user as Record<string, unknown>)
        : {};

  if (
    typeof source.access_token !== 'string' ||
    typeof source.refresh_token !== 'string' ||
    typeof userSource.id !== 'string'
  ) {
    throw new SupabaseHttpError('Ugyldig svar fra innloggingstjenesten.', 502, 'invalid_session');
  }

  return {
    access_token: source.access_token,
    refresh_token: source.refresh_token,
    expires_in: typeof source.expires_in === 'number' ? source.expires_in : 3600,
    user: {
      id: userSource.id,
      email: typeof userSource.email === 'string' ? userSource.email : undefined,
    },
  };
}

export async function verifyEmailOtp(email: string, token: string, fetcher: Fetcher = fetch) {
  const payload = await supabaseRequest(
    '/auth/v1/verify',
    {
      method: 'POST',
      body: JSON.stringify({ email: normalizeEmail(email), token, type: 'email' }),
    },
    undefined,
    fetcher,
  );

  return parseSession(payload);
}

export async function refreshAuthSession(refreshToken: string, fetcher: Fetcher = fetch) {
  const payload = await supabaseRequest(
    '/auth/v1/token?grant_type=refresh_token',
    {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
    undefined,
    fetcher,
  );

  return parseSession(payload);
}

export async function getAuthUser(accessToken: string, fetcher: Fetcher = fetch) {
  const payload = await supabaseRequest('/auth/v1/user', { method: 'GET' }, accessToken, fetcher);

  if (typeof payload.id !== 'string') {
    throw new SupabaseHttpError('Ugyldig brukerdata.', 502, 'invalid_user');
  }

  return {
    id: payload.id,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  } satisfies AuthUser;
}

async function getProfile(accessToken: string, userId: string, fetcher: Fetcher = fetch) {
  const payload = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,onboarding_completed_at&limit=1`,
    { method: 'GET' },
    accessToken,
    fetcher,
  );

  return (Array.isArray(payload) ? payload[0] : undefined) as
    Pick<ProfileRow, 'id' | 'onboarding_completed_at'> | undefined;
}

const LEARNER_PROFILE_SELECT =
  'id,parent_user_id,display_name,grade_level,course_code,weekly_goal_minutes,locale,timezone,onboarding_completed_at,learner_profile_status,preferred_session_minutes,preferred_weekly_sessions,learning_style,strength_concept_keys,focus_concept_keys,sort_order,created_at,updated_at';

export async function listLearnerProfiles(
  accessToken: string,
  userId: string,
  fetcher: Fetcher = fetch,
): Promise<LearnerProfile[]> {
  const payload = await supabaseRequest(
    `/rest/v1/learner_profiles?parent_user_id=eq.${encodeURIComponent(userId)}&select=${LEARNER_PROFILE_SELECT}&order=sort_order.asc,created_at.asc`,
    { method: 'GET' },
    accessToken,
    fetcher,
  );
  return (Array.isArray(payload) ? payload : []) as LearnerProfile[];
}

export async function ensureFamilyAccount(
  accessToken: string,
  userId: string,
  fetcher: Fetcher = fetch,
): Promise<LearnerProfile[]> {
  const parentPayload = await supabaseRequest(
    `/rest/v1/parent_accounts?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { method: 'GET' },
    accessToken,
    fetcher,
  );
  if (!Array.isArray(parentPayload) || !parentPayload.length) {
    await supabaseRequest(
      '/rest/v1/parent_accounts',
      {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: userId }),
      },
      accessToken,
      fetcher,
    ).catch((error) => {
      // A concurrent login can create the single parent row first. The
      // unique constraint makes that harmless; any other failure is real.
      if (!(error instanceof SupabaseHttpError) || error.status !== 409) throw error;
    });
  }

  let learners = await listLearnerProfiles(accessToken, userId, fetcher);
  if (learners.length) return learners;

  await supabaseRequest(
    '/rest/v1/learner_profiles',
    {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        parent_user_id: userId,
        display_name: 'Elev',
        weekly_goal_minutes: 120,
        locale: 'nb-NO',
        timezone: 'Europe/Oslo',
      }),
    },
    accessToken,
    fetcher,
  ).catch((error) => {
    if (!(error instanceof SupabaseHttpError) || error.status !== 409) throw error;
  });

  learners = await listLearnerProfiles(accessToken, userId, fetcher);
  if (!learners.length) {
    throw new SupabaseHttpError('Elevprofilen ble ikke opprettet.', 502, 'empty_learner');
  }
  return learners;
}

export async function completeLearnerOnboarding(
  accessToken: string,
  userId: string,
  learnerId: string,
  input: {
    displayName: string;
    gradeLevel: number;
    courseCode: string;
    weeklyGoalMinutes: number;
  },
  fetcher: Fetcher = fetch,
) {
  await supabaseRequest(
    `/rest/v1/learner_profiles?id=eq.${encodeURIComponent(learnerId)}&parent_user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        display_name: input.displayName,
        grade_level: input.gradeLevel,
        course_code: input.courseCode,
        weekly_goal_minutes: input.weeklyGoalMinutes,
        onboarding_completed_at: new Date().toISOString(),
        learner_profile_status: 'complete',
        updated_at: new Date().toISOString(),
      }),
    },
    accessToken,
    fetcher,
  );
}

export async function createLearnerProfile(
  accessToken: string,
  userId: string,
  input: { displayName: string; gradeLevel: number; courseCode: string },
  fetcher: Fetcher = fetch,
): Promise<LearnerProfile> {
  const payload = await supabaseRequest(
    '/rest/v1/learner_profiles',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        parent_user_id: userId,
        display_name: input.displayName,
        grade_level: input.gradeLevel,
        course_code: input.courseCode,
        weekly_goal_minutes: 120,
        onboarding_completed_at: new Date().toISOString(),
        learner_profile_status: 'not_started',
      }),
    },
    accessToken,
    fetcher,
  );
  const learner = Array.isArray(payload) ? payload[0] : undefined;
  if (!learner)
    throw new SupabaseHttpError('Elevprofilen ble ikke opprettet.', 502, 'empty_learner');
  return learner as LearnerProfile;
}

export async function ensureDemoProfile(
  accessToken: string,
  userId: string,
  fetcher: Fetcher = fetch,
) {
  const current = await getProfile(accessToken, userId, fetcher);
  if (current) return current;

  await supabaseRequest(
    '/rest/v1/profiles',
    {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: userId,
        display_name: 'Nora',
        grade_level: 10,
        weekly_goal_minutes: 120,
        locale: 'nb-NO',
        timezone: 'Europe/Oslo',
      }),
    },
    accessToken,
    fetcher,
  );

  return { id: userId, onboarding_completed_at: null };
}

export async function completeProfileOnboarding(
  accessToken: string,
  userId: string,
  input: { displayName: string; gradeLevel: number; weeklyGoalMinutes: number },
  fetcher: Fetcher = fetch,
) {
  await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        display_name: input.displayName,
        grade_level: input.gradeLevel,
        weekly_goal_minutes: input.weeklyGoalMinutes,
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    },
    accessToken,
    fetcher,
  );
}

export async function signOutSession(accessToken: string, fetcher: Fetcher = fetch) {
  await supabaseRequest(
    '/auth/v1/logout',
    { method: 'POST', body: JSON.stringify({ scope: 'local' }) },
    accessToken,
    fetcher,
  );
}
