import { nextWeeklyOccurrence } from '../../../../lib/scheduling';
import { PushDeliveryError, sendWebPush } from '../../../../lib/web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DueSession = {
  id: string;
  user_id: string;
  learner_id: string;
  planned_at: string | null;
  duration_minutes: number;
  schedule_id: string | null;
};

type PushSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type Schedule = {
  id: string;
  user_id: string;
  learner_id: string;
  starts_at: string;
  duration_minutes: number;
  recurrence_rule: string | null;
  enabled: boolean;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const cronSecret = process.env.CRON_SECRET;
  if (!url || !secretKey || !cronSecret) throw new Error('Cron is not configured');
  return { url, secretKey, cronSecret };
}

async function adminRequest<T>(path: string, init: RequestInit = {}) {
  const { url, secretKey } = config();
  const response = await fetch(`${url}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
  return payload as T;
}

async function claimReminder(sessionId: string) {
  const payload = await adminRequest<DueSession[]>(
    `/rest/v1/sessions?id=eq.${encodeURIComponent(sessionId)}&status=eq.planned&reminder_sent_at=is.null&select=id,user_id,learner_id,planned_at,duration_minutes,schedule_id`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
    },
  );
  return Array.isArray(payload) ? payload[0] : undefined;
}

async function resetReminder(sessionId: string) {
  await adminRequest(
    `/rest/v1/sessions?id=eq.${encodeURIComponent(sessionId)}&reminder_sent_at=not.is.null`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ reminder_sent_at: null }),
    },
  );
}

async function markScheduleAfterReminder(session: DueSession) {
  if (!session.schedule_id) return;
  const scheduleRows = await adminRequest<Schedule[]>(
    `/rest/v1/schedules?id=eq.${encodeURIComponent(session.schedule_id)}&select=id,user_id,learner_id,starts_at,duration_minutes,recurrence_rule,enabled&limit=1`,
  );
  const schedule = Array.isArray(scheduleRows) ? scheduleRows[0] : undefined;
  if (!schedule || !schedule.enabled) return;

  const recurrence = schedule.recurrence_rule?.match(
    /^FREQ=WEEKLY;BYDAY=([1-7]);TIME=(\d{2}:\d{2});TZ=(.+)$/,
  );
  if (!recurrence) {
    await adminRequest(`/rest/v1/schedules?id=eq.${encodeURIComponent(schedule.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ enabled: false, updated_at: new Date().toISOString() }),
    });
    return;
  }

  const nextStartsAt = nextWeeklyOccurrence(
    Number(recurrence[1]),
    recurrence[2],
    new Date(new Date(schedule.starts_at).getTime() + 1000),
    recurrence[3],
  );
  if (!nextStartsAt) return;

  await adminRequest('/rest/v1/sessions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: schedule.user_id,
      learner_id: schedule.learner_id,
      schedule_id: schedule.id,
      status: 'planned',
      current_phase: 'homework',
      duration_minutes: schedule.duration_minutes,
      planned_at: nextStartsAt.toISOString(),
      plan_snapshot: { version: 'scheduled-session.v0.1', mode: 'scheduled' },
    }),
  });
  await adminRequest(`/rest/v1/schedules?id=eq.${encodeURIComponent(schedule.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      starts_at: nextStartsAt.toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function GET(request: Request) {
  let cronSecret: string;
  try {
    ({ cronSecret } = config());
  } catch {
    return json({ error: 'Cron-varsler er ikke konfigurert.' }, 503);
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return json({ error: 'Ikke autorisert.' }, 401);
  }

  const now = new Date();
  const from = new Date(now.getTime() - 15 * 60_000).toISOString();
  const until = new Date(now.getTime() + 10 * 60_000).toISOString();
  let sessions: DueSession[];
  try {
    sessions = await adminRequest<DueSession[]>(
      `/rest/v1/sessions?status=eq.planned&planned_at=gte.${encodeURIComponent(from)}&planned_at=lte.${encodeURIComponent(until)}&reminder_sent_at=is.null&select=id,user_id,learner_id,planned_at,duration_minutes,schedule_id&order=planned_at.asc&limit=100`,
    );
  } catch {
    return json({ error: 'Planlagte økter kunne ikke leses.' }, 503);
  }
  if (!Array.isArray(sessions) || sessions.length === 0) return json({ ok: true, processed: 0 });

  const userIds = Array.from(new Set(sessions.map((session) => session.user_id)));
  let subscriptions: PushSubscription[] = [];
  try {
    subscriptions = await adminRequest<PushSubscription[]>(
      `/rest/v1/push_subscriptions?user_id=in.(${userIds.join(',')})&select=id,user_id,endpoint,p256dh,auth&limit=500`,
    );
  } catch {
    return json({ error: 'Push-abonnementer kunne ikke leses.' }, 503);
  }

  let processed = 0;
  for (const candidate of sessions) {
    const session = await claimReminder(candidate.id);
    if (!session) continue;
    const userSubscriptions = subscriptions.filter(
      (subscription) => subscription.user_id === session.user_id,
    );
    let delivered = 0;
    let stale = 0;
    for (const subscription of userSubscriptions) {
      try {
        await sendWebPush(subscription, {
          title: 'Mattis',
          body: 'Matteøkten din begynner snart.',
          icon: '/icons/mattis-icon.svg',
          badge: '/icons/mattis-icon.svg',
          tag: 'mattis-session',
          url: '/home',
        });
        delivered += 1;
      } catch (error) {
        if (error instanceof PushDeliveryError && (error.status === 404 || error.status === 410)) {
          stale += 1;
          await adminRequest(
            `/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(subscription.id)}`,
            { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
          ).catch(() => undefined);
        }
      }
    }

    if (userSubscriptions.length > 0 && delivered === 0 && stale < userSubscriptions.length) {
      await resetReminder(session.id).catch(() => undefined);
      continue;
    }
    await markScheduleAfterReminder(session).catch(() => undefined);
    processed += 1;
  }

  return json({ ok: true, processed });
}
