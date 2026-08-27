import type { TutorTurnResponse } from './ai/contracts';
import type { LearnerAgeBand } from './learner-profile';

export type SafetyLevel = 'support' | 'urgent';
export type SafetySignalCode =
  'distress' | 'bullying' | 'self_harm' | 'abuse' | 'immediate_danger';
export type SafetyNotificationPolicy =
  'always' | 'under_12' | 'child_consent' | 'trusted_adult_only' | 'never';

export type SafetySignal = {
  level: SafetyLevel;
  code: SafetySignalCode;
  parentPolicy: SafetyNotificationPolicy;
};

type SafetyPreference = {
  enabled: boolean;
  consented_at: string | null;
};

type SafetyEvent = {
  id: string;
  signal_code?: SafetySignalCode;
  notification_status?: string;
};

const SUPPORT_PATTERNS = [
  /klarer ikke mer/,
  /vil bare forsvinne/,
  /hater meg selv/,
  /ingen vil ha meg/,
  /veldig redd/,
];
const BULLYING_PATTERNS = [
  /blir mobbet/,
  /blir mobba/,
  /mobber meg/,
  /mobbet meg/,
  /plager meg/,
  /holder meg utenfor/,
  /lar meg ikke vaere med/,
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

function parentPolicy(
  code: SafetySignalCode,
  ageBand: LearnerAgeBand,
): SafetyNotificationPolicy {
  if (code === 'self_harm' || code === 'immediate_danger') return 'always';
  if (code === 'abuse') return 'trusted_adult_only';
  if (ageBand === 'under_12') return 'under_12';
  if (ageBand === '12_16') return 'child_consent';
  return 'never';
}

/** Conservative detection; this is not a diagnosis or a replacement for human help. */
export function detectSafetySignal(
  message: string,
  response: TutorTurnResponse,
  ageBand: LearnerAgeBand = 'under_12',
): SafetySignal | null {
  const text = normalizedText(message);
  const flags = new Set(response.safetyFlags);
  const signal = (
    level: SafetyLevel,
    code: SafetySignalCode,
  ): SafetySignal => ({
    level,
    code,
    parentPolicy: parentPolicy(code, ageBand),
  });
  if (flags.has('self_harm') || matchesAny(text, SELF_HARM_PATTERNS))
    return signal('urgent', 'self_harm');
  if (flags.has('abuse') || matchesAny(text, ABUSE_PATTERNS))
    return signal('urgent', 'abuse');
  if (matchesAny(text, IMMEDIATE_DANGER_PATTERNS))
    return signal('urgent', 'immediate_danger');
  if (matchesAny(text, BULLYING_PATTERNS)) return signal('support', 'bullying');
  if (
    (response.intent === 'safety' &&
      (response.suggestedActions?.includes('contact_adult') ||
        flags.has('other'))) ||
    matchesAny(text, SUPPORT_PATTERNS)
  )
    return signal('support', 'distress');
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
  if (!url || !secretKey)
    throw new Error('Supabase sin servernøkkel er ikke konfigurert.');
  return { url, secretKey };
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

function errorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return 'Ukjent feil.';
  const source = payload as Record<string, unknown>;
  return (
    [source.message, source.msg, source.error_description].find(
      (value): value is string => typeof value === 'string',
    ) ?? 'Ukjent feil.'
  );
}

async function publicRequest<T>(
  path: string,
  init: RequestInit,
  accessToken: string,
): Promise<T> {
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

async function serverRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, secretKey } = serverConfig();
  const response = await fetch(`${url}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: secretKey,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload));
  return payload as T;
}

export async function getParentSafetyPreference(
  accessToken: string,
  userId: string,
) {
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
  return (
    payload[0] ?? {
      enabled,
      consented_at: enabled ? new Date().toISOString() : null,
    }
  );
}

async function sendParentEmail(to: string, eventId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    ''
  ).replace(/\/$/, '');
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

function emailConfigAvailable() {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.RESEND_FROM_EMAIL &&
    (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL),
  );
}

async function updateSafetyEvent(
  eventId: string,
  body: Record<string, unknown>,
) {
  await serverRequest(
    `/rest/v1/safety_events?id=eq.${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    },
  );
}

