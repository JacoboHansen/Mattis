import type { Database, Json } from '../database.types';
import { isUuid } from '../uuid';

type Fetcher = typeof fetch;

type SessionRow = Database['public']['Tables']['sessions']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];
type LearningSignalRow = Database['public']['Tables']['learning_evidence']['Row'];
type AiGenerationRow = Database['public']['Tables']['ai_generations']['Row'];

export type TutorSession = SessionRow;
export type TutorMessage = MessageRow;
export type LearningSignal = LearningSignalRow;
export type AiGeneration = AiGenerationRow;

export type CreateTutorSessionInput = {
  durationMinutes?: number;
  plannedAt?: string | null;
  startImmediately?: boolean;
};

export type UpdateTutorSessionInput = {
  status?: Database['public']['Enums']['session_status'];
  currentPhase?: string;
  plannedAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  summaryNb?: string | null;
  nextTopicNb?: string | null;
};

export type AppendTutorMessageInput = {
  role: Database['public']['Enums']['message_role'];
  contentNb: string;
  clientMessageId: string;
  taskId?: string | null;
  intent?: string | null;
};

export type RecordLearningSignalInput = {
  conceptKey: string;
  evidenceType: 'correct' | 'self_corrected' | 'hinted' | 'misconception' | 'explained' | 'skipped';
  score: number;
  confidence: number;
  taskId?: string | null;
  misconceptionCode?: string | null;
  noteNb?: string | null;
};

export type RecordAiGenerationInput = {
  capability: 'homework_parser' | 'tutor' | 'figure_generator';
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
  'id,user_id,status,current_phase,planned_at,duration_minutes,started_at,ended_at,summary_nb,next_topic_nb,created_at,updated_at,delete_after';
const MESSAGE_SELECT =
  'id,user_id,session_id,task_id,role,content_nb,intent,client_message_id,created_at,expires_at';
const SIGNAL_SELECT =
  'id,user_id,session_id,task_id,concept_key,evidence_type,score,confidence,misconception_code,note_nb,created_at';

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  // This client intentionally refuses to fall back to SUPABASE_SERVICE_ROLE_KEY.
  // The service role bypasses RLS and must never be used for student data access.
  if (!url || !publishableKey) {
    throw new TutorDataError('Supabase er ikke konfigurert.', 503, 'missing_config');
  }

  return { url, publishableKey };
}

function nonEmpty(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new TutorDataError(`${field} kan ikke være tom.`, 400, 'invalid_input');
  return normalized;
}

function validUuid(value: string, field: string) {
  const normalized = nonEmpty(value, field);
  if (!isUuid(normalized)) {
    throw new TutorDataError(`${field} må være en gyldig UUID.`, 400, 'invalid_input');
  }
  return normalized;
}

function boundedLimit(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TutorDataError('Grensen må være et positivt heltall.', 400, 'invalid_input');
  }
  return Math.min(value, 100);
}

function assertDuration(value: number) {
  if (!Number.isInteger(value) || value < 10 || value > 180) {
    throw new TutorDataError('Økten må vare mellom 10 og 180 minutter.', 400, 'invalid_input');
  }
}

