import { isUuid } from '../uuid';
import { MATTIS_CONCEPT_KEYS, type MattisConceptKey } from './homework-parser';

export const TUTOR_REQUEST_SCHEMA_VERSION = 'tutor-request.v0.1' as const;
export const TUTOR_RESPONSE_SCHEMA_VERSION = 'tutor-turn.v0.1' as const;

export type TutorMessageRole = 'student' | 'tutor';

export type TutorMessage = {
  role: TutorMessageRole;
  content: string;
};

export type LearnerProfileStatus = 'not_started' | 'in_progress' | 'complete';

export type LearnerProfileContext = {
  status: LearnerProfileStatus;
  ageBand: 'under_12' | '12_16' | '17_plus';
  parentTogetherRequired: boolean;
  preferredSessionMinutes: number | null;
  preferredWeeklySessions: number | null;
  learningStyle:
    'step_by_step' | 'examples_first' | 'independent' | 'mixed' | null;
  strengthConceptKeys: string[];
  focusConceptKeys: string[];
};

export type LearnerProfileUpdate = {
  preferredSessionMinutes?: number;
  preferredWeeklySessions?: number;
  learningStyle?: Exclude<LearnerProfileContext['learningStyle'], null>;
  strengthConceptKeys?: MattisConceptKey[];
  focusConceptKeys?: MattisConceptKey[];
  complete?: boolean;
};

export type TutorTaskSetContext = {
  title: string | null;
  activeTaskNumber: number;
  taskCount: number;
  completedTaskCount: number;
  remainingTaskCount: number;
  isLastTask: boolean;
  isFinished: boolean;
};

export type TutorRequest = {
  schemaVersion: typeof TUTOR_REQUEST_SCHEMA_VERSION;
  sessionId?: string;
  taskId?: string;
  taskText?: string;
  taskTopic?: string;
  taskSetContext?: TutorTaskSetContext;
  message: string;
  history: TutorMessage[];
  locale: string;
  clientMessageId?: string;
  learnerContext?: {
    gradeLevel: number | null;
    courseCode: string | null;
    mastery: Array<{
      conceptKey: string;
      estimate: number;
      confidence: number;
      evidenceCount: number;
    }>;
    learnerProfile?: LearnerProfileContext;
    sessionMemory?: {
      previousTopics: string[];
      recentSummaries: string[];
      currentPlanReason?: string | null;
      currentPlanFocusConcepts?: string[];
      internalNotes?: string[];
      isFirstSession?: boolean;
    };
  };
};

export type TutorApiRequest = {
  sessionId?: string;
  clientMessageId?: string;
  task?: {
    id?: string;
    text: string;
    topic?: string;
  };
  messages: TutorMessage[];
};

export type LearningEvidence = {
  conceptKey: string;
  evidenceType:
    | 'correct'
    | 'self_corrected'
    | 'hinted'
    | 'misconception'
    | 'explained'
    | 'skipped';
  score: number;
  confidence: number;
  misconceptionCode?: string;
  noteNb?: string;
};

export type TutorTurnResponse = {
  schemaVersion: typeof TUTOR_RESPONSE_SCHEMA_VERSION;
  assistantMessageNb: string;
  intent:
    | 'orient'
    | 'ask'
    | 'hint'
    | 'feedback'
    | 'check'
    | 'summarize'
    | 'redirect'
    | 'safety';
  taskState:
    | 'in_progress'
    | 'awaiting_answer'
    | 'checking'
    | 'ready_to_complete'
    | 'completed'
    | 'needs_human_review';
  expectedStudentAction:
    | 'answer'
    | 'explain'
    | 'calculate'
    | 'choose'
    | 'upload'
    | 'confirm_next'
    | 'none';
  hintLevel: number;
  confidence: number;
  learningEvidence: LearningEvidence[];
  learnerProfileUpdate?: LearnerProfileUpdate;
  safetyFlags: Array<
    | 'none'
    | 'personal_data'
    | 'self_harm'
    | 'abuse'
    | 'sexual_content'
    | 'academic_cheating'
    | 'model_uncertainty'
    | 'prompt_injection'
    | 'other'
  >;
  suggestedActions?: Array<
    | 'show_hint'
    | 'show_keyboard'
    | 'show_figure'
    | 'ask_for_photo'
    | 'next_task'
    | 'create_task_set'
    | 'end_session'
    | 'contact_adult'
  >;
};

