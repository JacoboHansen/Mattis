import { describe, expect, it } from 'vitest';

import { detectSafetySignal } from '../../apps/web/lib/safety';
import type { TutorTurnResponse } from '../../apps/web/lib/ai/contracts';

const baseResponse: TutorTurnResponse = {
  schemaVersion: 'tutor-turn.v0.1',
  assistantMessageNb: 'Jeg hører deg.',
  intent: 'ask',
  taskState: 'in_progress',
  expectedStudentAction: 'none',
  hintLevel: 0,
  confidence: 0.8,
  learningEvidence: [],
  safetyFlags: ['none'],
};

describe('detectSafetySignal', () => {
  it('only flags explicit urgent language as urgent', () => {
    expect(detectSafetySignal('Jeg vil ikke leve lenger', baseResponse)).toEqual({
      level: 'urgent',
      code: 'self_harm',
    });
    expect(detectSafetySignal('Jeg blir slått hjemme', baseResponse)).toEqual({
      level: 'urgent',
      code: 'abuse',
    });
  });

  it('does not turn an ordinary school message into a safety signal', () => {
    expect(detectSafetySignal('Jeg synes brøk er vanskelig i dag.', baseResponse)).toBeNull();
  });

  it('supports an in-chat support signal without making it urgent', () => {
    expect(detectSafetySignal('Jeg klarer ikke mer akkurat nå.', baseResponse)).toEqual({
      level: 'support',
      code: 'distress',
    });
  });
});
