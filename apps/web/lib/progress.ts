import { MATTIS_CONCEPT_KEYS, type MattisConceptKey } from './ai/homework-parser';
import type { StudentCurriculumConcept, StudentMastery } from './supabase/data';

export type MasteryStatus = 'not_started' | 'practising' | 'developing' | 'secure';

export type ProgressTopic = {
  conceptKey: MattisConceptKey;
  title: string;
  description: string | null;
  gradeMin: number | null;
  gradeMax: number | null;
  mastery: number | null;
  evidenceCount: number;
  status: MasteryStatus;
  statusLabel: string;
  category: string;
};

export type ProgressGroup = {
  id: string;
  label: string;
  topics: ProgressTopic[];
};

export type ProgressOverview = {
  gradeLevel: number | null;
  totalTopics: number;
  startedTopics: number;
  groups: ProgressGroup[];
};

const CONCEPT_ORDER = new Map<string, number>(
  MATTIS_CONCEPT_KEYS.map((conceptKey, index) => [conceptKey, index]),
);

const CATEGORY_LABELS: Record<string, string> = {
  numbers: 'Tall og regning',
  algebra: 'Algebra',
  functions: 'Funksjoner',
  geometry: 'Geometri',
  statistics: 'Statistikk',
  probability: 'Sannsynlighet',
  percent: 'Prosent og økonomi',
  units: 'Enheter og forholdstall',
  spreadsheet: 'Modellering og regneark',
  programming: 'Programmering',
};

const CATEGORY_ORDER = [
  'numbers',
  'algebra',
  'functions',
  'geometry',
  'statistics',
  'probability',
  'percent',
  'units',
  'spreadsheet',
  'programming',
];

function categoryFor(conceptKey: string) {
  const prefix = conceptKey.split('.')[0];
  return {
    id: prefix,
    label: CATEGORY_LABELS[prefix] ?? 'Andre temaer',
  };
}

function isRelevantForGrade(concept: StudentCurriculumConcept, gradeLevel: number | null) {
  if (gradeLevel === null) return true;
  return (
    (concept.grade_min === null || concept.grade_min <= gradeLevel) &&
    (concept.grade_max === null || concept.grade_max >= gradeLevel)
  );
}

function masteryFor(conceptKey: string, mastery: StudentMastery[]) {
  const item = mastery.find((entry) => entry.concept_key === conceptKey);
  if (!item || item.evidence_count < 1) return null;
  return {
    estimate: Math.max(0, Math.min(1, item.estimate)),
    evidenceCount: item.evidence_count,
  };
}

function statusFor(estimate: number | null): Pick<ProgressTopic, 'status' | 'statusLabel'> {
  if (estimate === null) return { status: 'not_started', statusLabel: 'Ikke startet' };
  if (estimate >= 0.8) return { status: 'secure', statusLabel: 'God kontroll' };
  if (estimate >= 0.58) return { status: 'developing', statusLabel: 'På vei' };
  return { status: 'practising', statusLabel: 'Øver på dette' };
}

export function buildProgressOverview(
  concepts: StudentCurriculumConcept[],
  mastery: StudentMastery[],
  gradeLevel: number | null,
): ProgressOverview {
  const topics = concepts
    .filter((concept) => CONCEPT_ORDER.has(concept.concept_key))
    .filter((concept) => isRelevantForGrade(concept, gradeLevel))
    .sort(
      (left, right) =>
        (CONCEPT_ORDER.get(left.concept_key) ?? Number.MAX_SAFE_INTEGER) -
        (CONCEPT_ORDER.get(right.concept_key) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((concept) => {
      const masteryItem = masteryFor(concept.concept_key, mastery);
      const estimate = masteryItem?.estimate ?? null;
      const category = categoryFor(concept.concept_key);
      return {
        conceptKey: concept.concept_key as MattisConceptKey,
        title: concept.title_nb,
        description: concept.description_nb,
        gradeMin: concept.grade_min,
        gradeMax: concept.grade_max,
        mastery: estimate,
        evidenceCount: masteryItem?.evidenceCount ?? 0,
        ...statusFor(estimate),
        category: category.id,
      } satisfies ProgressTopic;
    });

  const groups = CATEGORY_ORDER.map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    topics: topics.filter((topic) => topic.category === id),
  })).filter((group) => group.topics.length > 0);

  return {
    gradeLevel,
    totalTopics: topics.length,
    startedTopics: topics.filter((topic) => topic.mastery !== null).length,
    groups,
  };
}
