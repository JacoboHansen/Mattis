import { describe, expect, it } from 'vitest';

import {
  isValidLocalTime,
  localDateTimeToUtc,
  nextWeeklyOccurrence,
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
    expect(weeklyRecurrenceRule(2, '17:30')).toBe('FREQ=WEEKLY;BYDAY=2;TIME=17:30;TZ=Europe/Oslo');
  });
});
