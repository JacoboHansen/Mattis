export type ScheduleMode = 'next' | 'weekly';

export type ScheduleInput =
  | {
      mode: 'next';
      plannedAt: string;
      durationMinutes: number;
    }
  | {
      mode: 'weekly';
      weekday: number;
      localTime: string;
      durationMinutes: number;
      timezone?: string;
    };

export const OSLO_TIMEZONE = 'Europe/Oslo';

export function assertScheduleDuration(value: number) {
  return Number.isInteger(value) && value >= 10 && value <= 180;
}

export function isValidLocalTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function partsInTimeZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
}

function timezoneOffsetMs(date: Date, timezone: string) {
  const parts = partsInTimeZone(date, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

export function localDateTimeToUtc(datePart: string, localTime: string, timezone = OSLO_TIMEZONE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart) || !isValidLocalTime(localTime)) return null;
  const naiveUtc = Date.parse(`${datePart}T${localTime}:00.000Z`);
  if (!Number.isFinite(naiveUtc)) return null;
  return new Date(naiveUtc - timezoneOffsetMs(new Date(naiveUtc), timezone));
}

export function nextWeeklyOccurrence(
  weekday: number,
  localTime: string,
  now = new Date(),
  timezone = OSLO_TIMEZONE,
) {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !isValidLocalTime(localTime)) {
    return null;
  }
  const current = partsInTimeZone(now, timezone);
  const currentWeekday = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
      .format(now)
      .replace(/^Sun$/, '7')
      .replace(/^Mon$/, '1')
      .replace(/^Tue$/, '2')
      .replace(/^Wed$/, '3')
      .replace(/^Thu$/, '4')
      .replace(/^Fri$/, '5')
      .replace(/^Sat$/, '6'),
  );
  const daysAhead = (weekday - currentWeekday + 7) % 7;
  const candidate = new Date(Date.UTC(current.year, current.month - 1, current.day + daysAhead));
  const datePart = `${candidate.getUTCFullYear()}-${String(candidate.getUTCMonth() + 1).padStart(2, '0')}-${String(candidate.getUTCDate()).padStart(2, '0')}`;
  let result = localDateTimeToUtc(datePart, localTime, timezone);
  if (result && result.getTime() <= now.getTime()) {
    const next = new Date(candidate.getTime() + 7 * 86_400_000);
    const nextDatePart = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
    result = localDateTimeToUtc(nextDatePart, localTime, timezone);
  }
  return result;
}

export function weeklyRecurrenceRule(weekday: number, localTime: string, timezone = OSLO_TIMEZONE) {
  return `FREQ=WEEKLY;BYDAY=${weekday};TIME=${localTime};TZ=${timezone}`;
}

export function scheduleLabel(input: ScheduleInput) {
  if (input.mode === 'next') {
    return new Intl.DateTimeFormat('nb-NO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(input.plannedAt));
  }
  const weekdayLabel = new Intl.DateTimeFormat('nb-NO', {
    weekday: 'long',
    timeZone: input.timezone ?? OSLO_TIMEZONE,
  }).format(nextWeeklyOccurrence(input.weekday, input.localTime) ?? new Date());
  return `${weekdayLabel} kl. ${input.localTime}`;
}
