import type { LearnerProfile } from './supabase-http';

export type PendingLearner = {
  id: string;
  user_id: string;
  display_name: string;
  grade_level: number;
  course_code: string;
  age_band: 'under_12' | '12_16' | '17_plus';
  parent_together_confirmed: boolean;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  learner_id: string | null;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  created_at: string;
  updated_at: string;
};

function serverConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error('Supabase sin servernøkkel er ikke konfigurert.');
  return { url, key };
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

async function serverRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, key } = serverConfig();
  const response = await fetch(`${url}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload));
  return payload as T;
}

export async function createPendingLearner(input: {
  userId: string;
  displayName: string;
  gradeLevel: number;
  courseCode: string;
  ageBand: 'under_12' | '12_16' | '17_plus';
  parentTogetherConfirmed: boolean;
  stripeSubscriptionId: string;
}) {
  const payload = await serverRequest<PendingLearner[]>(
    '/rest/v1/pending_learners',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: input.userId,
        display_name: input.displayName,
        grade_level: input.gradeLevel,
        course_code: input.courseCode,
        age_band: input.ageBand,
        parent_together_confirmed: input.parentTogetherConfirmed,
        stripe_subscription_id: input.stripeSubscriptionId,
        status: 'pending',
      }),
    },
  );
  const pending = payload[0];
  if (!pending) throw new Error('Den ventende elevprofilen ble ikke lagret.');
  return pending;
}

export async function setPendingLearnerInvoice(
  pendingId: string,
  stripeInvoiceId: string | null,
  stripeSubscriptionId?: string | null,
) {
  await serverRequest(
    `/rest/v1/pending_learners?id=eq.${encodeURIComponent(pendingId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        stripe_invoice_id: stripeInvoiceId,
        ...(stripeSubscriptionId !== undefined
          ? { stripe_subscription_id: stripeSubscriptionId }
          : {}),
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

export async function markPendingLearnerFailed(pendingId: string) {
  await serverRequest(
    `/rest/v1/pending_learners?id=eq.${encodeURIComponent(pendingId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'failed',
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

async function getPendingLearnerById(pendingId: string) {
  const payload = await serverRequest<PendingLearner[]>(
    `/rest/v1/pending_learners?id=eq.${encodeURIComponent(pendingId)}&select=*&limit=1`,
  );
  return payload[0] ?? null;
}

export async function getPendingLearnerByInvoice(stripeInvoiceId: string) {
  const payload = await serverRequest<PendingLearner[]>(
    `/rest/v1/pending_learners?stripe_invoice_id=eq.${encodeURIComponent(stripeInvoiceId)}&select=*&limit=1`,
  );
  return payload[0] ?? null;
}

export async function getPendingLearnerBySubscription(
  stripeSubscriptionId: string,
) {
  const payload = await serverRequest<PendingLearner[]>(
    `/rest/v1/pending_learners?stripe_subscription_id=eq.${encodeURIComponent(stripeSubscriptionId)}&status=eq.pending&select=*&order=created_at.asc&limit=1`,
  );
  return payload[0] ?? null;
}

async function findLearnerCreatedFromPending(pendingId: string) {
  const payload = await serverRequest<Pick<LearnerProfile, 'id'>[]>(
    `/rest/v1/learner_profiles?created_from_pending_id=eq.${encodeURIComponent(pendingId)}&select=id&limit=1`,
  );
  return payload[0]?.id ?? null;
}

export async function finalizePendingLearner(
  pendingId: string,
): Promise<string | null> {
  const pending = await getPendingLearnerById(pendingId);
  if (!pending || pending.status === 'failed' || pending.status === 'cancelled')
    return null;

  const existingId = await findLearnerCreatedFromPending(pendingId);
  if (existingId) {
    await serverRequest(
      `/rest/v1/pending_learners?id=eq.${encodeURIComponent(pendingId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'paid',
          learner_id: existingId,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    return existingId;
  }

  const payload = await serverRequest<LearnerProfile[]>(
    '/rest/v1/learner_profiles',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        parent_user_id: pending.user_id,
        display_name: pending.display_name,
        grade_level: pending.grade_level,
        course_code: pending.course_code,
        age_band: pending.age_band,
        parent_together_confirmed: pending.parent_together_confirmed,
        weekly_goal_minutes: 120,
        locale: 'nb-NO',
        timezone: 'Europe/Oslo',
        onboarding_completed_at: null,
        learner_profile_status: 'not_started',
        intake_step: 'goal',
        intake_data: {},
        created_from_pending_id: pendingId,
      }),
    },
  );
  const learnerId =
    payload[0]?.id ?? (await findLearnerCreatedFromPending(pendingId));
  if (!learnerId)
    throw new Error('Den betalte elevprofilen ble ikke opprettet.');

  await serverRequest(
    `/rest/v1/pending_learners?id=eq.${encodeURIComponent(pendingId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'paid',
        learner_id: learnerId,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return learnerId;
}

export async function finalizePendingLearnerByInvoice(stripeInvoiceId: string) {
  const pending = await getPendingLearnerByInvoice(stripeInvoiceId);
  return pending ? finalizePendingLearner(pending.id) : null;
}

export async function finalizePendingLearnerBySubscription(
  stripeSubscriptionId: string,
) {
  const pending = await getPendingLearnerBySubscription(stripeSubscriptionId);
  return pending ? finalizePendingLearner(pending.id) : null;
}
