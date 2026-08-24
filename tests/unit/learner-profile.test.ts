import { describe, expect, it, vi } from 'vitest';

import { parseTutorTurnResponse, type TutorTurnResponse } from '../../apps/web/lib/ai/contracts';
import {
  persistLearnerProfile,
  type TutorPersistence,
} from '../../apps/web/app/api/tutor/respond/route';
import type { StudentProfile } from '../../apps/web/lib/supabase/data';

const baseResponse: TutorTurnResponse = {
  schemaVersion: 'tutor-turn.v0.1',
  assistantMessageNb: 'Fint, da tar vi det steg for steg.',
  intent: 'ask',
  taskState: 'awaiting_answer',
  expectedStudentAction: 'answer',
  hintLevel: 0,
  confidence: 0.9,
  learningEvidence: [],
  safetyFlags: ['none'],
};

const profile = {
  learner_profile_status: 'not_started',
  preferred_session_minutes: null,
  preferred_weekly_sessions: null,
  learning_style: null,
  strength_concept_keys: [],
  focus_concept_keys: [],
} as StudentProfile;

describe('learner profile updates', () => {
  it('accepts only controlled pedagogical profile fields', () => {
    const result = parseTutorTurnResponse({
      ...baseResponse,
      learnerProfileUpdate: {
        preferredSessionMinutes: 30,
        preferredWeeklySessions: 3,
        learningStyle: 'step_by_step',
        strengthConceptKeys: ['numbers.operations'],
        focusConceptKeys: ['numbers.fractions_decimals'],
        complete: false,
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        ...baseResponse,
        learnerProfileUpdate: {
          preferredSessionMinutes: 30,
          preferredWeeklySessions: 3,
          learningStyle: 'step_by_step',
          strengthConceptKeys: ['numbers.operations'],
          focusConceptKeys: ['numbers.fractions_decimals'],
          complete: false,
        },
      },
    });
  });

  it('rejects free-form topic text instead of storing it as learner memory', () => {
    const result = parseTutorTurnResponse({
      ...baseResponse,
      learnerProfileUpdate: {
        focusConceptKeys: ['Jeg synes brøk er vanskelig'],
      },
    });

    expect(result.ok).toBe(false);
  });

  it('merges explicit profile facts and never stores a raw chat note', async () => {
    const updateLearnerProfile = vi.fn().mockResolvedValue(profile);
    const data = {
      updateLearnerProfile,
    } as unknown as TutorPersistence;

    await persistLearnerProfile(data, profile, {
      ...baseResponse,
      learnerProfileUpdate: {
        preferredSessionMinutes: 45,
        focusConceptKeys: ['algebra.equations'],
      },
    });

    expect(updateLearnerProfile).toHaveBeenCalledWith({
      status: 'in_progress',
      preferredSessionMinutes: 45,
      focusConceptKeys: ['algebra.equations'],
    });
  });

  it('does not update the profile when the tutor has a safety flag', async () => {
    const updateLearnerProfile = vi.fn().mockResolvedValue(profile);
    const data = { updateLearnerProfile } as unknown as TutorPersistence;

    await persistLearnerProfile(data, profile, {
      ...baseResponse,
      safetyFlags: ['personal_data'],
      learnerProfileUpdate: { focusConceptKeys: ['algebra.equations'] },
    });

    expect(updateLearnerProfile).not.toHaveBeenCalled();
  });
});
