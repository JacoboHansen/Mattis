import type { StudentMastery, TutorTask } from '../supabase/data';
import type { MattisConceptKey } from '../ai/homework-parser';
import { MATTIS_CONCEPT_KEYS } from '../ai/homework-parser';

export type SessionPlan = {
  homeworkMinutes: number;
  repetitionMinutes: number;
  summaryMinutes: number;
  focusConcepts: MattisConceptKey[];
  reasonNb: string;
  reviewTasks: Array<{
    sourceText: string;
    taskType: string;
    conceptKeys: MattisConceptKey[];
    estimatedMinutes: number;
  }>;
};

const CONCEPT_SET = new Set<string>(MATTIS_CONCEPT_KEYS);

export const CONCEPT_TITLES_NB: Record<MattisConceptKey, string> = {
  'numbers.place_value': 'tallforståelse og plassverdi',
  'numbers.operations': 'regnearter',
  'numbers.negative': 'negative tall',
  'numbers.fractions_decimals': 'brøk og desimaltall',
  'numbers.powers_roots': 'potenser og røtter',
  'algebra.patterns': 'mønstre og generalisering',
  'algebra.expressions': 'algebraiske uttrykk',
  'algebra.equations': 'likninger',
  'algebra.systems': 'likningssett',
  'functions.linear': 'lineære funksjoner',
  'functions.other': 'ikke-lineære funksjoner',
  'geometry.shapes_angles': 'figurer og vinkler',
  'geometry.measurement': 'måling, areal og volum',
  'geometry.pythagoras': 'Pytagoras',
  'geometry.similarity_congruence': 'formlikhet og kongruens',
  statistics: 'statistikk',
  probability: 'sannsynlighet',
  'percent.finance': 'prosent og økonomi',
  'units.rates': 'enheter og forholdstall',
  'spreadsheet.modelling': 'regneark og modellering',
  'programming.math': 'programmering i matematikk',
};

const REVIEW_TEMPLATES: Partial<Record<MattisConceptKey, string>> = {
  'numbers.place_value': 'Skriv tallet 4 072 på utvidet form, og forklar verdien til hvert siffer.',
  'numbers.operations': 'Regn ut 84 ÷ 7 + 6 · 3. Forklar hvilken regneart du tar først.',
  'numbers.negative': 'Regn ut −7 + 12 − 5, og forklar hvordan du tenker om fortegnene.',
  'numbers.fractions_decimals': 'Regn ut 3/4 + 2/3. Vis hvordan du finner en felles nevner.',
  'numbers.powers_roots': 'Forenkle 2³ · 2⁴ og forklar hvilken potensregel du bruker.',
  'algebra.patterns': 'Tallfølgen er 4, 7, 10, 13, … Finn et uttrykk for ledd nummer n.',
  'algebra.expressions': 'Forenkle 3(2x − 4) + 5x, og forklar hvert steg.',
  'algebra.equations': 'Løs 3x + 5 = 20, og kontroller svaret ved å sette det inn igjen.',
  'algebra.systems': 'Løs likningssettet y = x + 2 og y = 10 − x. Forklar metoden din.',
  'functions.linear':
    'En rett linje går gjennom (0, 3) og (4, 11). Finn stigningstall og funksjonsuttrykk.',
  'functions.other': 'Sammenlign y = x² og y = 2x + 3 for x = 0, 1 og 2. Hva legger du merke til?',
  'geometry.shapes_angles':
    'To vinkler i en trekant er 48° og 67°. Finn den siste vinkelen og forklar hvorfor.',
  'geometry.measurement':
    'Et rektangel er 8 cm langt og 5 cm bredt. Finn omkrets og areal, og skill mellom enhetene.',
  'geometry.pythagoras':
    'En rettvinklet trekant har kateter 6 cm og 8 cm. Finn hypotenusen og vis oppsettet.',
  'geometry.similarity_congruence':
    'To formlike trekanter har målestokk 2 : 3. En side er 8 cm i den minste. Finn tilsvarende side i den største.',
  statistics: 'Tallene er 3, 4, 4, 7 og 12. Finn gjennomsnitt og median, og forklar forskjellen.',
  probability:
    'En pose har 3 røde og 5 blå kuler. Finn sannsynligheten for rød kule som brøk og prosent.',
  'percent.finance':
    'En vare koster 800 kr og settes ned 25 %. Finn ny pris ved hjelp av vekstfaktor.',
  'units.rates': 'En syklist kjører 36 km på 1,5 time. Finn gjennomsnittsfarten i km/t.',
  'spreadsheet.modelling':
    'Lag en regnearkformel som beregner pris inkludert 25 % mva når prisen uten mva står i celle B2.',
  'programming.math':
    'Les uttrykket total = total + 3. Forklar hva som skjer hvis linjen kjøres fire ganger fra total = 0.',
};

