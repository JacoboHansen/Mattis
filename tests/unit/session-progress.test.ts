import { describe, expect, it } from 'vitest';

import { resolveSessionProgress } from '../../apps/web/lib/planning/session-progress';

const timeline = [
  { id: 'homework', label: 'Lekser', phase: 'homework' as const, minutes: 15 },
  {
    id: 'repetition',
    label: 'Repetisjon',
    phase: 'repetition' as const,
    minutes: 20,
  },
  {
    id: 'summary',
    label: 'Oppsummering',
    phase: 'summary' as const,
    minutes: 5,
  },
];

describe('session progress', () => {
  it('waits at the active segment until an active task is resolved', () => {
    const progress = resolveSessionProgress({
      startedAt: '2026-08-31T10:00:00.000Z',
      durationMinutes: 40,
      timeline,
      activeSegmentId: 'homework',
      activeTaskPending: true,
      now: Date.parse('2026-08-31T10:20:00.000Z'),
    });

    expect(progress?.activeSegmentId).toBe('homework');
    expect(progress?.nextSegment?.id).toBe('repetition');
    expect(progress?.transitionDue).toBe(true);
  });

  it('waits for a conversational decision even at a natural checkpoint', () => {
    const progress = resolveSessionProgress({
      startedAt: '2026-08-31T10:00:00.000Z',
      durationMinutes: 40,
      timeline,
      activeSegmentId: 'homework',
      activeTaskPending: false,
      now: Date.parse('2026-08-31T10:20:00.000Z'),
    });

    expect(progress?.activeSegmentId).toBe('homework');
    expect(progress?.transitionDue).toBe(true);
  });
});
