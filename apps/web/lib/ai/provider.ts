import {
  parseTutorTurnResponse,
  TUTOR_RESPONSE_SCHEMA_VERSION,
  type TutorRequest,
  type TutorTurnResponse,
} from './contracts';
import { gatewayProviderOptions } from './privacy';
import { buildTutorPrompt, TUTOR_SYSTEM_PROMPT } from './prompts';

export type TutorProviderConfig = {
  model: string;
  fallbackModel?: string;
  endpoint: string;
  apiKey?: string;
  timeoutMs: number;
};

export type TutorGeneration = {
  response: TutorTurnResponse;
  provider: 'local' | 'gateway';
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

export type TutorImageInput = {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
};

export class TutorProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'unavailable' | 'invalid_output' | 'timeout' | 'bad_response',
    readonly details?: { statusCode?: number; providerCode?: string; parseError?: string },
  ) {
    super(message);
    this.name = 'TutorProviderError';
  }
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
// GPT-5.4 Nano is multimodal and optimized for fast, low-cost extraction.\n// Keep the text tutor on gpt-4o-mini; this default is only for image turns.\nconst DEFAULT_IMAGE_MODEL = 'openai/gpt-5.4-nano';
const DEFAULT_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 15_000;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 60_000 ? parsed : fallback;
}

export function getTutorProviderConfig(
  env: Record<string, string | undefined> = process.env,
): TutorProviderConfig {
  return {
    model: env.MATTIS_TUTOR_MODEL?.trim() || DEFAULT_MODEL,
    fallbackModel: env.MATTIS_TUTOR_FALLBACK_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
    endpoint:
      env.MATTIS_TUTOR_ENDPOINT?.trim() || env.MATTIS_TUTOR_BASE_URL?.trim() || DEFAULT_ENDPOINT,
    apiKey:
      env.MATTIS_TUTOR_API_KEY?.trim() ||
      env.AI_GATEWAY_API_KEY?.trim() ||
      env.VERCEL_OIDC_TOKEN?.trim(),
    timeoutMs: positiveInteger(env.MATTIS_TUTOR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

export function getTutorImageProviderConfig(
  env: Record<string, string | undefined> = process.env,
): TutorProviderConfig {
  return {
    ...getTutorProviderConfig(env),
    model: env.MATTIS_TUTOR_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
  };
}

function hasPersonalData(text: string) {
  return /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(text) || /(?:\+?\d[\d\s().-]{7,}\d)/.test(text);
}

export function localTutorResponse(request: TutorRequest): TutorTurnResponse {
  const personalData = hasPersonalData(`${request.message} ${request.taskText ?? ''}`);
  if (personalData) {
    return {
      schemaVersion: TUTOR_RESPONSE_SCHEMA_VERSION,
      assistantMessageNb:
        'Det ser ut som meldingen inneholder personopplysninger. Fjern navn, telefon eller e-post, så kan vi fortsette med selve matteoppgaven.',
      intent: 'safety',
      taskState: 'in_progress',
      expectedStudentAction: 'answer',
      hintLevel: 0,
      confidence: 0.98,
      learningEvidence: [],
      safetyFlags: ['personal_data'],
    };
  }

  const asksForAnswer = /\b(fasit|svaret|bare svaret|løs den|regn ut)\b/i.test(request.message);
  const hasTask = Boolean(request.taskText);
  const assistantMessageNb = asksForAnswer
    ? 'Jeg kan hjelpe deg fram til svaret, men du skal få gjøre det viktige steget selv. Hva kan du forenkle eller flytte først?'
    : hasTask
      ? 'La oss ta ett lite steg: Hva vet du allerede, og hvilken del av oppgaven vil du begynne med?'
      : 'Hva handler oppgaven om, og hva har du prøvd så langt? Skriv gjerne bare det første steget.';

  return {
    schemaVersion: TUTOR_RESPONSE_SCHEMA_VERSION,
    assistantMessageNb,
    intent: asksForAnswer ? 'hint' : 'ask',
    taskState: 'awaiting_answer',
    expectedStudentAction: 'explain',
    hintLevel: asksForAnswer ? 1 : 0,
    confidence: 0.72,
    learningEvidence: [],
    safetyFlags: ['none'],
    suggestedActions: ['show_hint'],
  };
}

function contentToText(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  const parts = content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const value = part as Record<string, unknown>;
      return typeof value.text === 'string' ? value.text : '';
    })
    .filter(Boolean);
  return parts.length ? parts.join('') : undefined;
}

function repairJsonEscapes(value: string) {
  // LaTeX delimiters such as \( and commands such as \frac are valid in the
  // model's text, but must be escaped once more when they appear inside JSON.
  return value.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
}

function extractJson(content: unknown): unknown {
  const textContent = contentToText(content);
  if (typeof textContent !== 'string') return textContent;
  const trimmed = textContent
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^\uFEFF/, '');
  const candidates = [trimmed, repairJsonEscapes(trimmed)];
  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    const object = trimmed.slice(objectStart, objectEnd + 1);
    candidates.push(object, repairJsonEscapes(object));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Some providers add a short sentence before or after an otherwise valid object.
    }
  }
  return undefined;
}

function normalizeTutorPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  const normalizedString = (candidate: unknown) =>
    typeof candidate === 'string' ? candidate.trim().toLowerCase() : candidate;
  const normalizeIntent = (intent: unknown) => {
    const value = normalizedString(intent);
    if (
      value === 'correct' ||
      value === 'correct_answer' ||
      value === 'completion' ||
      value === 'complete' ||
      value === 'praise' ||
      value === 'success'
    )
      return 'feedback';
    if (value === 'evaluate' || value === 'evaluation' || value === 'grade') return 'check';
    if (value === 'next_task' || value === 'next') return 'summarize';
    return value ?? 'ask';
  };
  const normalizeTaskState = (state: unknown) => {
    const value = normalizedString(state);
    if (
      value === 'done' ||
      value === 'complete' ||
      value === 'finished' ||
      value === 'completed_task' ||
      value === 'complete_task' ||
      value === 'success'
    )
      return 'completed';
    if (value === 'ready' || value === 'ready_to_finish') return 'ready_to_complete';
    if (value === 'checking_answer' || value === 'evaluating' || value === 'check') return 'checking';
    if (value === 'awaiting' || value === 'waiting' || value === 'waiting_for_answer' || value === 'needs_answer')
      return 'awaiting_answer';
    if (value === 'in-progress') return 'in_progress';
    if (value === 'needs_review' || value === 'review') return 'needs_human_review';
    return value ?? 'awaiting_answer';
  };
  const normalizeExpectedAction = (action: unknown) => {
    const value = normalizedString(action);
    if (
      value === 'next' ||
      value === 'next_task' ||
      value === 'confirm' ||
      value === 'continue' ||
      value === 'continue_to_next'
    )
      return 'confirm_next';
    if (value === 'solve' || value === 'compute') return 'calculate';
    if (value === 'show_work' || value === 'show_steps') return 'explain';
    if (value === 'upload_photo' || value === 'take_photo' || value === 'photo') return 'upload';
    if (value === 'respond' || value === 'answer_question') return 'answer';
    if (value === 'no_action') return 'none';
    return value ?? 'none';
  };
  const normalizeEvidence = (candidate: unknown) => {
    if (!Array.isArray(candidate)) return [];
    return candidate.slice(0, 5).flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const evidence = item as Record<string, unknown>;
      const evidenceType = normalizedString(evidence.evidenceType ?? evidence.evidence_type);
      const typeAliases: Record<string, string> = {
        correct_answer: 'correct',
        self_correction: 'self_corrected',
        self_corrected_answer: 'self_corrected',
        used_hint: 'hinted',
        explained_concept: 'explained',
        skipped_task: 'skipped',
      };
      const normalizedType =
        typeof evidenceType === 'string' ? typeAliases[evidenceType] ?? evidenceType : evidenceType;
      const conceptKey = evidence.conceptKey ?? evidence.concept_key;
      const score = Number(evidence.score);
      const confidence = Number(evidence.confidence);
      if (
        typeof conceptKey !== 'string' || !conceptKey.trim() ||
        typeof normalizedType !== 'string' ||
        !['correct', 'self_corrected', 'hinted', 'misconception', 'explained', 'skipped'].includes(normalizedType) ||
        !Number.isFinite(score) || score < 0 || score > 1 ||
        !Number.isFinite(confidence) || confidence < 0 || confidence > 1
      )
        return [];
      return [{
        conceptKey: conceptKey.trim(),
        evidenceType: normalizedType,
        score,
        confidence,
        ...(typeof (evidence.misconceptionCode ?? evidence.misconception_code) === 'string'
          ? { misconceptionCode: String(evidence.misconceptionCode ?? evidence.misconception_code).trim() }
          : {}),
        ...(typeof (evidence.noteNb ?? evidence.note_nb) === 'string'
          ? { noteNb: String(evidence.noteNb ?? evidence.note_nb).trim() }
          : {}),
      }];
    });
  };
  const normalizeSafetyFlags = (candidate: unknown) => {
    if (!Array.isArray(candidate)) return ['none'];
    const aliases: Record<string, string> = {
      no_concerns: 'none',
      no_flags: 'none',
      uncertain: 'model_uncertainty',
    };
    const allowed = new Set([
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
    const flags = candidate
      .map((flag) => normalizedString(flag))
      .filter((flag): flag is string => typeof flag === 'string')
      .map((flag) => aliases[flag] ?? flag)
      .map((flag) => (allowed.has(flag) ? flag : 'other'));
    return flags.length ? Array.from(new Set(flags)).slice(0, 10) : ['none'];
  };
  const normalizeSuggestedActions = (candidate: unknown) => {
    if (!Array.isArray(candidate)) return undefined;
    const aliases: Record<string, string> = {
      hint: 'show_hint',
      next: 'next_task',
      continue: 'next_task',
      photo: 'ask_for_photo',
      end: 'end_session',
    };
    const allowed = new Set([
      'show_hint',
      'show_keyboard',
      'show_figure',
      'ask_for_photo',
      'next_task',
      'end_session',
      'contact_adult',
    ]);
    const actions = candidate
      .map((action) => normalizedString(action))
      .filter((action): action is string => typeof action === 'string')
      .map((action) => aliases[action] ?? action)
      .filter((action) => allowed.has(action));
    return Array.from(new Set(actions)).slice(0, 4);
  };
  const rawHintLevel = Number(source.hintLevel ?? source.hint_level ?? 0);
  const rawConfidence = Number(source.confidence ?? 0.7);
  const suggestedActions = normalizeSuggestedActions(
    Array.isArray(source.suggestedActions) ? source.suggestedActions : source.suggested_actions,
  );
  return {
    schemaVersion:
      source.schemaVersion === 'tutor-turn.v1' || source.schema_version === 'tutor-turn.v1'
        ? TUTOR_RESPONSE_SCHEMA_VERSION
        : source.schemaVersion ?? source.schema_version ?? TUTOR_RESPONSE_SCHEMA_VERSION,
    assistantMessageNb:
      source.assistantMessageNb ??
      source.assistant_message_nb ??
      source.assistantMessage ??
      source.assistant_message ??
      source.message,
    intent: normalizeIntent(source.intent),
    taskState: normalizeTaskState(source.taskState ?? source.task_state),
    expectedStudentAction: normalizeExpectedAction(
      source.expectedStudentAction ?? source.expected_student_action,
    ),
    hintLevel: Number.isFinite(rawHintLevel) ? Math.max(0, Math.min(4, Math.round(rawHintLevel))) : 0,
    confidence: Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0.7,
    learningEvidence: normalizeEvidence(
      Array.isArray(source.learningEvidence) ? source.learningEvidence : source.learning_evidence,
    ),
    safetyFlags: normalizeSafetyFlags(
      Array.isArray(source.safetyFlags) ? source.safetyFlags : source.safety_flags,
    ),
    ...(suggestedActions !== undefined ? { suggestedActions } : {}),
  };
}

type GatewayCallResult = {
  response: TutorTurnResponse;
  usage?: TutorGeneration['usage'];
};

function usageInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

async function callGateway(
  request: TutorRequest,
  config: TutorProviderConfig,
): Promise<GatewayCallResult> {
  if (!config.apiKey)
    throw new TutorProviderError('Ingen AI-leverandør er konfigurert.', 'unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const providerOptions = gatewayProviderOptions();
    const response = await fetch(config.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 500,
        messages: [
          { role: 'system', content: TUTOR_SYSTEM_PROMPT },
          { role: 'user', content: buildTutorPrompt(request) },
        ],
        ...(providerOptions ? { providerOptions } : {}),
      }),
    });
    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => undefined)) as
        { type?: unknown; code?: unknown } | undefined;
      throw new TutorProviderError('AI-leverandøren svarte med en feil.', 'bad_response', {
        statusCode: response.status,
        providerCode:
          typeof errorPayload?.type === 'string'
            ? errorPayload.type.slice(0, 80)
            : typeof errorPayload?.code === 'string'
              ? errorPayload.code.slice(0, 80)
              : undefined,
      });
    }
    const payload = (await response.json().catch(() => undefined)) as
      | {
          choices?: Array<{ message?: { content?: unknown } }>;
          usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
        }
      | undefined;
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = parseTutorTurnResponse(normalizeTutorPayload(extractJson(content)));
    if (!parsed.ok)
      throw new TutorProviderError(
        'AI-leverandøren returnerte ugyldig tutor-data.',
        'invalid_output',
        { parseError: parsed.error },
      );
    const inputTokens = usageInteger(payload?.usage?.prompt_tokens);
    const outputTokens = usageInteger(payload?.usage?.completion_tokens);
    return {
      response: parsed.value,
      ...(inputTokens !== undefined || outputTokens !== undefined
        ? {
            usage: {
              ...(inputTokens !== undefined ? { inputTokens } : {}),
              ...(outputTokens !== undefined ? { outputTokens } : {}),
            },
          }
        : {}),
    };
  } catch (error) {
    if (error instanceof TutorProviderError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TutorProviderError('AI-leverandøren brukte for lang tid.', 'timeout');
    }
    throw new TutorProviderError('AI-leverandøren er ikke tilgjengelig.', 'unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

async function callGatewayWithImage(
  request: TutorRequest,
  image: TutorImageInput,
  config: TutorProviderConfig,
): Promise<GatewayCallResult> {
  if (!config.apiKey)
    throw new TutorProviderError('Ingen AI-leverandør er konfigurert.', 'unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const providerOptions = gatewayProviderOptions();
    const base64 = Buffer.from(image.bytes).toString('base64');
    const response = await fetch(config.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 400,
        messages: [
          { role: 'system', content: TUTOR_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${buildTutorPrompt(request)}\n\nEleven viser nå bilde av egen utregning. Les bare matematikken, og hjelp eleven med ett konkret neste steg. Ikke gjett dersom bildet er uklart.`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${image.mimeType};base64,${base64}`,
                  detail: 'low',
                },
              },
            ],
          },
        ],
        ...(providerOptions ? { providerOptions } : {}),
      }),
    });
    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => undefined)) as
        { type?: unknown; code?: unknown } | undefined;
      throw new TutorProviderError('AI-leverandøren svarte med en feil.', 'bad_response', {
        statusCode: response.status,
        providerCode:
          typeof errorPayload?.type === 'string'
            ? errorPayload.type.slice(0, 80)
            : typeof errorPayload?.code === 'string'
              ? errorPayload.code.slice(0, 80)
              : undefined,
      });
    }
    const payload = (await response.json().catch(() => undefined)) as
      | {
          choices?: Array<{ message?: { content?: unknown } }>;
          usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
        }
      | undefined;
    const parsed = parseTutorTurnResponse(
      normalizeTutorPayload(extractJson(payload?.choices?.[0]?.message?.content)),
    );
    if (!parsed.ok)
      throw new TutorProviderError(
        'AI-leverandøren returnerte ugyldig tutor-data.',
        'invalid_output',
        { parseError: parsed.error },
      );
    const inputTokens = usageInteger(payload?.usage?.prompt_tokens);
    const outputTokens = usageInteger(payload?.usage?.completion_tokens);
    return {
      response: parsed.value,
      ...(inputTokens !== undefined || outputTokens !== undefined
        ? {
            usage: {
              ...(inputTokens !== undefined ? { inputTokens } : {}),
              ...(outputTokens !== undefined ? { outputTokens } : {}),
            },
          }
        : {}),
    };
  } catch (error) {
    if (error instanceof TutorProviderError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TutorProviderError('AI-leverandøren brukte for lang tid.', 'timeout');
    }
    throw new TutorProviderError('AI-leverandøren er ikke tilgjengelig.', 'unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateTutorTurn(request: TutorRequest): Promise<TutorGeneration> {
  const config = getTutorProviderConfig();
  if (!config.apiKey) throw new TutorProviderError('Ingen AI-leverandør er konfigurert.', 'unavailable');
  try {
    const result = await callGateway(request, config);
    return { ...result, provider: 'gateway', model: config.model };
  } catch (error) {
    const shouldUseFallback =
      error instanceof TutorProviderError &&
      error.code === 'bad_response' &&
      error.details?.statusCode === 429 &&
      config.fallbackModel &&
      config.fallbackModel !== config.model;
    if (shouldUseFallback) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        const result = await callGateway(request, { ...config, model: config.fallbackModel! });
        return { ...result, provider: 'gateway', model: config.fallbackModel! };
      } catch (fallbackError) {
        error = fallbackError;
      }
    }
    const lastError = error;
    if (lastError instanceof TutorProviderError) {
      console.error('Tutor provider failed', {
        code: lastError.code,
        statusCode: lastError.details?.statusCode ?? null,
        providerCode: lastError.details?.providerCode ?? null,
        ...(lastError.details?.parseError ? { parseError: lastError.details.parseError } : {}),
        model: config.model,
      });
      throw lastError;
    }
    console.error('Tutor provider failed', { code: 'unknown', model: config.model });
    throw new TutorProviderError('AI-leverandøren er ikke tilgjengelig.', 'unavailable');
  }
}

export async function generateTutorImageTurn(
  request: TutorRequest,
  image: TutorImageInput,
): Promise<TutorGeneration> {
  const config = getTutorImageProviderConfig();
  const result = await callGatewayWithImage(request, image, config);
  return { ...result, provider: 'gateway', model: config.model };
}
