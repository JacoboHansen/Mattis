import { describe, expect, it } from 'vitest';

import {
  isValidLocalTime,
  localDateTimeToUtc,
  nextWeeklyOccurrence,
  parseWeeklyScheduleText,
  weeklyRecurrenceRule,
} from '../../apps/web/lib/scheduling';

describe('scheduling helpers', () => {
  it('validates local clock values', () => {
    expect(isValidLocalTime('17:30')).toBe(true);
    expect(isValidLocalTime('25:00')).toBe(false);
    expect(isValidLocalTime('9:30')).toBe(false);
  });

  it('converts Oslo local time to a future UTC instant', () => {
    const result = localDateTimeToUtc('2030-01-15', '17:30');
    expect(result?.toISOString()).toBe('2030-01-15T16:30:00.000Z');
  });

  it('finds the following weekly occurrence', () => {
    const now = new Date('2030-01-14T10:00:00.000Z');
    const result = nextWeeklyOccurrence(2, '17:30', now);
    expect(result?.toISOString()).toBe('2030-01-15T16:30:00.000Z');
  });

  it('keeps recurrence rules free of personal data', () => {
    expect(weeklyRecurrenceRule(2, '17:30')).toBe(
      'FREQ=WEEKLY;BYDAY=2;TIME=17:30;TZ=Europe/Oslo',
    );
  });

  it('extracts weekday and time pairs from onboarding text', () => {
    expect(parseWeeklyScheduleText('Tirsdag kl. 18 og søndag kl. 11')).toEqual([
      { weekday: 2, localTime: '18:00' },
      { weekday: 7, localTime: '11:00' },
    ]);
  });

  it('does not invent a time from unrelated text', () => {
    expect(parseWeeklyScheduleText('Tirsdag passer ofte best')).toEqual([]);
  });
});