export type ValidationResult<T> =
  { ok: true; value: T } | { ok: false; error: string };

const TUTOR_ROLES = new Set<TutorMessageRole>(['student', 'tutor']);
const RESPONSE_INTENTS = new Set<TutorTurnResponse['intent']>([
  'orient',
  'ask',
  'hint',
  'feedback',
  'check',
  'summarize',
  'redirect',
  'safety',
]);
const TASK_STATES = new Set<TutorTurnResponse['taskState']>([
  'in_progress',
  'awaiting_answer',
  'checking',
  'ready_to_complete',
  'completed',
  'needs_human_review',
]);
const EXPECTED_ACTIONS = new Set<TutorTurnResponse['expectedStudentAction']>([
  'answer',
  'explain',
  'calculate',
  'choose',
  'upload',
  'confirm_next',
  'none',
]);
const EVIDENCE_TYPES = new Set<LearningEvidence['evidenceType']>([
  'correct',
  'self_corrected',
  'hinted',
  'misconception',
  'explained',
  'skipped',
]);
const SAFETY_FLAGS = new Set<TutorTurnResponse['safetyFlags'][number]>([
  'none',
  'personal_data',
  'self_harm',
  'abuse',
  'sexual_content',
  'academic_cheating',
  'model_uncertainty',
  'prompt_injection',
  'other',
]);
const SUGGESTED_ACTIONS = new Set<
  NonNullable<TutorTurnResponse['suggestedActions']>[number]
>([
  'show_hint',
  'show_keyboard',
  'show_figure',
  'ask_for_photo',
  'next_task',
  'create_task_set',
  'end_session',
  'contact_adult',
]);
const LEARNING_STYLES = new Set<
  NonNullable<LearnerProfileUpdate['learningStyle']>
>(['step_by_step', 'examples_first', 'independent', 'mixed']);
const CONCEPT_KEYS = new Set<string>(MATTIS_CONCEPT_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function isBoundedString(
  value: unknown,
  min: number,
  max: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= min &&
    value.length <= max
  );
}

function isConfidence(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function parseHistory(value: unknown): ValidationResult<TutorMessage[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value) || value.length > 12) {
    return {
      ok: false,
      error: 'history må være en liste med høyst 12 meldinger.',
    };
  }

  const history: TutorMessage[] = [];
  for (const item of value) {
    if (!isRecord(item) || !hasOnlyKeys(item, ['role', 'content'])) {
      return { ok: false, error: 'history inneholder en ugyldig melding.' };
    }
    if (item.role !== 'student' && item.role !== 'tutor') {
      return { ok: false, error: 'history har en ugyldig rolle.' };
    }
    if (!isBoundedString(item.content, 1, 1200)) {
      return {
        ok: false,
        error: 'history-meldinger må være mellom 1 og 1200 tegn.',
      };
    }
    history.push({ role: item.role, content: item.content.trim() });
  }
  return { ok: true, value: history };
}

export function parseTutorRequest(
  value: unknown,
): ValidationResult<TutorRequest> {
  if (!isRecord(value))
    return { ok: false, error: 'Forespørselen må være et JSON-objekt.' };
  if (
    !hasOnlyKeys(value, [
      'schemaVersion',
      'sessionId',
      'taskId',
      'taskText',
      'taskTopic',
      'message',
      'history',
      'locale',
      'clientMessageId',
    ])
  ) {
    return { ok: false, error: 'Forespørselen inneholder ukjente felter.' };
  }
  if (
    value.schemaVersion !== undefined &&
    value.schemaVersion !== TUTOR_REQUEST_SCHEMA_VERSION
  ) {
    return { ok: false, error: 'Ukjent request-versjon.' };
  }
  if (!isUuid(value.sessionId)) {
    return { ok: false, error: 'sessionId må være en gyldig UUID.' };
  }
  if (value.taskId !== undefined && !isUuid(value.taskId)) {
    return { ok: false, error: 'taskId må være en gyldig UUID.' };
  }
  if (
    value.taskText !== undefined &&
    !isBoundedString(value.taskText, 1, 4000)
  ) {
    return { ok: false, error: 'taskText må være mellom 1 og 4000 tegn.' };
  }
  if (
    value.taskTopic !== undefined &&
    !isBoundedString(value.taskTopic, 1, 120)
  ) {
    return { ok: false, error: 'taskTopic må være mellom 1 og 120 tegn.' };
  }
  if (!isBoundedString(value.message, 1, 1200)) {
    return { ok: false, error: 'message må være mellom 1 og 1200 tegn.' };
  }
  if (value.locale !== undefined && !isBoundedString(value.locale, 2, 20)) {
    return { ok: false, error: 'locale er ugyldig.' };
  }
  if (value.clientMessageId !== undefined) {
    if (!isUuid(value.clientMessageId)) {
      return { ok: false, error: 'clientMessageId må være en gyldig UUID.' };
    }
  }

  const history = parseHistory(value.history);
  if (!history.ok) return history;

  return {
    ok: true,
    value: {
      schemaVersion: TUTOR_REQUEST_SCHEMA_VERSION,
      sessionId: value.sessionId,
      ...(value.taskId ? { taskId: value.taskId } : {}),
      ...(value.taskText ? { taskText: value.taskText.trim() } : {}),
      ...(value.taskTopic ? { taskTopic: value.taskTopic.trim() } : {}),
      message: value.message.trim(),
      history: history.value,
      locale: typeof value.locale === 'string' ? value.locale.trim() : 'nb-NO',
      ...(value.clientMessageId
        ? { clientMessageId: value.clientMessageId }
        : {}),
    },
  };
}

