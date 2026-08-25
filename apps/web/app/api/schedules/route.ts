import {
  assertScheduleDuration,
  isValidLocalTime,
  nextWeeklyOccurrence,
  OSLO_TIMEZONE,
  weeklyRecurrenceRule,
} from '../../../lib/scheduling';
import { getAuthenticatedTutorData, RequestAuthError } from '../../../lib/request-auth';
import { TutorDataError } from '../../../lib/supabase/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => undefined);
  if (!isRecord(body)) return json({ error: 'Ugyldig tidspunkt.' }, 400);
  const allowed = new Set(['mode', 'plannedAt', 'weekday', 'localTime', 'durationMinutes']);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return json({ error: 'Tidspunktet inneholder ukjente felter.' }, 400);
  }
  const mode = body.mode;
  const durationMinutes = body.durationMinutes;
  if ((mode !== 'next' && mode !== 'weekly') || !assertScheduleDuration(Number(durationMinutes))) {
    return json({ error: 'Velg en gyldig øktlengde.' }, 400);
  }

  let startsAt: Date | null = null;
  let recurrenceRule: string | null = null;
  if (mode === 'next') {
    if (typeof body.plannedAt !== 'string') return json({ error: 'Velg et tidspunkt.' }, 400);
    startsAt = new Date(body.plannedAt);
    if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      return json({ error: 'Tidspunktet må ligge frem i tid.' }, 400);
    }
    if (startsAt.getTime() > Date.now() + 366 * 86_400_000) {
      return json({ error: 'Velg et tidspunkt innen det neste året.' }, 400);
    }
  } else {
    if (
      typeof body.weekday !== 'number' ||
      !Number.isInteger(body.weekday) ||
      body.weekday < 1 ||
      body.weekday > 7 ||
      typeof body.localTime !== 'string' ||
      !isValidLocalTime(body.localTime)
    ) {
      return json({ error: 'Velg en gyldig ukedag og tid.' }, 400);
    }
    startsAt = nextWeeklyOccurrence(body.weekday, body.localTime, new Date(), OSLO_TIMEZONE);
    recurrenceRule = weeklyRecurrenceRule(body.weekday, body.localTime, OSLO_TIMEZONE);
    if (!startsAt) return json({ error: 'Tidspunktet kunne ikke beregnes.' }, 400);
  }

  try {
    const { data } = await getAuthenticatedTutorData();
    const schedule = await data.createSchedule({
      startsAt: startsAt.toISOString(),
      durationMinutes: Number(durationMinutes),
      recurrenceRule,
    });
    const session = await data.createSession({
      durationMinutes: Number(durationMinutes),
      plannedAt: startsAt.toISOString(),
      startImmediately: false,
      planSnapshot: {
        version: 'scheduled-session.v0.1',
        mode: 'scheduled',
      },
    });
    return json(
      {
        schedule: {
          id: schedule.id,
          startsAt: schedule.starts_at,
          recurrenceRule: schedule.recurrence_rule,
        },
        session: { id: session.id, plannedAt: session.planned_at },
      },
      201,
    );
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Tidspunktet kunne ikke lagres.' }, 503);
  }
}
