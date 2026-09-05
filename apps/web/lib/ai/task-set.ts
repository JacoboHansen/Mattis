import { MATTIS_CONCEPT_KEYS, type MattisConceptKey } from './homework-parser';
import { gatewayProviderOptions } from './privacy';
import { curriculumForGrade, getCurriculumTrack } from '../curriculum/catalog';
import {
  getTutorProviderConfig,
  TutorProviderError,
  type TutorProviderConfig,
} from './provider';

export const TASK_SET_REQUEST_SCHEMA_VERSION = 'task-set-request.v0.1' as const;
export const TASK_SET_RESPONSE_SCHEMA_VERSION = 'task-set.v0.1' as const;

export type TaskSetReason = 'no_homework' | 'more_practice';

export type TaskSetRequest = {
  gradeLevel: number | null;
  courseCode: string | null;
  durationMinutes: number;
  remainingMinutes: number;
  reason: TaskSetReason;
  focusConcepts: string[];
  existingTopics: string[];
  history: Array<{ role: 'student' | 'tutor'; content: string }>;
  topic?: string;
};

export type GeneratedTaskSetTask = {
  text: string;
  taskType: string;
  conceptKeys: MattisConceptKey[];
  estimatedMinutes: number;
};

export type TaskSetDraft = {
  titleNb: string;
  introNb: string;
  tasks: GeneratedTaskSetTask[];
};

export type TaskSetGeneration = TaskSetDraft & {
  provider: 'gateway';
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

const TASK_TYPES = new Set([
  'calculation',
  'equation',
  'word_problem',
  'geometry',
  'graph',
  'statistics',
  'multiple_choice',
  'open_response',
]);

const TASK_TYPE_ALIASES: Record<string, string> = {
  arithmetic: 'calculation',
  calculate: 'calculation',
  fractions: 'calculation',
  word: 'word_problem',
  wordproblem: 'word_problem',
  graphing: 'graph',
  choice: 'multiple_choice',
  open: 'open_response',
  text: 'open_response',
};

const CONCEPT_KEYS = new Set<string>(MATTIS_CONCEPT_KEYS);

const TASK_SET_SYSTEM_PROMPT =
  'Du er oppgaveforfatter for Mattis, en trygg mattelærer for elever på ungdomsskolen i Norge.\n' +
  '\n' +
  'Lag et lite, gjennomførbart oppgavesett som eleven kan løse én oppgave om gangen sammen med Mattis.\n' +
  '- Lag bare uløste oppgaver. Ikke ta med fasit, løsningsforslag eller hint.\n' +
  '- Oppgavene skal være matematisk korrekte, tydelige og passe til elevens nivå.\n' +
  '- Varier gjerne mellom regning, forklaring og en enkel tekstoppgave, men unngå unødvendig lange oppgaver.\n' +
  '- Ta hensyn til oppgaver og temaer eleven allerede har jobbet med, men ikke lag nesten identiske oppgaver.\n' +
  '- Bruk vanlig norsk og LaTeX mellom \\( og \\), eller \\[ og \\] for uttrykk på egen linje.\n' +
  '- Hver oppgave skal kunne vises som et eget oppgavekort etter at settet er laget, ikke som en liste med oppgaver i chatmeldingen.\n' +
  '- Gi settet et kort og passende navn på 2–4 ord. Ikke bruk «Kort oppgavesett» eller «Et lite oppgavesett».\n' +
  '- Skriv introNb som én kort, naturlig setning som leder rett inn i den første oppgaven som vises. Ikke fortell at du har «laget et oppgavesett», ikke ramse opp oppgavene og ikke omtal Mattis i tredjeperson.\n' +
  '- Returner kun ett JSON-objekt. Ingen markdown-gjerder og ingen tekst utenfor JSON.\n' +
  '\n' +
  'Kontrakten er:\n' +
  '{\n' +
  '  "schemaVersion": "task-set.v0.1",\n' +
  '  "titleNb": "Prosent på en smart måte",\n' +
  '  "introNb": "Da begynner vi med den første – hvordan ville du startet?",\n' +
  '  "tasks": [\n' +
  '    {\n' +
  '      "text": "Løs \\(2x + 3 = 11\\). Vis det viktigste steget.",\n' +
  '      "taskType": "equation",\n' +
  '      "conceptKeys": ["algebra.equations"],\n' +
  '      "estimatedMinutes": 5\n' +
  '    }\n' +
  '  ]\n' +
  '}\n' +
  '\n' +
  'Returner 1–5 oppgaver. Ved under fem minutter igjen eller ønske om én ekstra oppgave: lag bare én kort oppgave. Summen av estimatedMinutes skal normalt holde seg innenfor tiden som er igjen.';

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number) {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum
    ? value.trim()
    : null;
}