function assertScore(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TutorDataError(`${field} må være mellom 0 og 1.`, 400, 'invalid_input');
  }
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
  const candidates = [source.message, source.msg, source.details, source.error_description];
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

  constructor(options: TutorDataClientOptions) {
    this.accessToken = nonEmpty(options.accessToken, 'Access token');
    this.userId = nonEmpty(options.userId, 'Bruker-ID');
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
      throw new TutorDataError(errorMessage(payload), response.status, errorCode(payload));
    }
    return payload;
  }

  async createSession(input: CreateTutorSessionInput = {}): Promise<TutorSession> {
    const durationMinutes = input.durationMinutes ?? 45;
    assertDuration(durationMinutes);
    const startedAt = input.startImmediately ? new Date().toISOString() : null;
    const payload = await this.request('/rest/v1/sessions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: this.userId,
        status: input.startImmediately ? 'active' : 'planned',
        current_phase: 'homework',
        duration_minutes: durationMinutes,
        planned_at: input.plannedAt ?? null,
        started_at: startedAt,
      }),
    });
    const session = rows<TutorSession>(payload)[0];
    if (!session) throw new TutorDataError('Økten ble ikke opprettet.', 502, 'empty_insert');
    return session;
  }

  async getSession(sessionId: string): Promise<TutorSession | null> {
    const id = encodeURIComponent(nonEmpty(sessionId, 'Økt-ID'));
    const payload = await this.request(
      `/rest/v1/sessions?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&select=${SESSION_SELECT}&limit=1`,
    );
    return rows<TutorSession>(payload)[0] ?? null;
  }

  async listSessions(limit = 20): Promise<TutorSession[]> {
    const safeLimit = boundedLimit(limit);
    const payload = await this.request(
      `/rest/v1/sessions?user_id=eq.${encodeURIComponent(this.userId)}&select=${SESSION_SELECT}&order=created_at.desc&limit=${safeLimit}`,
    );
    return rows<TutorSession>(payload);
  }

  async updateSession(sessionId: string, input: UpdateTutorSessionInput): Promise<TutorSession> {
    const id = encodeURIComponent(nonEmpty(sessionId, 'Økt-ID'));
    const body: Record<string, string | null> = {};
    if (input.status !== undefined) body.status = input.status;
    if (input.currentPhase !== undefined) body.current_phase = nonEmpty(input.currentPhase, 'Fase');
    if (input.plannedAt !== undefined) body.planned_at = input.plannedAt;
    if (input.startedAt !== undefined) body.started_at = input.startedAt;
    if (input.endedAt !== undefined) body.ended_at = input.endedAt;
    if (input.summaryNb !== undefined) body.summary_nb = input.summaryNb;
    if (input.nextTopicNb !== undefined) body.next_topic_nb = input.nextTopicNb;
    body.updated_at = new Date().toISOString();

    const payload = await this.request(
      `/rest/v1/sessions?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}&select=${SESSION_SELECT}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body),
      },
    );
    const session = rows<TutorSession>(payload)[0];
    if (!session) throw new TutorDataError('Økten finnes ikke.', 404, 'not_found');
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const id = encodeURIComponent(nonEmpty(sessionId, 'Økt-ID'));
    await this.request(
      `/rest/v1/sessions?id=eq.${id}&user_id=eq.${encodeURIComponent(this.userId)}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
    );
  }

  async listMessages(sessionId: string, limit = 100): Promise<TutorMessage[]> {
    const safeLimit = boundedLimit(limit);
    const session = encodeURIComponent(nonEmpty(sessionId, 'Økt-ID'));
    const payload = await this.request(
      `/rest/v1/messages?session_id=eq.${session}&user_id=eq.${encodeURIComponent(this.userId)}&select=${MESSAGE_SELECT}&order=created_at.asc,id.asc&limit=${safeLimit}`,
    );
    return rows<TutorMessage>(payload);
  }

  async appendMessage(sessionId: string, input: AppendTutorMessageInput): Promise<TutorMessage> {
    const session = nonEmpty(sessionId, 'Økt-ID');
    const contentNb = nonEmpty(input.contentNb, 'Meldingen');
    if (contentNb.length > 8000) {
      throw new TutorDataError('Meldingen er for lang.', 400, 'invalid_input');
    }
    const clientMessageId = validUuid(input.clientMessageId, 'Klientmelding-ID');
    const payload = await this.request('/rest/v1/messages', {
      method: 'POST',
      headers: {
        // The unique (user_id, client_message_id) key makes retries safe.
        Prefer: 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify({
        user_id: this.userId,
        session_id: session,
        task_id: input.taskId ?? null,
        role: input.role,
        content_nb: contentNb,
        intent: input.intent ?? null,
        client_message_id: clientMessageId,
      }),
    });
    const inserted = rows<TutorMessage>(payload)[0];
    if (inserted) return inserted;

    const existing = await this.request(
      `/rest/v1/messages?user_id=eq.${encodeURIComponent(this.userId)}&client_message_id=eq.${encodeURIComponent(clientMessageId)}&select=${MESSAGE_SELECT}&limit=1`,
    );
    const message = rows<TutorMessage>(existing)[0];
    if (!message) throw new TutorDataError('Meldingen ble ikke lagret.', 502, 'empty_insert');
    return message;
  }

  async findMessageByClientMessageId(clientMessageId: string): Promise<TutorMessage | null> {
    const id = encodeURIComponent(validUuid(clientMessageId, 'Klientmelding-ID'));
    const payload = await this.request(
      `/rest/v1/messages?user_id=eq.${encodeURIComponent(this.userId)}&client_message_id=eq.${id}&select=${MESSAGE_SELECT}&limit=1`,
    );
    return rows<TutorMessage>(payload)[0] ?? null;
  }

  async listLearningSignals(sessionId: string, limit = 100): Promise<LearningSignal[]> {
    const safeLimit = boundedLimit(limit);
    const session = encodeURIComponent(nonEmpty(sessionId, 'Økt-ID'));
    const payload = await this.request(
      `/rest/v1/learning_evidence?session_id=eq.${session}&user_id=eq.${encodeURIComponent(this.userId)}&select=${SIGNAL_SELECT}&order=created_at.asc,id.asc&limit=${safeLimit}`,
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
      throw new TutorDataError('Læringsnotatet er for langt.', 400, 'invalid_input');
    }
    const payload = await this.request('/rest/v1/learning_evidence', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: this.userId,
        session_id: session,
        task_id: input.taskId ?? null,
        concept_key: conceptKey,
        evidence_type: input.evidenceType,
        score: input.score,
        confidence: input.confidence,
        misconception_code: input.misconceptionCode ?? null,
        note_nb: input.noteNb ?? null,
      }),
    });
    const signal = rows<LearningSignal>(payload)[0];
    if (!signal) throw new TutorDataError('Læringssignalet ble ikke lagret.', 502, 'empty_insert');
    return signal;
  }

  /**
   * Store provider metadata only. Prompt and response content deliberately do
   * not belong in ai_generations; tutor text lives in messages with the
   * message retention policy instead.
   */
  async recordAiGeneration(input: RecordAiGenerationInput): Promise<AiGeneration> {
    const capability = input.capability;
    const provider = nonEmpty(input.provider, 'Provider');
    const model = nonEmpty(input.model, 'Modell');
    const requestSchemaVersion = nonEmpty(input.requestSchemaVersion, 'Request-schema');
    const responseSchemaVersion = nonEmpty(input.responseSchemaVersion, 'Response-schema');
    const numericFields: Array<[string, number | null | undefined]> = [
      ['Latency', input.latencyMs],
      ['Input units', input.inputUnits],
      ['Output units', input.outputUnits],
      ['Estimert kostnad', input.estimatedCostUsd],
    ];
    for (const [field, value] of numericFields) {
      if (value !== null && value !== undefined && (!Number.isFinite(value) || value < 0)) {
        throw new TutorDataError(`${field} må være et positivt tall.`, 400, 'invalid_input');
      }
    }

    const payload = await this.request('/rest/v1/ai_generations', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: this.userId,
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
    if (!generation) throw new TutorDataError('AI-metadata ble ikke lagret.', 502, 'empty_insert');
    return generation;
  }
}

export function createTutorDataClient(options: TutorDataClientOptions) {
  return new TutorDataClient(options);
}

// Keep the import useful as a compile-time guard if the generated schema adds
// JSON fields in future without permitting arbitrary service-side payloads.
export type TutorJson = Json;
