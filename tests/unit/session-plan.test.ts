import { describe, expect, it } from 'vitest';

import { buildSessionPlan } from '../../apps/web/lib/planning/session-plan';
import type { StudentMastery, TutorTask } from '../../apps/web/lib/supabase/data';

function task(overrides: Partial<TutorTask> = {}): TutorTask {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'user-1',
    session_id: '22222222-2222-4222-8222-222222222222',
    upload_id: null,
    sequence_no: 1,
    source_label: '1a',
    source_text: 'Løs x + 2 = 5',
    normalized_text: 'Løs x + 2 = 5',
    task_type: 'equation',
    concept_keys: ['algebra.equations'],
    figure_spec: null,
    parse_confidence: 0.95,
    status: 'confirmed',
    phase: 'homework',
    origin: 'image',
    estimated_minutes: 10,
    completed_at: null,
    created_at: '2026-08-22T10:00:00.000Z',
    updated_at: '2026-08-22T10:00:00.000Z',
    ...overrides,
  };
}

function mastery(overrides: Partial<StudentMastery> = {}): StudentMastery {
  return {
    user_id: 'user-1',
    concept_key: 'numbers.negative',
    estimate: 0.42,
    confidence: 0.7,
    evidence_count: 4,
    last_practiced_at: '2026-08-20T10:00:00.000Z',
    updated_at: '2026-08-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('session planning', () => {
  it('reserves summary time and balances homework with targeted repetition', () => {
    const plan = buildSessionPlan({
      durationMinutes: 45,
      homeworkTasks: [task()],
      mastery: [mastery()],
      nextTopicNb: 'fortegn i likninger',
    });

    expect(plan.homeworkMinutes + plan.repetitionMinutes + plan.summaryMinutes).toBe(45);
    expect(plan.homeworkMinutes).toBe(10);
    expect(plan.summaryMinutes).toBeGreaterThanOrEqual(3);
    expect(plan.focusConcepts[0]).toBe('numbers.negative');
    expect(plan.reviewTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conceptKeys: ['numbers.negative'] }),
        expect.objectContaining({ conceptKeys: ['algebra.equations'] }),
      ]),
    );
    expect(plan.reasonNb).toContain('fortegn i likninger');
  });

  it('never lets homework crowd out the planned summary and repetition minimum', () => {
    const plan = buildSessionPlan({
      durationMinutes: 25,
      homeworkTasks: [task({ estimated_minutes: 30 })],
      mastery: [],
    });

    expect(plan.homeworkMinutes).toBeLessThanOrEqual(17);
    expect(plan.repetitionMinutes).toBeGreaterThanOrEqual(5);
    expect(plan.homeworkMinutes + plan.repetitionMinutes + plan.summaryMinutes).toBe(25);
  });
});