export function normalizeTaskSetTitle(value: unknown) {
  const title = boundedText(value, 80)
    ?.replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();
  if (
    !title ||
    /^(?:et (?:lite )?)?oppgavesett$/i.test(title) ||
    /^kort oppgavesett$/i.test(title) ||
    /^ekstra$/i.test(title)
  ) {
    return 'Litt mer øving';
  }
  return title.slice(0, 56);
}

function normalizeTaskType(value: unknown) {
  const normalized = boundedText(value, 80)?.toLowerCase().replace(/\s+/g, '_');
  if (normalized && TASK_TYPES.has(normalized)) return normalized;
  if (normalized && TASK_TYPE_ALIASES[normalized])
    return TASK_TYPE_ALIASES[normalized];
  return 'open_response';
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
  return value.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
}

function extractJson(content: unknown): unknown {
  const textContent = contentToText(content);
  if (typeof textContent !== 'string') return textContent;
  const fence = String.fromCharCode(96).repeat(3);
  const trimmed = textContent
    .trim()
    .replace(new RegExp('^' + fence + '(?:json)?\\s*', 'i'), '')
    .replace(new RegExp('\\s*' + fence + '$'), '')
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
      // Providers occasionally wrap valid JSON in a short sentence.
    }
  }
  return undefined;
}

function usageInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

export function parseTaskSetResponse(
  value: unknown,
  fallbackConcepts: string[] = [],
): ParseResult<TaskSetDraft> {
  if (!isRecord(value))
    return { ok: false, error: 'Oppgavesettet er ikke et objekt.' };
  const rawTasks = Array.isArray(value.tasks)
    ? value.tasks
    : Array.isArray(value.items)
      ? value.items
      : null;
  if (!rawTasks || rawTasks.length < 1 || rawTasks.length > 5) {
    return {
      ok: false,
      error: 'Oppgavesettet må inneholde mellom 2 og 5 oppgaver.',
    };
  }

  const fallbackConcept =
    fallbackConcepts.find((concept) => CONCEPT_KEYS.has(concept)) ??
    'numbers.operations';
  const tasks: GeneratedTaskSetTask[] = [];
  for (const raw of rawTasks) {
    if (!isRecord(raw))
      return { ok: false, error: 'En oppgave i settet har feil format.' };
    const text = boundedText(
      raw.text ?? raw.normalizedText ?? raw.sourceText,
      1_200,
    );
    if (!text) return { ok: false, error: 'En oppgave mangler oppgavetekst.' };
    const rawConcepts = Array.isArray(raw.conceptKeys)
      ? raw.conceptKeys
      : Array.isArray(raw.concept_keys)
        ? raw.concept_keys
        : [];
    const conceptKeys = rawConcepts
      .filter(
        (concept): concept is string =>
          typeof concept === 'string' && CONCEPT_KEYS.has(concept),
      )
      .map((concept) => concept as MattisConceptKey);
    const estimatedRaw = Number(
      raw.estimatedMinutes ?? raw.estimated_minutes ?? 5,
    );
    const estimatedMinutes = Number.isFinite(estimatedRaw)
      ? Math.max(2, Math.min(12, Math.round(estimatedRaw)))
      : 5;
    tasks.push({
      text,
      taskType: normalizeTaskType(raw.taskType ?? raw.task_type),
      conceptKeys: [
        ...new Set(
          conceptKeys.length
            ? conceptKeys
            : [fallbackConcept as MattisConceptKey],
        ),
      ],
      estimatedMinutes,
    });
  }

  return {
    ok: true,
    value: {
      titleNb: normalizeTaskSetTitle(value.titleNb ?? value.title),
      introNb:
        boundedText(value.introNb ?? value.intro ?? value.message, 240) ??
        'Jeg har laget noen oppgaver som passer til økten.',
      tasks,
    },
  };
}

