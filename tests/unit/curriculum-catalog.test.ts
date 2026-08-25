import { describe, expect, it } from 'vitest';

import {
  CURRICULUM_STAGES,
  CURRICULUM_TRACKS,
  getCurriculumTrack,
  normalizeCurriculumSelection,
} from '../../apps/web/lib/curriculum/catalog';

describe('curriculum catalogue', () => {
  it('covers every school stage from first grade through Vg3', () => {
    expect(CURRICULUM_STAGES.map((stage) => stage.value)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    expect(CURRICULUM_STAGES.find((stage) => stage.value === 11)?.courseCodes).toEqual([
      '1P',
      '1T',
      '1P-Y',
    ]);
    expect(CURRICULUM_STAGES.find((stage) => stage.value === 12)?.courseCodes).toEqual([
      '2P',
      'S1',
      'R1',
    ]);
    expect(CURRICULUM_STAGES.find((stage) => stage.value === 13)?.courseCodes).toEqual([
      'S2',
      'R2',
      '2P-Y',
    ]);
  });

  it('keeps every selectable track connected to an official plan and goals', () => {
    expect(
      CURRICULUM_TRACKS.every((track) => track.officialUrl.startsWith('https://www.udir.no/')),
    ).toBe(true);
    expect(CURRICULUM_TRACKS.every((track) => track.competenceGoals.length > 0)).toBe(true);
    expect(getCurriculumTrack('1T')?.planCode).toBe('MAT09-02');
    expect(getCurriculumTrack('2P-Y')?.planCode).toBe('MAT06-04');
  });

  it('normalizes primary levels and validates upper-secondary course combinations', () => {
    expect(normalizeCurriculumSelection(10, null)?.code).toBe('MAT01-06');
    expect(normalizeCurriculumSelection(12, 'S1')?.code).toBe('S1');
    expect(normalizeCurriculumSelection(12, 'R2')).toBeNull();
    expect(normalizeCurriculumSelection(13, '2P-Y')?.code).toBe('2P-Y');
  });
});