/** Public, provider-neutral request shape used by /api/tutor. */
export function parseTutorApiRequest(
  value: unknown,
): ValidationResult<TutorApiRequest> {
  if (!isRecord(value))
    return { ok: false, error: 'Forespørselen må være et JSON-objekt.' };
  if (
    !hasOnlyKeys(value, ['sessionId', 'clientMessageId', 'task', 'messages'])
  ) {
    return { ok: false, error: 'Forespørselen inneholder ukjente felter.' };
  }
  if (value.sessionId !== undefined && !isUuid(value.sessionId)) {
    return { ok: false, error: 'sessionId må være en gyldig UUID.' };
  }
  if (value.clientMessageId !== undefined && !isUuid(value.clientMessageId)) {
    return { ok: false, error: 'clientMessageId må være en gyldig UUID.' };
  }
  if (
    !Array.isArray(value.messages) ||
    value.messages.length === 0 ||
    value.messages.length > 12
  ) {
    return {
      ok: false,
      error: 'messages må inneholde mellom 1 og 12 meldinger.',
    };
  }
  const history = parseHistory(value.messages);
  if (!history.ok) return history;

  let task: TutorApiRequest['task'];
  if (value.task !== undefined) {
    if (
      !isRecord(value.task) ||
      !hasOnlyKeys(value.task, ['id', 'text', 'topic'])
    ) {
      return { ok: false, error: 'task er ugyldig.' };
    }
    if (value.task.id !== undefined && !isUuid(value.task.id)) {
      return { ok: false, error: 'task.id må være en gyldig UUID.' };
    }
    if (!isBoundedString(value.task.text, 1, 4000)) {
      return { ok: false, error: 'task.text må være mellom 1 og 4000 tegn.' };
    }
    if (
      value.task.topic !== undefined &&
      !isBoundedString(value.task.topic, 1, 120)
    ) {
      return { ok: false, error: 'task.topic er ugyldig.' };
    }
    task = {
      text: value.task.text.trim(),
      ...(typeof value.task.id === 'string' ? { id: value.task.id } : {}),
      ...(typeof value.task.topic === 'string'
        ? { topic: value.task.topic.trim() }
        : {}),
    };
  }

  return {
    ok: true,
    value: {
      ...(typeof value.sessionId === 'string'
        ? { sessionId: value.sessionId }
        : {}),
      ...(typeof value.clientMessageId === 'string'
        ? { clientMessageId: value.clientMessageId }
        : {}),
      ...(task ? { task } : {}),
      messages: history.value,
    },
  };
}

export function tutorApiRequestToTutorRequest(
  input: TutorApiRequest,
): TutorRequest {
  return {
    schemaVersion: TUTOR_REQUEST_SCHEMA_VERSION,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.clientMessageId
      ? { clientMessageId: input.clientMessageId }
      : {}),
    ...(input.task?.id ? { taskId: input.task.id } : {}),
    ...(input.task?.text ? { taskText: input.task.text } : {}),
    ...(input.task?.topic ? { taskTopic: input.task.topic } : {}),
    message: input.messages[input.messages.length - 1]?.content ?? '',
    history: input.messages.slice(0, -1),
    locale: 'nb-NO',
  };
}