function buildPrompt(request: TaskSetRequest) {
  const focus =
    request.focusConcepts.length > 0
      ? request.focusConcepts.join(', ')
      : 'velg et passende tema';
  const topics =
    request.existingTopics.length > 0
      ? request.existingTopics.slice(-8).join('\n')
      : '(ingen tidligere oppgaver)';
  const history =
    request.history.length > 0
      ? request.history
          .slice(-8)
          .map(
            (message) =>
              (message.role === 'student' ? 'ELEV: ' : 'TUTOR: ') +
              message.content,
          )
          .join('\n')
      : '(ingen tidligere samtale)';
  const curriculum =
    getCurriculumTrack(request.courseCode) ??
    curriculumForGrade(request.gradeLevel);

  return [
    'Elevnivå: ' +
      (request.gradeLevel ? request.gradeLevel + '. trinn' : 'ikke oppgitt') +
      (request.courseCode ? ', kurs ' + request.courseCode : ''),
    curriculum
      ? 'Læreplan og kompetansefokus: ' +
        curriculum.planCode +
        ' · ' +
        curriculum.competenceGoals.join('; ')
      : 'Læreplan: ikke valgt',
    'Grunnen til settet: ' +
      (request.reason === 'no_homework'
        ? 'Eleven har ikke lekser i dag.'
        : 'Eleven er ferdig med oppgavene og kan øve litt mer.'),
    'Tid igjen: omtrent ' +
      request.remainingMinutes +
      ' minutter av en økt på ' +
      request.durationMinutes +
      ' minutter.',
    'Tema eleven oppga: ' + (request.topic?.trim() || '(ikke oppgitt)'),
    'Prioriter gjerne disse temaene: ' + focus,
    'Tidligere oppgaver:\n<tasks>\n' + topics + '\n</tasks>',
    'Samtalehistorikk:\n<history>\n' + history + '\n</history>',
    'Lag oppgavesettet nå. Ikke gjenta tidligere oppgaver ordrett, og ikke legg inn fasit.',
  ].join('\n\n');
}

async function callGateway(
  request: TaskSetRequest,
  config: TutorProviderConfig,
): Promise<{ draft: TaskSetDraft; usage?: TaskSetGeneration['usage'] }> {
  if (!config.apiKey) {
    throw new TutorProviderError(
      'Ingen AI-leverandør er konfigurert.',
      'unavailable',
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const providerOptions = gatewayProviderOptions();
    const response = await fetch(config.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 1_800,
        messages: [
          { role: 'system', content: TASK_SET_SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(request) },
        ],
        ...(providerOptions ? { providerOptions } : {}),
      }),
    });
    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => undefined)) as
        { type?: unknown; code?: unknown } | undefined;
      throw new TutorProviderError(
        'AI-leverandøren svarte med en feil.',
        'bad_response',
        {
          statusCode: response.status,
          providerCode:
            typeof errorPayload?.type === 'string'
              ? errorPayload.type.slice(0, 80)
              : typeof errorPayload?.code === 'string'
                ? errorPayload.code.slice(0, 80)
                : undefined,
        },
      );
    }
    const payload = (await response.json().catch(() => undefined)) as
      | {
          choices?: Array<{ message?: { content?: unknown } }>;
          usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
        }
      | undefined;
    const parsed = parseTaskSetResponse(
      extractJson(payload?.choices?.[0]?.message?.content),
      request.focusConcepts,
    );
    if (!parsed.ok) {
      throw new TutorProviderError(
        'AI-leverandøren returnerte ugyldig oppgavesett.',
        'invalid_output',
        { parseError: parsed.error },
      );
    }
    const inputTokens = usageInteger(payload?.usage?.prompt_tokens);
    const outputTokens = usageInteger(payload?.usage?.completion_tokens);
    return {
      draft: parsed.value,
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
      throw new TutorProviderError(
        'AI-leverandøren brukte for lang tid.',
        'timeout',
      );
    }
    throw new TutorProviderError(
      'AI-leverandøren er ikke tilgjengelig.',
      'unavailable',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateTaskSet(
  request: TaskSetRequest,
): Promise<TaskSetGeneration> {
  const config = getTutorProviderConfig();
  try {
    const result = await callGateway(request, config);
    return {
      ...result.draft,
      provider: 'gateway',
      model: config.model,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  } catch (error) {
    const fallbackModel = config.fallbackModel;
    if (
      !(error instanceof TutorProviderError) ||
      error.code !== 'bad_response' ||
      error.details?.statusCode !== 429 ||
      !fallbackModel ||
      fallbackModel === config.model
    ) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    const result = await callGateway(request, {
      ...config,
      model: fallbackModel,
    });
    return {
      ...result.draft,
      provider: 'gateway',
      model: fallbackModel,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  }
}
