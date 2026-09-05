import type { Database, Json } from '../database.types';
import { isUuid } from '../uuid';

type Fetcher = typeof fetch;

type SessionRow = Database['public']['Tables']['sessions']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];
type LearningSignalRow =
  Database['public']['Tables']['learning_evidence']['Row'];
type AiGenerationRow = Database['public']['Tables']['ai_generations']['Row'];
type TaskRow = Database['public']['Tables']['tasks']['Row'];
type HomeworkUploadRow =
  Database['public']['Tables']['homework_uploads']['Row'];
type ProfileRow = Database['public']['Tables']['learner_profiles']['Row'];
type MasteryRow = Database['public']['Tables']['mastery']['Row'];
type CurriculumConceptRow =
  Database['public']['Tables']['curriculum_concepts']['Row'];
type ScheduleRow = Database['public']['Tables']['schedules']['Row'];
type PushSubscriptionRow =
  Database['public']['Tables']['push_subscriptions']['Row'];

export type TutorSession = SessionRow;
export type TutorMessage = MessageRow;
export type LearningSignal = LearningSignalRow;
export type AiGeneration = AiGenerationRow;
export type TutorTask = TaskRow;
export type HomeworkUpload = HomeworkUploadRow;
export type StudentProfile = ProfileRow;
export type StudentMastery = MasteryRow;
export type StudentCurriculumConcept = CurriculumConceptRow;
export type TutorSchedule = ScheduleRow;
export type TutorPushSubscription = PushSubscriptionRow;

export type UpdateLearnerProfileInput = {
  intakeData?: Json;
  intakeStep?: string;
  status?: 'not_started' | 'in_progress' | 'complete';
  preferredSessionMinutes?: number;
  preferredWeeklySessions?: number;
  learningStyle?: 'step_by_step' | 'examples_first' | 'independent' | 'mixed';
  strengthConceptKeys?: string[];
  focusConceptKeys?: string[];
};

export type CreateTutorSessionInput = {
  durationMinutes?: number;
  plannedAt?: string | null;
  startImmediately?: boolean;
  scheduleId?: string | null;
  creationKey?: string | null;
  openingMessageNb?: string | null;
  openingMessagesNb?: string[];
  planSnapshot?: Json;
};

export type UpdateTutorSessionInput = {
  durationMinutes?: number;
  status?: Database['public']['Enums']['session_status'];
  currentPhase?: string;
  plannedAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  summaryNb?: string | null;
  nextTopicNb?: string | null;
  planSnapshot?: Json;
};

export type AppendTutorMessageInput = {
  role: Database['public']['Enums']['message_role'];
  contentNb: string;
  clientMessageId: string;
  taskId?: string | null;
  intent?: string | null;
  metadata?: Json;
};

export type RecordLearningSignalInput = {
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
  taskId?: string | null;
  misconceptionCode?: string | null;
  noteNb?: string | null;
  sourceMessageId?: string | null;
};

export type CreateTutorTaskInput = {
  id?: string;
  sourceText: string;
  normalizedText?: string;
  sourceLabel?: string | null;
  taskType?: string;
  conceptKeys?: string[];
  figureSpec?: Json | null;
  parseConfidence?: number;
  uploadId?: string | null;
  phase?: 'homework' | 'repetition';
  origin?: 'image' | 'manual' | 'planned_review';
  estimatedMinutes?: number;
  status?: Database['public']['Enums']['task_status'];
};

export type UpdateTutorTaskInput = {
  sourceText?: string;
  normalizedText?: string;
  sourceLabel?: string | null;
  taskType?: string;
  conceptKeys?: string[];
  figureSpec?: Json | null;
  parseConfidence?: number;
  phase?: 'homework' | 'repetition';
  origin?: 'image' | 'manual' | 'planned_review';
  estimatedMinutes?: number;
  status?: Database['public']['Enums']['task_status'];
  completedAt?: string | null;
};

export type RecordAiGenerationInput = {
  capability: 'homework_parser' | 'tutor' | 'figure_generator' | 'task_set';
  provider: string;
  model: string;
  requestSchemaVersion: string;
  responseSchemaVersion: string;
  status: 'succeeded' | 'failed' | 'blocked' | 'cancelled';
  sessionId?: string | null;
  taskId?: string | null;
  promptHash?: string | null;
  latencyMs?: number | null;
  inputUnits?: number | null;
  outputUnits?: number | null;
  estimatedCostUsd?: number | null;
  safetyFlags?: string[];
};

export class TutorDataError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'TutorDataError';
  }
}

const SESSION_SELECT =
  'id,user_id,learner_id,status,current_phase,planned_at,duration_minutes,started_at,ended_at,summary_nb,next_topic_nb,plan_snapshot,schedule_id,reminder_sent_at,creation_key,created_at,updated_at,delete_after';
const MESSAGE_SELECT =
  'id,user_id,learner_id,session_id,task_id,role,content_nb,intent,client_message_id,metadata,created_at,expires_at';
