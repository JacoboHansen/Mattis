import type { TutorTurnResponse } from './ai/contracts';

export type SafetyLevel = 'support' | 'urgent';
export type SafetySignalCode = 'distress' | 'self_harm' | 'abuse' | 'immediate_danger';

export type SafetySignal = {
  level: SafetyLevel;
  code: SafetySignalCode;
};

type SafetyPreference = {
  enabled: boolean;
  consented_at: string | null;
};

type SafetyEvent = {
  id: string;
};

const SUPPORT_PATTERNS = [
  /klarer ikke mer/,
  /vil bare forsvinne/,
  /hater meg selv/,
  /ingen vil ha meg/,
  /veldig redd/,
];
const SELF_HARM_PATTERNS = [
  /selvskad/,
  /skade meg selv/,
  /ta livet mitt/,
  /ta livet av meg/,
  /drepe meg selv/,
  /ikke lyst til a leve/,
  /vil ikke leve/,
  /onsker a do/,
  /vil do/,
];
const ABUSE_PATTERNS = [
  /blir slatt/,
  /slar meg/,
  /vold hjemme/,
  /seksuelt overgrep/,
  /seksuelle overgrep/,
  /noen tar pa meg/,
  /redd for a dra hjem/,
];
const IMMEDIATE_DANGER_PATTERNS = [
  /er i fare/,
  /hjelp meg na/,
  /skjer akkurat na/,
  /blir skadet na/,
  /akutt hjelp/,
];

function normalizedText(value: string) {
  return value
    .toLocaleLowerCase('nb-NO')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Deliberately conservative detection. This is not a diagnosis, mood score,
 * or replacement for human judgement. Only explicit language or an explicit
 * safety classification from the tutor can create a signal.
 */
export function detectSafetySignal(
  message: string,
  response: TutorTurnResponse,
): SafetySignal | null {
  const text = normalizedText(message);
  const flags = new Set(response.safetyFlags);

  if (flags.has('self_harm') || matchesAny(text, SELF_HARM_PATTERNS)) {
    return { level: 'urgent', code: 'self_harm' };
  }
  if (flags.has('abuse') || matchesAny(text, ABUSE_PATTERNS)) {
    return { level: 'urgent', code: 'abuse' };
  }
  if (matchesAny(text, IMMEDIATE_DANGER_PATTERNS)) {
    return { level: 'urgent', code: 'immediate_danger' };
  }
  if (
    (response.intent === 'safety' &&
      (response.suggestedActions?.includes('contact_adult') || flags.has('other'))) ||
    matchesAny(text, SUPPORT_PATTERNS)
  ) {
    return { level: 'support', code: 'distress' };
  }
  return null;
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error('Supabase er ikke konfigurert.');
  return { url, publishableKey };
}

function serverConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error('Supabase sin servernøkkel er ikke konfigurert.');
  return { url, secretKey };
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

function errorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Ukjent feil.';
  const source = payload as Record<string, unknown>;
  return (
    [source.message, source.msg, source.error_description].find(
      (value): value is string => typeof value === 'string',
    ) ?? 'Ukjent feil.'
  );
}

async function publicRequest<T>(path: string, init: RequestInit, accessToken: string): Promise<T> {
  const { url, publishableKey } = config();
  const response = await fetch(`${url}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload));
  return payload as T;
}

async function serverRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, secretKey } = serverConfig();
  const response = await fetch(`${url}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      // Supabase secret API keys are passed as apikey; they are not bearer tokens.
      apikey: secretKey,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload));
  return payload as T;
}

export async function getParentSafetyPreference(accessToken: string, userId: string) {
  const payload = await publicRequest<SafetyPreference[]>(
    `/rest/v1/parent_safety_preferences?user_id=eq.${encodeURIComponent(userId)}&select=enabled,consented_at&limit=1`,
    { method: 'GET' },
    accessToken,
  );
  return payload[0] ?? { enabled: false, consented_at: null };
}

export async function setParentSafetyPreference(
  accessToken: string,
  userId: string,
  enabled: boolean,
) {
  const payload = await publicRequest<SafetyPreference[]>(
    '/rest/v1/parent_safety_preferences?on_conflict=user_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        user_id: userId,
        enabled,
        consented_at: enabled ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }),
    },
    accessToken,
  );
  return payload[0] ?? { enabled, consented_at: enabled ? new Date().toISOString() : null };
}

async function sendParentEmail(to: string, eventId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? '').replace(
    /\/$/,
    '',
  );
  if (!apiKey || !from || !appUrl) return false;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `mattis-safety-${eventId}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'En viktig beskjed fra Mattis',
      text: [
        'Mattis har en oppfølging til deg.',
        '',
        'Logg inn på Mattis for å se hvordan du kan følge opp på en rolig måte:',
        `${appUrl}/parent`,
        '',
        'Mattis er ikke en akuttjeneste. Ved umiddelbar fare: ring 113. Barn og unge kan også kontakte Alarmtelefonen på 116 111.',
      ].join('\n'),
    }),
  });
  if (!response.ok) throw new Error(errorMessage(await readJson(response)));
  return true;
}

export async function recordSafetySignal(input: {
  userId: string;
  learnerId: string;
  sessionId: string;
  parentEmail?: string;
  signal: SafetySignal;
}) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await serverRequest<SafetyEvent[]>(
    `/rest/v1/safety_events?user_id=eq.${encodeURIComponent(input.userId)}&learner_id=eq.${encodeURIComponent(input.learnerId)}&signal_code=eq.${encodeURIComponent(input.signal.code)}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`,
  );
  if (recent.length) return { deduplicated: true, notificationStatus: 'suppressed' as const };

  const preference = await serverRequest<SafetyPreference[]>(
    `/rest/v1/parent_safety_preferences?user_id=eq.${encodeURIComponent(input.userId)}&select=enabled&limit=1`,
  );
  const enabled = preference[0]?.enabled === true;
  const canSend = enabled && input.signal.level === 'urgent' && Boolean(input.parentEmail);
  const hasEmailConfig = Boolean(
    process.env.RESEND_API_KEY &&
    process.env.RESEND_FROM_EMAIL &&
    (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL),
  );
  const initialStatus = !enabled
    ? 'suppressed'
    : !canSend || !hasEmailConfig
      ? 'not_configured'
      : 'pending';

  const inserted = await serverRequest<SafetyEvent[]>('/rest/v1/safety_events', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: input.userId,
      learner_id: input.learnerId,
      session_id: input.sessionId,
      signal_code: input.signal.code,
      level: input.signal.level,
      notification_status: initialStatus,
    }),
  });
  const event = inserted[0];
  if (!event || !canSend || !hasEmailConfig || !input.parentEmail) {
    return { deduplicated: false, notificationStatus: initialStatus };
  }

  try {
    await sendParentEmail(input.parentEmail, event.id);
    await serverRequest(`/rest/v1/safety_events?id=eq.${encodeURIComponent(event.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        notification_status: 'sent',
        notification_sent_at: new Date().toISOString(),
      }),
    });
    return { deduplicated: false, notificationStatus: 'sent' as const };
  } catch (error) {
    console.error('Parent safety notification failed', {
      code: error instanceof Error ? error.message : 'unknown',
    });
    await serverRequest(`/rest/v1/safety_events?id=eq.${encodeURIComponent(event.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ notification_status: 'failed' }),
    }).catch(() => undefined);
    return { deduplicated: false, notificationStatus: 'failed' as const };
  }
}