function asConceptKey(value: string): MattisConceptKey | null {
  return CONCEPT_SET.has(value) ? (value as MattisConceptKey) : null;
}

function uniqueTaskConcepts(tasks: TutorTask[]) {
  const concepts: MattisConceptKey[] = [];
  for (const task of tasks) {
    for (const value of task.concept_keys) {
      const concept = asConceptKey(value);
      if (concept && !concepts.includes(concept)) concepts.push(concept);
    }
  }
  return concepts;
}

export function buildSessionPlan(input: {
  durationMinutes: number;
  homeworkTasks: TutorTask[];
  mastery: StudentMastery[];
  nextTopicNb?: string | null;
}): SessionPlan {
  const summaryMinutes = Math.min(5, Math.max(3, Math.round(input.durationMinutes * 0.1)));
  const desiredHomework = input.homeworkTasks.reduce(
    (sum, task) => sum + Math.max(2, Math.min(task.estimated_minutes, 15)),
    0,
  );
  const maximumHomework = Math.max(0, input.durationMinutes - summaryMinutes - 5);
  const homeworkMinutes = Math.min(desiredHomework, maximumHomework);
  const repetitionMinutes = Math.max(0, input.durationMinutes - summaryMinutes - homeworkMinutes);

  const lowMastery = input.mastery
    .filter((item) => item.evidence_count > 0 && item.estimate < 0.72)
    .map((item) => asConceptKey(item.concept_key))
    .filter((item): item is MattisConceptKey => item !== null);
  const homeworkConcepts = uniqueTaskConcepts(input.homeworkTasks);
  const focusConcepts = [...new Set([...lowMastery, ...homeworkConcepts])].slice(
    0,
    repetitionMinutes >= 12 ? 2 : repetitionMinutes >= 5 ? 1 : 0,
  );
  const perTaskMinutes = focusConcepts.length
    ? Math.max(4, Math.floor(repetitionMinutes / focusConcepts.length))
    : 0;
  const reviewTasks = focusConcepts.map((concept) => ({
    sourceText:
      REVIEW_TEMPLATES[concept] ??
      `Lag et eksempel om ${CONCEPT_TITLES_NB[concept]} og forklar løsningen steg for steg.`,
    taskType: concept.startsWith('geometry.') ? 'geometry' : 'open_response',
    conceptKeys: [concept],
    estimatedMinutes: Math.min(perTaskMinutes, 15),
  }));

  const focusText = focusConcepts.map((concept) => CONCEPT_TITLES_NB[concept]).join(' og ');
  return {
    homeworkMinutes,
    repetitionMinutes,
    summaryMinutes,
    focusConcepts,
    reasonNb: focusText
      ? `Repetisjonen prioriterer ${focusText}${input.nextTopicNb ? ` og tar hensyn til «${input.nextTopicNb}»` : ''}.`
      : 'Økten bruker tiden på leksene og en kort oppsummering.',
    reviewTasks,
  };
}