function parseEvidence(value: unknown): ValidationResult<LearningEvidence[]> {
  if (!Array.isArray(value) || value.length > 5) {
    return { ok: false, error: 'learningEvidence er ugyldig.' };
  }
  const evidence: LearningEvidence[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, [
        'conceptKey',
        'evidenceType',
        'score',
        'confidence',
        'misconceptionCode',
        'noteNb',
      ]) ||
      !isBoundedString(item.conceptKey, 1, 80) ||
      typeof item.evidenceType !== 'string' ||
      !EVIDENCE_TYPES.has(
        item.evidenceType as LearningEvidence['evidenceType'],
      ) ||
      !isConfidence(item.score) ||
      !isConfidence(item.confidence)
    ) {
      return {
        ok: false,
        error: 'learningEvidence inneholder en ugyldig verdi.',
      };
    }
    if (
      item.misconceptionCode !== undefined &&
      !isBoundedString(item.misconceptionCode, 1, 80)
    ) {
      return { ok: false, error: 'misconceptionCode er ugyldig.' };
    }
    if (item.noteNb !== undefined && !isBoundedString(item.noteNb, 1, 500)) {
      return { ok: false, error: 'noteNb er ugyldig.' };
    }
    evidence.push({
      conceptKey: item.conceptKey.trim(),
      evidenceType: item.evidenceType as LearningEvidence['evidenceType'],
      score: item.score,
      confidence: item.confidence,
      ...(typeof item.misconceptionCode === 'string'
        ? { misconceptionCode: item.misconceptionCode.trim() }
        : {}),
      ...(typeof item.noteNb === 'string'
        ? { noteNb: item.noteNb.trim() }
        : {}),
    });
  }
  return { ok: true, value: evidence };
}

function parseConceptKeys(
  value: unknown,
  field: string,
): ValidationResult<MattisConceptKey[]> {
  if (!Array.isArray(value) || value.length > 8) {
    return { ok: false, error: `${field} er ugyldig.` };
  }
  const concepts = value.filter(
    (concept): concept is MattisConceptKey =>
      typeof concept === 'string' && CONCEPT_KEYS.has(concept),
  );
  if (concepts.length !== value.length)
    return { ok: false, error: `${field} er ugyldig.` };
  return { ok: true, value: Array.from(new Set(concepts)) };
}

function parseLearnerProfileUpdate(
  value: unknown,
):
  | ValidationResult<LearnerProfileUpdate | undefined>
  | { ok: true; value: undefined } {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isRecord(value))
    return { ok: false, error: 'learnerProfileUpdate er ugyldig.' };
  if (
    !hasOnlyKeys(value, [
      'preferredSessionMinutes',
      'preferredWeeklySessions',
      'learningStyle',
      'strengthConceptKeys',
      'focusConceptKeys',
      'complete',
    ])
  ) {
    return {
      ok: false,
      error: 'learnerProfileUpdate inneholder ukjente felter.',
    };
  }

  const update: LearnerProfileUpdate = {};
  if (value.preferredSessionMinutes !== undefined) {
    if (
      typeof value.preferredSessionMinutes !== 'number' ||
      !Number.isInteger(value.preferredSessionMinutes) ||
      value.preferredSessionMinutes < 10 ||
      value.preferredSessionMinutes > 180
    ) {
      return { ok: false, error: 'preferredSessionMinutes er ugyldig.' };
    }
    update.preferredSessionMinutes = value.preferredSessionMinutes;
  }
  if (value.preferredWeeklySessions !== undefined) {
    if (
      typeof value.preferredWeeklySessions !== 'number' ||
      !Number.isInteger(value.preferredWeeklySessions) ||
      value.preferredWeeklySessions < 1 ||
      value.preferredWeeklySessions > 7
    ) {
      return { ok: false, error: 'preferredWeeklySessions er ugyldig.' };
    }
    update.preferredWeeklySessions = value.preferredWeeklySessions;
  }
  if (value.learningStyle !== undefined) {
    if (
      typeof value.learningStyle !== 'string' ||
      !LEARNING_STYLES.has(
        value.learningStyle as NonNullable<
          LearnerProfileUpdate['learningStyle']
        >,
      )
    ) {
      return { ok: false, error: 'learningStyle er ugyldig.' };
    }
    update.learningStyle =
      value.learningStyle as LearnerProfileUpdate['learningStyle'];
  }
  if (value.strengthConceptKeys !== undefined) {
    const concepts = parseConceptKeys(
      value.strengthConceptKeys,
      'strengthConceptKeys',
    );
    if (!concepts.ok) return concepts;
    update.strengthConceptKeys = concepts.value;
  }
  if (value.focusConceptKeys !== undefined) {
    const concepts = parseConceptKeys(
      value.focusConceptKeys,
      'focusConceptKeys',
    );
    if (!concepts.ok) return concepts;
    update.focusConceptKeys = concepts.value;
  }
  if (value.complete !== undefined) {
    if (typeof value.complete !== 'boolean') {
      return { ok: false, error: 'complete er ugyldig.' };
    }
    update.complete = value.complete;
  }

  return { ok: true, value: Object.keys(update).length ? update : undefined };
}