export async function recordSafetySignal(input: {
  userId: string;
  learnerId: string;
  sessionId: string;
  parentEmail?: string;
  ageBand?: LearnerAgeBand;
  signal: SafetySignal;
}) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await serverRequest<SafetyEvent[]>(
    `/rest/v1/safety_events?user_id=eq.${encodeURIComponent(input.userId)}&learner_id=eq.${encodeURIComponent(input.learnerId)}&signal_code=eq.${encodeURIComponent(input.signal.code)}&created_at=gte.${encodeURIComponent(since)}&select=id,notification_status&limit=1`,
  );
  if (recent.length) {
    return {
      deduplicated: true,
      eventId: recent[0].id,
      notificationStatus: recent[0].notification_status ?? 'suppressed',
      childConsentRequired:
        recent[0].notification_status === 'awaiting_child_consent',
      trustedAdultOnly: input.signal.parentPolicy === 'trusted_adult_only',
    };
  }

  const ageBand = input.ageBand ?? 'under_12';
  const preference = await serverRequest<SafetyPreference[]>(
    `/rest/v1/parent_safety_preferences?user_id=eq.${encodeURIComponent(input.userId)}&select=enabled&limit=1`,
  );
  const enabled = preference[0]?.enabled === true;
  const trustedAdultOnly = input.signal.parentPolicy === 'trusted_adult_only';
  const childConsentRequired =
    input.signal.parentPolicy === 'child_consent' && enabled;
  const under12Required =
    input.signal.parentPolicy === 'under_12' && ageBand === 'under_12';
  const parentEligible =
    !trustedAdultOnly &&
    input.signal.parentPolicy !== 'never' &&
    (input.signal.parentPolicy === 'always' || enabled || under12Required) &&
    Boolean(input.parentEmail);
  const hasEmailConfig = emailConfigAvailable();
  const initialStatus =
    trustedAdultOnly || input.signal.parentPolicy === 'never'
      ? 'suppressed'
      : childConsentRequired
        ? 'awaiting_child_consent'
        : !parentEligible || !hasEmailConfig
          ? 'not_configured'
          : 'pending';

  const inserted = await serverRequest<SafetyEvent[]>(
    '/rest/v1/safety_events',
    {
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
    },
  );
  const event = inserted[0];
  if (
    !event ||
    childConsentRequired ||
    !parentEligible ||
    !hasEmailConfig ||
    !input.parentEmail
  ) {
    return {
      deduplicated: false,
      eventId: event?.id,
      notificationStatus: initialStatus,
      childConsentRequired,
      trustedAdultOnly,
    };
  }

  try {
    await sendParentEmail(input.parentEmail, event.id);
    await updateSafetyEvent(event.id, {
      notification_status: 'sent',
      notification_sent_at: new Date().toISOString(),
    });
    return {
      deduplicated: false,
      eventId: event.id,
      notificationStatus: 'sent' as const,
      childConsentRequired: false,
      trustedAdultOnly,
    };
  } catch (error) {
    console.error('Parent safety notification failed', {
      code: error instanceof Error ? error.message : 'unknown',
    });
    await updateSafetyEvent(event.id, { notification_status: 'failed' }).catch(
      () => undefined,
    );
    return {
      deduplicated: false,
      eventId: event.id,
      notificationStatus: 'failed' as const,
      childConsentRequired: false,
      trustedAdultOnly,
    };
  }
}

export async function resolveChildSafetyConsent(input: {
  userId: string;
  learnerId: string;
  eventId: string;
  consent: boolean;
  parentEmail?: string;
}) {
  const events = await serverRequest<SafetyEvent[]>(
    `/rest/v1/safety_events?id=eq.${encodeURIComponent(input.eventId)}&user_id=eq.${encodeURIComponent(input.userId)}&learner_id=eq.${encodeURIComponent(input.learnerId)}&select=id,signal_code,notification_status&limit=1`,
  );
  const event = events[0];
  if (!event) return { ok: false as const, status: 'not_found' as const };
  if (!input.consent) {
    await updateSafetyEvent(event.id, { notification_status: 'suppressed' });
    return { ok: true as const, status: 'declined' as const };
  }
  if (
    event.signal_code === 'abuse' ||
    event.notification_status !== 'awaiting_child_consent'
  ) {
    return { ok: true as const, status: 'trusted_adult_only' as const };
  }
  if (!input.parentEmail || !emailConfigAvailable()) {
    await updateSafetyEvent(event.id, {
      notification_status: 'not_configured',
    });
    return { ok: true as const, status: 'not_configured' as const };
  }
  try {
    await sendParentEmail(input.parentEmail, event.id);
    await updateSafetyEvent(event.id, {
      notification_status: 'sent',
      notification_sent_at: new Date().toISOString(),
      consented_at: new Date().toISOString(),
    });
    return { ok: true as const, status: 'sent' as const };
  } catch {
    await updateSafetyEvent(event.id, { notification_status: 'failed' }).catch(
      () => undefined,
    );
    return { ok: true as const, status: 'failed' as const };
  }
}