const SIGNAL_SELECT =
  'id,user_id,learner_id,session_id,task_id,concept_key,evidence_type,score,confidence,misconception_code,note_nb,source_message_id,created_at';
const TASK_SELECT =
  'id,user_id,learner_id,session_id,upload_id,sequence_no,source_label,source_text,normalized_text,task_type,concept_keys,figure_spec,parse_confidence,status,phase,origin,estimated_minutes,completed_at,created_at,updated_at';
const UPLOAD_SELECT =
  'id,user_id,learner_id,session_id,storage_path,mime_type,width_px,height_px,byte_size,sha256,status,page_number,delete_after,deleted_at,created_at';
const PROFILE_SELECT =
  'id,display_name,grade_level,course_code,weekly_goal_minutes,locale,timezone,onboarding_completed_at,learner_profile_status,preferred_session_minutes,preferred_weekly_sessions,learning_style,strength_concept_keys,focus_concept_keys,age_band,parent_together_confirmed,safety_acknowledged_at,intake_step,intake_data,created_from_pending_id,created_at,updated_at';
const MASTERY_SELECT =
  'user_id,learner_id,concept_key,estimate,confidence,evidence_count,last_practiced_at,updated_at';
const CURRICULUM_CONCEPT_SELECT =
  'concept_key,title_nb,description_nb,grade_min,grade_max,prerequisite_keys,curriculum_version,source_reference,created_at,updated_at';
const SCHEDULE_SELECT =
  'id,user_id,learner_id,starts_at,duration_minutes,focus_nb,recurrence_rule,enabled,created_at,updated_at';

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  // This client intentionally refuses to fall back to SUPABASE_SERVICE_ROLE_KEY.
  // The service role bypasses RLS and must never be used for student data access.
  if (!url || !publishableKey) {
    throw new TutorDataError(
      'Supabase er ikke konfigurert.',
      503,
      'missing_config',
    );
  }

  return { url, publishableKey };
}

function nonEmpty(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized)
    throw new TutorDataError(
      `${field} kan ikke være tom.`,
      400,
      'invalid_input',
    );
  return normalized;
}

function validUuid(value: string, field: string) {
  const normalized = nonEmpty(value, field);
  if (!isUuid(normalized)) {
    throw new TutorDataError(
      `${field} må være en gyldig UUID.`,
      400,
      'invalid_input',
    );
  }
  return normalized;
}

function boundedLimit(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TutorDataError(
      'Grensen må være et positivt heltall.',
      400,
      'invalid_input',
    );
  }
  return Math.min(value, 100);
}

function assertDuration(value: number) {
  if (!Number.isInteger(value) || value < 10 || value > 180) {
    throw new TutorDataError(
      'Økten må vare mellom 10 og 180 minutter.',
      400,
      'invalid_input',
    );
  }
}

function assertScore(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TutorDataError(
      `${field} må være mellom 0 og 1.`,
      400,
      'invalid_input',
    );
  }
}

function assertEstimatedMinutes(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 60) {
    throw new TutorDataError(
      'Oppgavetid må være mellom 1 og 60 minutter.',
      400,
      'invalid_input',
    );
  }
}

const HOMEWORK_MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

function homeworkExtension(mimeType: string) {
  const extension =
    HOMEWORK_MIME_EXTENSIONS[mimeType as keyof typeof HOMEWORK_MIME_EXTENSIONS];
  if (!extension) {
    throw new TutorDataError(
      'Bildet må være JPG, PNG eller WebP.',
      400,
      'invalid_input',
    );
  }
  return extension;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 'Ukjent Supabase-feil.';
  const source = payload as Record<string, unknown>;
  const candidates = [
    source.message,
    source.msg,
    source.details,
    source.error_description,
  ];
  return (
    candidates.find((value): value is string => typeof value === 'string') ??
    'Ukjent Supabase-feil.'
  );
}

function errorCode(payload: unknown) {
  if (!payload || typeof payload !== 'object') return undefined;
  const code = (payload as Record<string, unknown>).code;
  return typeof code === 'string' ? code : undefined;
}

function rows<T>(payload: unknown): T[] {
  return Array.isArray(payload) ? (payload as T[]) : [];
}

export type TutorDataClientOptions = {
  accessToken: string;
  userId: string;
  learnerId: string;
  fetcher?: Fetcher;
};

/**
 * A deliberately server-side data client for the authenticated student.
 *
 * `userId` should come from a fresh Supabase Auth `getUser`/`/auth/v1/user`
 * result. It is included in filters and payloads for query/index efficiency,
 * while Supabase RLS remains the authorization boundary.
 */
export class TutorDataClient {
  private readonly fetcher: Fetcher;
  private readonly accessToken: string;
  private readonly userId: string;
  private readonly learnerId: string;

  constructor(options: TutorDataClientOptions) {
    this.accessToken = nonEmpty(options.accessToken, 'Access token');
    this.userId = nonEmpty(options.userId, 'Bruker-ID');
    this.learnerId = nonEmpty(options.learnerId, 'Elevprofil-ID');
    this.fetcher = options.fetcher ?? fetch;
  }