export function parseTutorTurnResponse(
  value: unknown,
): ValidationResult<TutorTurnResponse> {
  if (!isRecord(value))
    return { ok: false, error: 'Modellen returnerte ikke et objekt.' };
  if (
    !hasOnlyKeys(value, [
      'schemaVersion',
      'assistantMessageNb',
      'intent',
      'taskState',
      'expectedStudentAction',
      'hintLevel',
      'confidence',
      'learningEvidence',
      'learnerProfileUpdate',
      'safetyFlags',
      'suggestedActions',
    ]) ||
    value.schemaVersion !== TUTOR_RESPONSE_SCHEMA_VERSION ||
    !isBoundedString(value.assistantMessageNb, 1, 1200) ||
    typeof value.intent !== 'string' ||
    !RESPONSE_INTENTS.has(value.intent as TutorTurnResponse['intent']) ||
    typeof value.taskState !== 'string' ||
    !TASK_STATES.has(value.taskState as TutorTurnResponse['taskState']) ||
    typeof value.expectedStudentAction !== 'string' ||
    !EXPECTED_ACTIONS.has(
      value.expectedStudentAction as TutorTurnResponse['expectedStudentAction'],
    ) ||
    typeof value.hintLevel !== 'number' ||
    !Number.isInteger(value.hintLevel) ||
    value.hintLevel < 0 ||
    value.hintLevel > 4 ||
    !isConfidence(value.confidence) ||
    !Array.isArray(value.safetyFlags) ||
    value.safetyFlags.length > 10 ||
    value.safetyFlags.some(
      (flag) =>
        typeof flag !== 'string' ||
        !SAFETY_FLAGS.has(flag as TutorTurnResponse['safetyFlags'][number]),
    )
  ) {
    return {
      ok: false,
      error: 'Modellen returnerte en ugyldig tutor-kontrakt.',
    };
  }

  const evidence = parseEvidence(value.learningEvidence);
  if (!evidence.ok) return evidence;
  const learnerProfileUpdate = parseLearnerProfileUpdate(
    value.learnerProfileUpdate,
  );
  if (!learnerProfileUpdate.ok) return learnerProfileUpdate;
  let suggestedActions: TutorTurnResponse['suggestedActions'];
  if (value.suggestedActions !== undefined) {
    if (
      !Array.isArray(value.suggestedActions) ||
      value.suggestedActions.length > 4 ||
      value.suggestedActions.some(
        (action) =>
          typeof action !== 'string' ||
          !SUGGESTED_ACTIONS.has(
            action as NonNullable<
              TutorTurnResponse['suggestedActions']
            >[number],
          ),
      )
    ) {
      return { ok: false, error: 'suggestedActions er ugyldig.' };
    }
    suggestedActions =
      value.suggestedActions as TutorTurnResponse['suggestedActions'];
  }

  return {
    ok: true,
    value: {
      schemaVersion: TUTOR_RESPONSE_SCHEMA_VERSION,
      assistantMessageNb: value.assistantMessageNb.trim(),
      intent: value.intent as TutorTurnResponse['intent'],
      taskState: value.taskState as TutorTurnResponse['taskState'],
      expectedStudentAction:
        value.expectedStudentAction as TutorTurnResponse['expectedStudentAction'],
      hintLevel: value.hintLevel,
      confidence: value.confidence,
      learningEvidence: evidence.value,
      ...(learnerProfileUpdate.value
        ? { learnerProfileUpdate: learnerProfileUpdate.value }
        : {}),
      safetyFlags: value.safetyFlags as TutorTurnResponse['safetyFlags'],
      ...(suggestedActions ? { suggestedActions } : {}),
    },
  };
}
