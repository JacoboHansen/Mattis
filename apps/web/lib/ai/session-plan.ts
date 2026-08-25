import { gatewayProviderOptions } from './privacy';
import { curriculumForGrade, getCurriculumTrack } from '../curriculum/catalog';
import { getTutorProviderConfig } from './provider';
import { MATTIS_CONCEPT_KEYS, type MattisConceptKey } from './homework-parser';
import type { SessionPlanTimelineItem } from '../planning/session-plan';

export type AiSessionPlanInput = {
  durationMinutes: number;
  gradeLevel: number | null;
  courseCode: string | null;
  mastery: Array<{
    conceptKey: string;
    estimate: number;
    confidence: number;
    evidenceCount: number;
  }>;
  previousNextTopic: string | null;
  previousTopics: string[];
  recentSummaries: string[];
  hasHomework: boolean;
  learnerProfile?: {
    preferredSessionMinutes: number | null;
    preferredWeeklySessions: number | null;
    learningStyle: string | null;
    strengthConceptKeys: string[];
    focusConceptKeys: string[];
  };
};

export type AiSessionPlan = {
  reasonNb: string;
  focusConcepts: MattisConceptKey[];
  timeline: SessionPlanTimelineItem[];
};

type RawPlan = {
  reasonNb?: unknown;
  focusConcepts?: unknown;
  timeline?: unknown;
};

const PLAN_PHASES = new Set(['homework', 'repetition', 'summary']);
const PLAN_SEGMENT_TYPES = new Set(['homework', 'review', 'new_topic', 'mixed', 'summary']);
const CONCEPTS = new Set<string>(MATTIS_CONCEPT_KEYS);

function parseJson(content: unknown): RawPlan | null {
  if (typeof content !== 'string') return null;
  const fence = String.fromCharCode(96).repeat(3);
  const trimmed = content
    .trim()
    .replace(new RegExp('^' + fence + '(?:json)?\\s*', 'i'), '')
    .replace(new RegExp('\\s*' + fence + '$'), '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawPlan) : null;
  } catch {
    return null;
  }
}

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function clampText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeTimeline(value: unknown, durationMinutes: number): SessionPlanTimelineItem[] {
  if (!Array.isArray(value)) return [];
  const items = value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    const label = clampText(item.label, 120);
    const phase = typeof item.phase === 'string' ? item.phase : '';
    const minutes = positiveInteger(item.minutes);
    if (!label || !PLAN_PHASES.has(phase) || !minutes) return [];
    const segmentType =
      typeof item.segmentType === 'string' && PLAN_SEGMENT_TYPES.has(item.segmentType)
        ? (item.segmentType as SessionPlanTimelineItem['segmentType'])
        : phase === 'homework'
          ? 'homework'
          : phase === 'summary'
            ? 'summary'
            : 'mixed';
    const conceptKey =
      typeof item.conceptKey === 'string' && CONCEPTS.has(item.conceptKey)
        ? (item.conceptKey as MattisConceptKey)
        : undefined;
    return [
      {
        id: clampText(item.id, 80) || 'segment-' + (index + 1),
        label,
        phase: phase as SessionPlanTimelineItem['phase'],
        segmentType,
        minutes,
        ...(conceptKey ? { conceptKey } : {}),
      },
    ];
  });

  if (!items.length) return [];
  const normalized = items.slice(0, 8);
  const total = normalized.reduce((sum, item) => sum + item.minutes, 0);
  if (total > durationMinutes) {
    let excess = total - durationMinutes;
    for (let index = normalized.length - 1; index >= 0 && excess > 0; index -= 1) {
      const item = normalized[index]!;
      const reduction = Math.min(excess, Math.max(0, item.minutes - 1));
      item.minutes -= reduction;
      excess -= reduction;
    }
  } else if (total < durationMinutes) {
    const summary = normalized.find((item) => item.phase === 'summary');
    (summary ?? normalized[normalized.length - 1]!).minutes += durationMinutes - total;
  }
  return normalized.filter((item) => item.minutes > 0);
}

function normalizePlan(raw: RawPlan | null, durationMinutes: number): AiSessionPlan | null {
  if (!raw) return null;
  const timeline = normalizeTimeline(raw.timeline, durationMinutes);
  if (!timeline.length) return null;
  const focusConcepts = Array.isArray(raw.focusConcepts)
    ? raw.focusConcepts
        .filter(
          (concept): concept is MattisConceptKey =>
            typeof concept === 'string' && CONCEPTS.has(concept),
        )
        .slice(0, 6)
    : [];
  const reasonNb = clampText(raw.reasonNb, 300);
  if (!reasonNb) return null;
  return { reasonNb, focusConcepts, timeline };
}