  private async request(path: string, init: RequestInit = {}) {
    const { url, publishableKey } = getConfig();
    const response = await this.fetcher(`${url}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new TutorDataError(
        errorMessage(payload),
        response.status,
        errorCode(payload),
      );
    }
    return payload;
  }

  async createSession(
    input: CreateTutorSessionInput = {},
  ): Promise<TutorSession> {
    const durationMinutes = input.durationMinutes ?? 45;
    assertDuration(durationMinutes);
    const creationKey = input.creationKey
      ? validUuid(input.creationKey, 'Øktens idempotensnøkkel')
      : null;
    const startedAt = input.startImmediately ? new Date().toISOString() : null;
    const planMode =
      input.planSnapshot &&
      typeof input.planSnapshot === 'object' &&
      !Array.isArray(input.planSnapshot)
        ? (input.planSnapshot as Record<string, Json | undefined>).mode
        : undefined;
    const payload = await this.request('/rest/v1/sessions', {
      method: 'POST',
      headers: {
        Prefer: creationKey
          ? 'resolution=ignore-duplicates,return=representation'
          : 'return=representation',
      },
      body: JSON.stringify({
        user_id: this.userId,
        learner_id: this.learnerId,
        status: input.startImmediately ? 'active' : 'planned',
        current_phase: planMode === 'getting_to_know' ? 'intro' : 'homework',
        duration_minutes: durationMinutes,
        planned_at: input.plannedAt ?? null,
        started_at: startedAt,
        schedule_id: input.scheduleId ?? null,
        ...(creationKey ? { creation_key: creationKey } : {}),
        ...(input.planSnapshot !== undefined
          ? { plan_snapshot: input.planSnapshot }
          : {}),
      }),
    });
    const session = rows<TutorSession>(payload)[0];
    if (!session && creationKey) {
      const existing = await this.getSessionByCreationKey(creationKey);
      if (existing) return existing;
    }
    if (!session)
      throw new TutorDataError(
        'Økten ble ikke opprettet.',
        502,
        'empty_insert',
      );
    return session;
  }

  async getSessionByCreationKey(
    creationKey: string,
  ): Promise<TutorSession | null> {
    const key = encodeURIComponent(
      validUuid(creationKey, 'Øktens idempotensnøkkel'),
    );
    const payload = await this.request(
      `/rest/v1/sessions?creation_key=eq.${key}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${SESSION_SELECT}&limit=1`,
    );
    return rows<TutorSession>(payload)[0] ?? null;
  }

  async getSession(sessionId: string): Promise<TutorSession | null> {
    const id = encodeURIComponent(nonEmpty(sessionId, 'Økt-ID'));
    const payload = await this.request(
      `/rest/v1/sessions?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${SESSION_SELECT}&limit=1`,
    );
    return rows<TutorSession>(payload)[0] ?? null;
  }

  async getSchedule(scheduleId: string): Promise<TutorSchedule | null> {
    const id = encodeURIComponent(validUuid(scheduleId, 'Plan-ID'));
    const payload = await this.request(
      `/rest/v1/schedules?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${SCHEDULE_SELECT}&limit=1`,
    );
    return rows<TutorSchedule>(payload)[0] ?? null;
  }

  async listSessions(limit = 20): Promise<TutorSession[]> {
    const safeLimit = boundedLimit(limit);
    const payload = await this.request(
      `/rest/v1/sessions?user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${SESSION_SELECT}&order=created_at.desc&limit=${safeLimit}`,
    );
    return rows<TutorSession>(payload);
  }

  async createSchedule(input: {
    id?: string;
    startsAt: string;
    durationMinutes: number;
    focusNb?: string | null;
    recurrenceRule?: string | null;
  }): Promise<TutorSchedule> {
    assertDuration(input.durationMinutes);
    const startsAt = new Date(input.startsAt);
    if (!Number.isFinite(startsAt.getTime())) {
      throw new TutorDataError('Tidspunktet er ugyldig.', 400, 'invalid_input');
    }
    if (input.id) {
      const existing = await this.getSchedule(input.id);
      if (existing) return existing;
    }
    const payload = await this.request('/rest/v1/schedules', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: this.userId,
        learner_id: this.learnerId,
        ...(input.id ? { id: validUuid(input.id, 'Avtale-ID') } : {}),
        starts_at: startsAt.toISOString(),
        duration_minutes: input.durationMinutes,
        focus_nb: input.focusNb?.trim().slice(0, 240) || null,
        recurrence_rule: input.recurrenceRule?.trim().slice(0, 240) || null,
        enabled: true,
      }),
    });
    const schedule = rows<TutorSchedule>(payload)[0];
    if (!schedule)
      throw new TutorDataError(
        'Tidspunktet ble ikke lagret.',
        502,
        'empty_insert',
      );
    return schedule;
  }

  async listSchedules(limit = 20): Promise<TutorSchedule[]> {
    const safeLimit = boundedLimit(limit);
    const payload = await this.request(
      `/rest/v1/schedules?user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&enabled=eq.true&select=${SCHEDULE_SELECT}&order=starts_at.asc&limit=${safeLimit}`,
    );
    return rows<TutorSchedule>(payload);
  }

  async updateSchedule(
    scheduleId: string,
    input: { startsAt?: string; enabled?: boolean },
  ): Promise<TutorSchedule> {
    const id = encodeURIComponent(validUuid(scheduleId, 'Plan-ID'));
    const body: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.startsAt !== undefined) {
      const startsAt = new Date(input.startsAt);
      if (!Number.isFinite(startsAt.getTime())) {
        throw new TutorDataError(
          'Tidspunktet er ugyldig.',
          400,
          'invalid_input',
        );
      }
      body.starts_at = startsAt.toISOString();
    }
    if (input.enabled !== undefined) body.enabled = input.enabled;
    const payload = await this.request(
      `/rest/v1/schedules?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${SCHEDULE_SELECT}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body),
      },
    );
    const schedule = rows<TutorSchedule>(payload)[0];
    if (!schedule)
      throw new TutorDataError('Planen finnes ikke.', 404, 'not_found');
    return schedule;
  }

  async upsertPushSubscription(input: {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
  }): Promise<TutorPushSubscription> {
    const endpoint = nonEmpty(input.endpoint, 'Push-endepunkt').slice(0, 2048);
    const p256dh = nonEmpty(input.p256dh, 'Push-nøkkel').slice(0, 256);
    const auth = nonEmpty(input.auth, 'Push-autentisering').slice(0, 256);
    const payload = await this.request(
      '/rest/v1/push_subscriptions?on_conflict=endpoint',
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify({
          user_id: this.userId,
          endpoint,
          p256dh,
          auth,
          user_agent: input.userAgent?.trim().slice(0, 256) || null,
        }),
      },
    );
    const subscription = rows<TutorPushSubscription>(payload)[0];
    if (!subscription) {
      throw new TutorDataError(
        'Push-varslet ble ikke registrert.',
        502,
        'empty_insert',
      );
    }
    return subscription;
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    const encodedEndpoint = encodeURIComponent(
      nonEmpty(endpoint, 'Push-endepunkt'),
    );
    await this.request(
      `/rest/v1/push_subscriptions?endpoint=eq.${encodedEndpoint}&user_id=eq.${encodeURIComponent(this.userId)}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
    );
  }

  async updateSession(
    sessionId: string,
    input: UpdateTutorSessionInput,
  ): Promise<TutorSession> {
    const id = encodeURIComponent(nonEmpty(sessionId, 'Økt-ID'));
    const body: Record<string, unknown> = {};
    if (input.durationMinutes !== undefined) {
      assertDuration(input.durationMinutes);
      body.duration_minutes = input.durationMinutes;
    }
    if (input.status !== undefined) body.status = input.status;
    if (input.currentPhase !== undefined)
      body.current_phase = nonEmpty(input.currentPhase, 'Fase');
    if (input.plannedAt !== undefined) body.planned_at = input.plannedAt;
    if (input.startedAt !== undefined) body.started_at = input.startedAt;
    if (input.endedAt !== undefined) body.ended_at = input.endedAt;
    if (input.summaryNb !== undefined) body.summary_nb = input.summaryNb;
    if (input.nextTopicNb !== undefined) body.next_topic_nb = input.nextTopicNb;
    if (input.planSnapshot !== undefined)
      body.plan_snapshot = input.planSnapshot;
    body.updated_at = new Date().toISOString();

    const payload = await this.request(
      `/rest/v1/sessions?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${SESSION_SELECT}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body),
      },
    );
    const session = rows<TutorSession>(payload)[0];
    if (!session)
      throw new TutorDataError('Økten finnes ikke.', 404, 'not_found');
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const id = encodeURIComponent(nonEmpty(sessionId, 'Økt-ID'));
    await this.request(
      `/rest/v1/sessions?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
    );
  }

  async getProfile(): Promise<StudentProfile | null> {
    const payload = await this.request(
      `/rest/v1/learner_profiles?id=eq.${encodeURIComponent(this.learnerId)}&parent_user_id=eq.${encodeURIComponent(this.userId)}&select=${PROFILE_SELECT}&limit=1`,
    );
    return rows<StudentProfile>(payload)[0] ?? null;
  }

  async updateLearnerProfile(
    input: UpdateLearnerProfileInput,
  ): Promise<StudentProfile> {
    const body: Record<string, unknown> = {};
    if (input.intakeData !== undefined) body.intake_data = input.intakeData;
    if (input.intakeStep !== undefined) body.intake_step = input.intakeStep;
    if (input.status !== undefined) body.learner_profile_status = input.status;
    if (input.preferredSessionMinutes !== undefined) {
      if (
        !Number.isInteger(input.preferredSessionMinutes) ||
        input.preferredSessionMinutes < 10 ||
        input.preferredSessionMinutes > 180
      ) {
        throw new TutorDataError(
          'Ønsket øktlengde er ugyldig.',
          400,
          'invalid_input',
        );
      }
      body.preferred_session_minutes = input.preferredSessionMinutes;
    }
    if (input.preferredWeeklySessions !== undefined) {
      if (
        !Number.isInteger(input.preferredWeeklySessions) ||
        input.preferredWeeklySessions < 1 ||
        input.preferredWeeklySessions > 7
      ) {
        throw new TutorDataError(
          'Ønsket øktfrekvens er ugyldig.',
          400,
          'invalid_input',
        );
      }
      body.preferred_weekly_sessions = input.preferredWeeklySessions;
    }
    if (input.learningStyle !== undefined)
      body.learning_style = input.learningStyle;
    if (input.strengthConceptKeys !== undefined) {
      if (input.strengthConceptKeys.length > 8) {
        throw new TutorDataError(
          'For mange trygghetstemaer.',
          400,
          'invalid_input',
        );
      }
      body.strength_concept_keys = Array.from(
        new Set(input.strengthConceptKeys),
      ).slice(0, 8);
    }
    if (input.focusConceptKeys !== undefined) {
      if (input.focusConceptKeys.length > 8) {
        throw new TutorDataError(
          'For mange fokusområder.',
          400,
          'invalid_input',
        );
      }
      body.focus_concept_keys = Array.from(
        new Set(input.focusConceptKeys),
      ).slice(0, 8);
    }
    if (!Object.keys(body).length) {
      const profile = await this.getProfile();
      if (!profile)
        throw new TutorDataError('Profilen finnes ikke.', 404, 'not_found');
      return profile;
    }
    body.updated_at = new Date().toISOString();
    const payload = await this.request(
      `/rest/v1/learner_profiles?id=eq.${encodeURIComponent(this.learnerId)}&parent_user_id=eq.${encodeURIComponent(this.userId)}&select=${PROFILE_SELECT}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body),
      },
    );
    const profile = rows<StudentProfile>(payload)[0];
    if (!profile)
      throw new TutorDataError('Profilen finnes ikke.', 404, 'not_found');
    return profile;
  }

  async listMastery(limit = 100): Promise<StudentMastery[]> {
    const safeLimit = boundedLimit(limit);
    const payload = await this.request(
      `/rest/v1/mastery?user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${MASTERY_SELECT}&order=estimate.asc,confidence.desc&limit=${safeLimit}`,
    );
    return rows<StudentMastery>(payload);
  }

  async listCurriculumConcepts(
    limit = 100,
  ): Promise<StudentCurriculumConcept[]> {
    const safeLimit = boundedLimit(limit);
    const payload = await this.request(
      `/rest/v1/curriculum_concepts?select=${CURRICULUM_CONCEPT_SELECT}&order=grade_min.asc.nullslast,concept_key.asc&limit=${safeLimit}`,
    );
    return rows<StudentCurriculumConcept>(payload);
  }

  async listTasks(sessionId: string, limit = 100): Promise<TutorTask[]> {
    const safeLimit = boundedLimit(limit);
    const session = encodeURIComponent(validUuid(sessionId, 'Økt-ID'));
    const payload = await this.request(
      `/rest/v1/tasks?session_id=eq.${session}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${TASK_SELECT}&order=sequence_no.asc,id.asc&limit=${safeLimit}`,
    );
    return rows<TutorTask>(payload);
  }

  async getTask(taskId: string): Promise<TutorTask | null> {
    const id = encodeURIComponent(validUuid(taskId, 'Oppgave-ID'));
    const payload = await this.request(
      `/rest/v1/tasks?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${TASK_SELECT}&limit=1`,
    );
    return rows<TutorTask>(payload)[0] ?? null;
  }

  async createTasks(
    sessionId: string,
    inputs: CreateTutorTaskInput[],
  ): Promise<TutorTask[]> {
    const session = validUuid(sessionId, 'Økt-ID');
    if (inputs.length === 0 || inputs.length > 60) {
      throw new TutorDataError(
        'En økt kan legge til mellom 1 og 60 oppgaver om gangen.',
        400,
      );
    }
    const existing = await this.listTasks(session, 100);
    if (inputs.every((input) => input.id)) {
      const recovered = inputs.map((input) =>
        existing.find((task) => task.id === input.id),
      );
      if (recovered.every((task): task is TutorTask => Boolean(task)))
        return recovered;
    }
    let sequenceNo = existing.reduce(
      (maximum, task) => Math.max(maximum, task.sequence_no),
      0,
    );
    const body = inputs.map((input) => {
      const sourceText = nonEmpty(input.sourceText, 'Oppgavetekst');
      const estimatedMinutes = input.estimatedMinutes ?? 6;
      assertEstimatedMinutes(estimatedMinutes);
      sequenceNo += 1;
      return {
        user_id: this.userId,
        learner_id: this.learnerId,
        session_id: session,
        upload_id: input.uploadId ?? null,
        sequence_no: sequenceNo,
        ...(input.id ? { id: validUuid(input.id, 'Oppgave-ID') } : {}),
        source_label: input.sourceLabel ?? null,
        source_text: sourceText,
        normalized_text: input.normalizedText?.trim() || sourceText,
        task_type: input.taskType?.trim() || 'open_response',
        concept_keys: input.conceptKeys ?? [],
        figure_spec: input.figureSpec ?? null,
        parse_confidence: input.parseConfidence ?? 1,
        status: input.status ?? 'detected',
        phase: input.phase ?? 'homework',
        origin: input.origin ?? 'manual',
        estimated_minutes: estimatedMinutes,
      };
    });
    const payload = await this.request('/rest/v1/tasks', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    const created = rows<TutorTask>(payload);
    if (created.length !== inputs.length) {
      throw new TutorDataError(
        'Alle oppgavene ble ikke lagret.',
        502,
        'partial_insert',
      );
    }
    return created.sort((a, b) => a.sequence_no - b.sequence_no);
  }

  async updateTask(
    taskId: string,
    input: UpdateTutorTaskInput,
  ): Promise<TutorTask> {
    const id = encodeURIComponent(validUuid(taskId, 'Oppgave-ID'));
    const body: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.sourceText !== undefined)
      body.source_text = nonEmpty(input.sourceText, 'Oppgavetekst');
    if (input.normalizedText !== undefined)
      body.normalized_text = nonEmpty(
        input.normalizedText,
        'Normalisert oppgavetekst',
      );
    if (input.sourceLabel !== undefined) body.source_label = input.sourceLabel;
    if (input.taskType !== undefined)
      body.task_type = nonEmpty(input.taskType, 'Oppgavetype');
    if (input.conceptKeys !== undefined) body.concept_keys = input.conceptKeys;
    if (input.figureSpec !== undefined) body.figure_spec = input.figureSpec;
    if (input.parseConfidence !== undefined) {
      assertScore(input.parseConfidence, 'Tolkningssikkerhet');
      body.parse_confidence = input.parseConfidence;
    }
    if (input.phase !== undefined) body.phase = input.phase;
    if (input.origin !== undefined) body.origin = input.origin;
    if (input.estimatedMinutes !== undefined) {
      assertEstimatedMinutes(input.estimatedMinutes);
      body.estimated_minutes = input.estimatedMinutes;
    }
    if (input.status !== undefined) body.status = input.status;
    if (input.completedAt !== undefined) body.completed_at = input.completedAt;
    const payload = await this.request(
      `/rest/v1/tasks?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${TASK_SELECT}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body),
      },
    );
    const task = rows<TutorTask>(payload)[0];
    if (!task)
      throw new TutorDataError('Oppgaven finnes ikke.', 404, 'not_found');
    return task;
  }

  async deleteTask(taskId: string): Promise<void> {
    const id = encodeURIComponent(validUuid(taskId, 'Oppgave-ID'));
    await this.request(
      `/rest/v1/tasks?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      },
    );
  }

  async listHomeworkUploads(
    sessionId: string,
    limit = 10,
  ): Promise<HomeworkUpload[]> {
    const safeLimit = boundedLimit(limit);
    const session = encodeURIComponent(validUuid(sessionId, 'Økt-ID'));
    const payload = await this.request(
      `/rest/v1/homework_uploads?session_id=eq.${session}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${UPLOAD_SELECT}&order=page_number.asc,created_at.asc&limit=${safeLimit}`,
    );
    return rows<HomeworkUpload>(payload);
  }

  async getHomeworkUpload(uploadId: string): Promise<HomeworkUpload | null> {
    const id = encodeURIComponent(validUuid(uploadId, 'Bilde-ID'));
    const payload = await this.request(
      `/rest/v1/homework_uploads?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${UPLOAD_SELECT}&limit=1`,
    );
    return rows<HomeworkUpload>(payload)[0] ?? null;
  }

  async prepareHomeworkUpload(
    sessionId: string,
    input: { mimeType: string; byteSize: number; pageNumber: number },
  ): Promise<{ upload: HomeworkUpload; signedUrl: string }> {
    const session = validUuid(sessionId, 'Økt-ID');
    const extension = homeworkExtension(input.mimeType);
    if (
      !Number.isInteger(input.byteSize) ||
      input.byteSize < 1 ||
      input.byteSize > 6_291_456
    ) {
      throw new TutorDataError(
        'Bildet må være mindre enn 6 MB.',
        400,
        'invalid_input',
      );
    }
    if (
      !Number.isInteger(input.pageNumber) ||
      input.pageNumber < 1 ||
      input.pageNumber > 10
    ) {
      throw new TutorDataError(
        'Sidenummeret er ugyldig.',
        400,
        'invalid_input',
      );
    }
    const uploadId = crypto.randomUUID();
    const storagePath = `${this.userId}/${this.learnerId}/${session}/${uploadId}.${extension}`;
    const insertedPayload = await this.request('/rest/v1/homework_uploads', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id: uploadId,
        user_id: this.userId,
        learner_id: this.learnerId,
        session_id: session,
        storage_path: storagePath,
        mime_type: input.mimeType,
        byte_size: input.byteSize,
        page_number: input.pageNumber,
        status: 'prepared',
      }),
    });
    const upload = rows<HomeworkUpload>(insertedPayload)[0];
    if (!upload)
      throw new TutorDataError(
        'Bildeplassen ble ikke opprettet.',
        502,
        'empty_insert',
      );

    try {
      const signedPayload = (await this.request(
        `/storage/v1/object/upload/sign/homework-private/${storagePath
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`,
        { method: 'POST', body: '{}' },
      )) as { url?: unknown } | undefined;
      if (typeof signedPayload?.url !== 'string') {
        throw new TutorDataError(
          'Opplastingslenken mangler.',
          502,
          'invalid_storage_response',
        );
      }
      const { url } = getConfig();
      const signedUrl = signedPayload.url.startsWith('http')
        ? signedPayload.url
        : `${url}/storage/v1${signedPayload.url.startsWith('/') ? '' : '/'}${signedPayload.url}`;
      return { upload, signedUrl };
    } catch (error) {
      await this.updateHomeworkUpload(uploadId, { status: 'failed' }).catch(
        () => undefined,
      );
      throw error;
    }
  }

  async updateHomeworkUpload(
    uploadId: string,
    input: { status?: string; sha256?: string | null },
  ): Promise<HomeworkUpload> {
    const id = encodeURIComponent(validUuid(uploadId, 'Bilde-ID'));
    const body: Record<string, unknown> = {};
    if (input.status !== undefined)
      body.status = nonEmpty(input.status, 'Bildestatus');
    if (input.sha256 !== undefined) body.sha256 = input.sha256;
    const payload = await this.request(
      `/rest/v1/homework_uploads?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${UPLOAD_SELECT}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body),
      },
    );
    const upload = rows<HomeworkUpload>(payload)[0];
    if (!upload)
      throw new TutorDataError('Bildet finnes ikke.', 404, 'not_found');
    return upload;
  }

  async downloadHomeworkObject(storagePath: string): Promise<Uint8Array> {
    const { url, publishableKey } = getConfig();
    const path = storagePath
      .split('/')
      .map((part) => encodeURIComponent(nonEmpty(part, 'Bildesti')))
      .join('/');
    const response = await this.fetcher(
      `${url}/storage/v1/object/authenticated/homework-private/${path}`,
      {
        cache: 'no-store',
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${this.accessToken}`,
        },
      },
    );
    if (!response.ok) {
      const payload = await readPayload(response);
      throw new TutorDataError(
        errorMessage(payload),
        response.status,
        errorCode(payload),
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async listMessages(sessionId: string, limit = 100): Promise<TutorMessage[]> {
    const safeLimit = boundedLimit(limit);
    const session = encodeURIComponent(nonEmpty(sessionId, 'Økt-ID'));
    const payload = await this.request(
      `/rest/v1/messages?session_id=eq.${session}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${MESSAGE_SELECT}&order=created_at.desc,id.desc&limit=${safeLimit}`,
    );
    return rows<TutorMessage>(payload).reverse();
  }

  async appendMessage(
    sessionId: string,
    input: AppendTutorMessageInput,
  ): Promise<TutorMessage> {
    const session = nonEmpty(sessionId, 'Økt-ID');
    const contentNb = nonEmpty(input.contentNb, 'Meldingen');
    if (contentNb.length > 8000) {
      throw new TutorDataError('Meldingen er for lang.', 400, 'invalid_input');
    }
    const clientMessageId = validUuid(
      input.clientMessageId,
      'Klientmelding-ID',
    );
    const payload = await this.request('/rest/v1/messages', {
      method: 'POST',
      headers: {
        // The unique (user_id, client_message_id) key makes retries safe.
        Prefer: 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify({
        user_id: this.userId,
        learner_id: this.learnerId,
        session_id: session,
        task_id: input.taskId ?? null,
        role: input.role,
        content_nb: contentNb,
        intent: input.intent ?? null,
        client_message_id: clientMessageId,
        metadata: input.metadata ?? {},
      }),
    });
    const inserted = rows<TutorMessage>(payload)[0];
    if (inserted) return inserted;

    const existing = await this.request(
      `/rest/v1/messages?user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&client_message_id=eq.${encodeURIComponent(clientMessageId)}&select=${MESSAGE_SELECT}&limit=1`,
    );
    const message = rows<TutorMessage>(existing)[0];
    if (!message)
      throw new TutorDataError(
        'Meldingen ble ikke lagret.',
        502,
        'empty_insert',
      );
    return message;
  }

  async findMessageByClientMessageId(
    clientMessageId: string,
  ): Promise<TutorMessage | null> {
    const id = encodeURIComponent(
      validUuid(clientMessageId, 'Klientmelding-ID'),
    );
    const payload = await this.request(
      `/rest/v1/messages?user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&client_message_id=eq.${id}&select=${MESSAGE_SELECT}&limit=1`,
    );
    return rows<TutorMessage>(payload)[0] ?? null;
  }

  async listLearningSignals(
    sessionId: string,
    limit = 100,
  ): Promise<LearningSignal[]> {
    const safeLimit = boundedLimit(limit);
    const session = encodeURIComponent(nonEmpty(sessionId, 'Økt-ID'));
    const payload = await this.request(
      `/rest/v1/learning_evidence?session_id=eq.${session}&user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&select=${SIGNAL_SELECT}&order=created_at.desc,id.desc&limit=${safeLimit}`,
    );
    return rows<LearningSignal>(payload);
  }

  async recordLearningSignal(
    sessionId: string,
    input: RecordLearningSignalInput,
  ): Promise<LearningSignal> {
    const session = nonEmpty(sessionId, 'Økt-ID');
    const conceptKey = nonEmpty(input.conceptKey, 'Konsept-ID');
    assertScore(input.score, 'Score');
    assertScore(input.confidence, 'Sikkerhet');
    if (input.noteNb && input.noteNb.length > 500) {
      throw new TutorDataError(
        'Læringsnotatet er for langt.',
        400,
        'invalid_input',
      );
    }
    const sourceMessageId = input.sourceMessageId
      ? validUuid(input.sourceMessageId, 'Kildemelding-ID')
      : null;
    const path = sourceMessageId
      ? '/rest/v1/learning_evidence?on_conflict=source_message_id,concept_key'
      : '/rest/v1/learning_evidence';
    const payload = await this.request(path, {
      method: 'POST',
      headers: {
        Prefer: sourceMessageId
          ? 'resolution=ignore-duplicates,return=representation'
          : 'return=representation',
      },
      body: JSON.stringify({
        user_id: this.userId,
        learner_id: this.learnerId,
        session_id: session,
        task_id: input.taskId ?? null,
        concept_key: conceptKey,
        evidence_type: input.evidenceType,
        score: input.score,
        confidence: input.confidence,
        misconception_code: input.misconceptionCode ?? null,
        note_nb: input.noteNb ?? null,
        source_message_id: sourceMessageId,
      }),
    });
    const signal = rows<LearningSignal>(payload)[0];
    if (signal) return signal;
    if (sourceMessageId) {
      const existing = await this.request(
        `/rest/v1/learning_evidence?user_id=eq.${encodeURIComponent(this.userId)}&learner_id=eq.${encodeURIComponent(this.learnerId)}&source_message_id=eq.${encodeURIComponent(sourceMessageId)}&concept_key=eq.${encodeURIComponent(conceptKey)}&select=${SIGNAL_SELECT}&limit=1`,
      );
      const stored = rows<LearningSignal>(existing)[0];
      if (stored) return stored;
    }
    throw new TutorDataError(
      'Læringssignalet ble ikke lagret.',
      502,
      'empty_insert',
    );
  }

  /**
   * Store provider metadata only. Prompt and response content deliberately do
   * not belong in ai_generations; tutor text lives in messages with the
   * message retention policy instead.
   */
  async recordAiGeneration(
    input: RecordAiGenerationInput,
  ): Promise<AiGeneration> {
    const capability = input.capability;
    const provider = nonEmpty(input.provider, 'Provider');
    const model = nonEmpty(input.model, 'Modell');
    const requestSchemaVersion = nonEmpty(
      input.requestSchemaVersion,
      'Request-schema',
    );
    const responseSchemaVersion = nonEmpty(
      input.responseSchemaVersion,
      'Response-schema',
    );
    const numericFields: Array<[string, number | null | undefined]> = [
      ['Latency', input.latencyMs],
      ['Input units', input.inputUnits],
      ['Output units', input.outputUnits],
      ['Estimert kostnad', input.estimatedCostUsd],
    ];
    for (const [field, value] of numericFields) {
      if (
        value !== null &&
        value !== undefined &&
        (!Number.isFinite(value) || value < 0)
      ) {
        throw new TutorDataError(
          `${field} må være et positivt tall.`,
          400,
          'invalid_input',
        );
      }
    }

    const payload = await this.request('/rest/v1/ai_generations', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: this.userId,
        learner_id: this.learnerId,
        session_id: input.sessionId ?? null,
        task_id: input.taskId ?? null,
        capability,
        provider,
        model,
        request_schema_version: requestSchemaVersion,
        response_schema_version: responseSchemaVersion,
        prompt_hash: input.promptHash ?? null,
        latency_ms: input.latencyMs ?? null,
        input_units: input.inputUnits ?? null,
        output_units: input.outputUnits ?? null,
        estimated_cost_usd: input.estimatedCostUsd ?? null,
        status: input.status,
        safety_flags: input.safetyFlags ?? [],
      }),
    });
    const generation = rows<AiGeneration>(payload)[0];
    if (!generation)
      throw new TutorDataError(
        'AI-metadata ble ikke lagret.',
        502,
        'empty_insert',
      );
    return generation;
  }
}

export function createTutorDataClient(options: TutorDataClientOptions) {
  return new TutorDataClient(options);
}

// Keep the import useful as a compile-time guard if the generated schema adds
// JSON fields in future without permitting arbitrary service-side payloads.
export type TutorJson = Json;
