import { describe, expect, it } from 'vitest';

import { buildProgressOverview } from '../../apps/web/lib/progress';
import type { StudentCurriculumConcept, StudentMastery } from '../../apps/web/lib/supabase/data';

const concept = (overrides: Partial<StudentCurriculumConcept>): StudentCurriculumConcept => ({
  concept_key: 'numbers.operations',
  title_nb: 'Regnearter',
  description_nb: 'Addisjon og subtraksjon.',
  grade_min: 1,
  grade_max: 13,
  prerequisite_keys: [],
  curriculum_version: 'MAT01-05-taxonomy-v1',
  source_reference: 'LK20 MAT01-05',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const mastery = (overrides: Partial<StudentMastery>): StudentMastery => ({
  user_id: '00000000-0000-0000-0000-000000000001',
  concept_key: 'numbers.operations',
  estimate: 0.82,
  confidence: 0.8,
  evidence_count: 3,
  last_practiced_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('progress overview', () => {
  it('shows only topics relevant to the learner grade', () => {
    const overview = buildProgressOverview(
      [
        concept({ concept_key: 'numbers.operations' }),
        concept({
          concept_key: 'functions.other',
          title_nb: 'Ikke-lineære funksjoner',
          grade_min: 9,
        }),
      ],
      [],
      8,
    );

    expect(overview.totalTopics).toBe(1);
    expect(overview.groups[0]?.topics[0]?.title).toBe('Regnearter');
  });

  it('keeps topics without evidence distinct from low mastery', () => {
    const overview = buildProgressOverview(
      [
        concept({ concept_key: 'numbers.operations' }),
        concept({
          concept_key: 'numbers.fractions_decimals',
          title_nb: 'Brøk og desimaltall',
        }),
      ],
      [mastery({ concept_key: 'numbers.operations', estimate: 0.82 })],
      8,
    );

    const topics = overview.groups.flatMap((group) => group.topics);
    expect(topics.find((topic) => topic.conceptKey === 'numbers.operations')?.statusLabel).toBe(
      'God kontroll',
    );
    expect(
      topics.find((topic) => topic.conceptKey === 'numbers.fractions_decimals')?.statusLabel,
    ).toBe('Ikke startet');
    expect(overview.startedTopics).toBe(1);
  });
});
