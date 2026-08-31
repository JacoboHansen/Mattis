import type { LearnerProfileContext } from './ai/contracts';
import { ageBandForGrade, parentTogetherRequired } from './learner-profile';
import type { StudentProfile } from './supabase/data';

export type LearnerIntakePreferences = {
  goal: string | null;
  workMode: string | null;
  scheduleMode: 'fixed' | 'flexible' | null;
  schedule: string | null;
  schoolContext: string | null;
  homeworkContext: string | null;
};

function intakeObject(profile: Pick<StudentProfile, 'intake_data'>) {
  const value = profile.intake_data;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown, maximum = 240) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maximum)
    : null;
}

export function learnerIntakePreferences(
  profile: Pick<StudentProfile, 'intake_data'>,
): LearnerIntakePreferences {
  const intake = intakeObject(profile);
  return {
    goal: textValue(intake.goal === 'other' ? intake.goalOther : intake.goal),
    workMode: textValue(intake.workMode),
    scheduleMode:
      intake.scheduleMode === 'fixed' || intake.scheduleMode === 'flexible'
        ? intake.scheduleMode
        : null,
    schedule: textValue(intake.schedule),
    schoolContext: textValue(intake.schoolWork),
    homeworkContext: textValue(intake.homework),
  };
}

export function learnerProfileContext(
  profile: StudentProfile,
): LearnerProfileContext {
  const styles = new Set<LearnerProfileContext['learningStyle']>([
    'step_by_step',
    'examples_first',
    'independent',
    'mixed',
  ]);
  const statuses = new Set<LearnerProfileContext['status']>([
    'not_started',
    'in_progress',
    'complete',
  ]);
  const preferences = learnerIntakePreferences(profile);
  return {
    ageBand:
      (profile.age_band as LearnerProfileContext['ageBand'] | null) ??
      ageBandForGrade(profile.grade_level),
    parentTogetherRequired: parentTogetherRequired(profile.grade_level),
    status: statuses.has(
      profile.learner_profile_status as LearnerProfileContext['status'],
    )
      ? (profile.learner_profile_status as LearnerProfileContext['status'])
      : 'not_started',
    preferredSessionMinutes: profile.preferred_session_minutes ?? null,
    preferredWeeklySessions: profile.preferred_weekly_sessions ?? null,
    learningStyle: styles.has(
      profile.learning_style as LearnerProfileContext['learningStyle'],
    )
      ? (profile.learning_style as LearnerProfileContext['learningStyle'])
      : null,
    strengthConceptKeys: (profile.strength_concept_keys ??
      []) as LearnerProfileContext['strengthConceptKeys'],
    focusConceptKeys: (profile.focus_concept_keys ??
      []) as LearnerProfileContext['focusConceptKeys'],
    ...preferences,
  };
}

export function cleanStoredNextTopic(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(
      /^(?:vi skal|vi bør|vi må|jeg skal|jeg bør|jeg må)\s+(?:jobbe|øve|se|repetere)\s+(?:litt\s+)?(?:med|på)\s+/i,
      '',
    )
    .replace(/^(?:jobbe|øve|se|repetere)\s+(?:litt\s+)?(?:med|på)\s+/i, '')
    .replace(/\s+(?:i dag|til neste gang|neste gang)$/i, '')
    .trim();
  if (!cleaned || /følg opp det siste læringsnotatet/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}
