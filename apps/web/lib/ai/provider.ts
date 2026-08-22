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

export class TutorProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'unavailable' | 'invalid_output' | 'timeout' | 'bad_response',
    readonly details?: { statusCode?: number; providerCode?: string },
  ) {
    super(message);
    this.name = 'TutorProviderError';
  }
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
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
    endpoint:
      env.MATTIS_TUTOR_ENDPOINT?.trim() || env.MATTIS_TUTOR_BASE_URL?.trim() || DEFAULT_ENDPOINT,
    apiKey:
      env.MATTIS_TUTOR_API_KEY?.trim() ||
      env.AI_GATEWAY_API_KEY?.trim() ||
      env.VERCEL_OIDC_TOKEN?.trim(),
    timeoutMs: positiveInteger(env.MATTIS_TUTOR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
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

function extractJson(content: unknown): unknown {
  if (typeof content !== 'string') return content;
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function normalizeTutorPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  return {
    schemaVersion: source.schemaVersion ?? TUTOR_RESPONSE_SCHEMA_VERSION,
    assistantMessageNb: source.assistantMessageNb ?? source.assistantMessage ?? source.message,
    intent: source.intent ?? 'ask',
    taskState: source.taskState ?? 'awaiting_answer',
    expectedStudentAction: source.expectedStudentAction ?? 'none',
    hintLevel: source.hintLevel ?? 0,
    confidence: source.confidence ?? 0.7,
    learningEvidence: Array.isArray(source.learningEvidence) ? source.learningEvidence : [],
    safetyFlags: Array.isArray(source.safetyFlags) ? source.safetyFlags : ['none'],
    ...(Array.isArray(source.suggestedActions)
      ? { suggestedActions: source.suggestedActions }
      : {}),
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
  if (!config.apiKey)
    return { response: localTutorResponse(request), provider: 'local', model: 'fallback' };
  try {
    const result = await callGateway(request, config);
    return { ...result, provider: 'gateway', model: config.model };
  } catch (error) {
    // Degrade to a safe hint. Log only provider metadata; never student text or the prompt.
    if (error instanceof TutorProviderError) {
      console.error('Tutor provider fallback', {
        code: error.code,
        statusCode: error.details?.statusCode ?? null,
        providerCode: error.details?.providerCode ?? null,
        model: config.model,
      });
    } else {
      console.error('Tutor provider fallback', { code: 'unknown', model: config.model });
    }
    return { response: localTutorResponse(request), provider: 'local', model: 'fallback' };
  }
}
