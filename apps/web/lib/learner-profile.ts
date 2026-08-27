export type LearnerAgeBand = 'under_12' | '12_16' | '17_plus';

/**
 * The parent can provide a more precise age band. This fallback is deliberately
 * conservative for profiles created before age was collected.
 */
export function ageBandForGrade(
  gradeLevel: number | null | undefined,
): LearnerAgeBand {
  if (!gradeLevel || gradeLevel <= 4) return 'under_12';
  if (gradeLevel <= 11) return '12_16';
  return '17_plus';
}

export function parentTogetherRequired(gradeLevel: number | null | undefined) {
  return typeof gradeLevel === 'number' && gradeLevel >= 1 && gradeLevel <= 4;
}

export function ageBandLabel(ageBand: LearnerAgeBand) {
  if (ageBand === 'under_12') return 'Under 12 år';
  if (ageBand === '12_16') return '12–16 år';
  return '17 år eller eldre';
}