function formatMastery(input: AiSessionPlanInput) {
  if (!input.mastery.length) return 'Ingen læringssignaler er lagret ennå.';
  return input.mastery
    .slice()
    .sort((left, right) => left.estimate - right.estimate)
    .slice(0, 8)
    .map(
      (item) =>
        item.conceptKey +
        ': ' +
        Math.round(item.estimate * 100) +
        ' % mestring, ' +
        item.evidenceCount +
        ' signaler',
    )
    .join('\n');
}

export async function generateSessionPlan(
  input: AiSessionPlanInput,
): Promise<AiSessionPlan | null> {
  const config = getTutorProviderConfig();
  if (!config.apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 12_000));
  const system =
    'Du lager en fleksibel plan for én matteøkt med Mattis.\n\n' +
    'Du skal selv velge en naturlig rekkefølge og dele økten inn i 2–6 meningsfulle segmenter. Det finnes ingen fast mal: bruk lekser når det er relevant, legg inn konkret repetisjon av svake områder, legg inn et nytt tema når det passer, og bruk bare så mye oppsummering som er nyttig. En økt uten lekser trenger ikke starte med en lekse-del.\n\n' +
    'Tidslinjen skal beskrive hva Mattis faktisk foreslår å gjøre, ikke bare generelle faser. Segmentetiketter skal være korte og konkrete, for eksempel «Brøk · repetisjon», «Funksjoner · nytt tema» eller «Lekser: oppgave 3–5». Summen av minuttene må være nøyaktig øktlengden.\n\n' +
    'Hvis eleven har oppgitt egne ønsker eller fokusområder, skal disse veie tungt. Ikke overstyr et eksplisitt ønske med et svakere område uten en god pedagogisk grunn.\n\n' +
    'Returner kun JSON med feltene schemaVersion, reasonNb, focusConcepts og timeline. Hvert timeline-element skal ha id, label, phase (homework, repetition eller summary), segmentType (homework, review, new_topic, mixed eller summary), minutes og valgfri conceptKey. Ikke skriv til eleven og ikke nevn interne data som en rapport.';
  const user = [
    'Øktlengde: ' + input.durationMinutes + ' minutter',
    'Trinn: ' + (input.gradeLevel ?? 'ukjent') + ', kurs: ' + (input.courseCode ?? 'ukjent'),
    (() => {
      const curriculum =
        getCurriculumTrack(input.courseCode) ?? curriculumForGrade(input.gradeLevel);
      return curriculum
        ? 'Læreplan og kompetansefokus: ' +
            curriculum.planCode +
            ' · ' +
            curriculum.competenceGoals.join('; ')
        : 'Læreplan: ikke valgt';
    })(),
    'Lekser tilgjengelig: ' + (input.hasHomework ? 'ja' : 'nei'),
    'Svakere områder:\n' + formatMastery(input),
    'Tema fra forrige økt: ' + (input.previousNextTopic || 'ingen'),
    'Tidligere temaer:\n' + (input.previousTopics.join('\n') || 'ingen'),
    'Tidligere oppsummeringer:\n' + (input.recentSummaries.join('\n') || 'ingen'),
    'Eksplisitte elevpreferanser:\n' +
      (input.learnerProfile
        ? [
            'ønsket øktlengde: ' + (input.learnerProfile.preferredSessionMinutes ?? 'ikke oppgitt'),
            'ønsket frekvens: ' +
              (input.learnerProfile.preferredWeeklySessions ?? 'ikke oppgitt') +
              ' økter per uke',
            'arbeidsmåte: ' + (input.learnerProfile.learningStyle ?? 'ikke oppgitt'),
            'temaer eleven vil forbedre: ' +
              (input.learnerProfile.focusConceptKeys.join(', ') || 'ingen'),
            'temaer eleven føler seg trygg på: ' +
              (input.learnerProfile.strengthConceptKeys.join(', ') || 'ingen'),
          ].join('\n')
        : 'ingen'),
  ].join('\n\n');

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
        max_tokens: 700,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(providerOptions ? { providerOptions } : {}),
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => undefined)) as
      { choices?: Array<{ message?: { content?: unknown } }> } | undefined;
    return normalizePlan(parseJson(payload?.choices?.[0]?.message?.content), input.durationMinutes);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
