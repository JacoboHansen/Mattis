export type CurriculumTrack = {
  code: string;
  label: string;
  gradeLevel: number;
  planCode: string;
  officialUrl: string;
  competenceGoals: readonly string[];
};

export type CurriculumStage = {
  value: number;
  label: string;
  description: string;
  courseCodes: readonly string[];
};

const PRIMARY_PLAN_URL = 'https://www.udir.no/lk20/mat01-06';

export const CURRICULUM_TRACKS: readonly CurriculumTrack[] = [
  {
    code: 'MAT01-06',
    label: 'Matematikk 1.–10. trinn',
    gradeLevel: 1,
    planCode: 'MAT01-06',
    officialUrl: PRIMARY_PLAN_URL,
    competenceGoals: [
      'Tallforståelse, telling, mengder og regnestrategier',
      'Geometri, mønstre og symmetri',
      'Måling, tid, penger, statistikk og sannsynlighet',
      'Algebra, likninger, funksjoner og modellering på ungdomstrinnet',
      'Programmering, digitale verktøy, resonnering og problemløsing',
    ],
  },
  {
    code: '1P',
    label: 'Matematikk 1P · praktisk',
    gradeLevel: 11,
    planCode: 'MAT08-01',
    officialUrl: 'https://www.udir.no/lk20/mat08-01',
    competenceGoals: [
      'Modellere situasjoner fra samfunnsliv og arbeidsliv',
      'Bruke variable, formler, prosent, promille og vekstfaktor',
      'Utforske proporsjonalitet og sammensatte måleenheter',
      'Tolke og bruke funksjoner i modellering og problemløsing',
      'Bruke digitale verktøy og arbeide med potenser og standardform',
    ],
  },
  {
    code: '1T',
    label: 'Matematikk 1T · teoretisk',
    gradeLevel: 11,
    planCode: 'MAT09-02',
    officialUrl: 'https://www.udir.no/lk20/mat09-02',
    competenceGoals: [
      'Algoritmisk tenking, programmering og problemløsing',
      'Matematiske bevis, algebra, likninger, ulikheter og likningssystemer',
      'Andregradsuttrykk, polynom-, rasjonale-, eksponential- og potensfunksjoner',
      'Vekstfart, derivasjon og matematisk modellering',
      'Trigonometri, sinus-, cosinus- og arealsetningen',
    ],
  },
  {
    code: '1P-Y',
    label: 'Matematikk 1P-Y · yrkesfaglig',
    gradeLevel: 11,
    planCode: 'MAT08-01',
    officialUrl: 'https://www.udir.no/lk20/mat08-01',
    competenceGoals: [
      'Personlig økonomi og beregninger fra dagligliv og yrkesliv',
      'Formler og sammensatte måleenheter i praktiske situasjoner',
      'Data, overslag, beregninger og presentasjon av resultater',
      'Regneark, budsjett og kostnadsberegning',
      'Matematisk problemløsing knyttet til det valgte yrkesfaget',
    ],
  },
  {
    code: '2P',
    label: 'Matematikk 2P · praktisk',
    gradeLevel: 12,
    planCode: 'MAT05-04',
    officialUrl: 'https://www.udir.no/lk20/mat05-04',
    competenceGoals: [
      'Prosent, prosentpoeng og vekstfaktor i praktisk modellering',
      'Prisindeks, lønn, inntekt, lån og personlig økonomi',
      'Likninger, likningssystemer og ulikheter',
      'Datasett, sentralmål og spredningsmål',
      'Formlikhet, målestokk og geometriske figurer',
    ],
  },
  {
    code: 'S1',
    label: 'Matematikk S1 · samfunnsfaglig',
    gradeLevel: 12,
    planCode: 'MAT04-02',
    officialUrl: 'https://www.udir.no/lk20/mat04-02',
    competenceGoals: [
      'Analysere og presentere reelle datasett fra samfunnsøkonomiske temaer',
      'Vekstfart, grenseverdi og derivasjon',
      'Derivasjon i modellering og optimaliseringsproblemer',
      'Potenser, logaritmer og eksponentiallikninger',
      'Matematiske resonnementer, symbolspråk og digitale verktøy',
    ],
  },
  {
    code: 'R1',
    label: 'Matematikk R1 · realfaglig',
    gradeLevel: 12,
    planCode: 'MAT03-02',
    officialUrl: 'https://www.udir.no/lk20/mat03-02',
    competenceGoals: [
      'Derivasjon, grenseverdi, kontinuitet og funksjonsanalyse',
      'Potenser, logaritmer, eksponential og logistisk vekst',
      'Reelle datasett og matematisk modellering',
      'Parameterframstillinger og vektorer i planet',
      'Utforskning, bevis, resonnering og digitale verktøy',
    ],
  },
  {
    code: 'S2',
    label: 'Matematikk S2 · samfunnsfaglig',
    gradeLevel: 13,
    planCode: 'MAT04-02',
    officialUrl: 'https://www.udir.no/lk20/mat04-02',
    competenceGoals: [
      'Rekker og rekursive sammenhenger med programmering',
      'Det bestemte integralet og analyse av funksjoner',
      'Derivasjon og integrasjon i modellering',
      'Eksponentiell og logistisk vekst i reelle datasett',
      'Forventningsverdi, varians, standardavvik og statistiske fordelinger',
      'Grensekostnader og grenseinntekter i økonomiske modeller',
    ],
  },
  {
    code: 'R2',
    label: 'Matematikk R2 · realfaglig',
    gradeLevel: 13,
    planCode: 'MAT03-02',
    officialUrl: 'https://www.udir.no/lk20/mat03-02',
    competenceGoals: [
      'Rekker, rekursive sammenhenger og programmering',
      'Integrasjon, analysens fundamentalteorem og numeriske metoder',
      'Derivasjon og integrasjon i funksjonsanalyse og modellering',
      'Parameterframstillinger, fart og akselerasjon',
      'Vektorer i rommet, radianer og trigonometriske funksjoner',
      'Matematiske bevis, formalisering og resonnering',
    ],
  },
  {
    code: '2P-Y',
    label: 'Matematikk 2P-Y · påbygg',
    gradeLevel: 13,
    planCode: 'MAT06-04',
    officialUrl: 'https://www.udir.no/lk20/mat06-04',
    competenceGoals: [
      'Praktisk modellering, problemløsing og matematisk kommunikasjon',
      'Prosent, økonomi og sammensatte måleenheter',
      'Statistikk, sannsynlighet og kritisk vurdering av data',
      'Funksjoner, regneark og digitale verktøy',
    ],
  },
] as const;

export const CURRICULUM_STAGES: readonly CurriculumStage[] = [
  ...Array.from({ length: 10 }, (_, index) => ({
    value: index + 1,
    label: `${index + 1}. trinn`,
    description: 'Matematikk 1.–10. trinn',
    courseCodes: ['MAT01-06'],
  })),
  {
    value: 11,
    label: 'VG1',
    description: 'Velg matematikkfag',
    courseCodes: ['1P', '1T', '1P-Y'],
  },
  {
    value: 12,
    label: 'VG2',
    description: 'Velg matematikkfag',
    courseCodes: ['2P', 'S1', 'R1'],
  },
  {
    value: 13,
    label: 'VG3',
    description: 'Velg matematikkfag',
    courseCodes: ['S2', 'R2', '2P-Y'],
  },
] as const;

export const CURRICULUM_COURSE_CODES = new Set(CURRICULUM_TRACKS.map((track) => track.code));

export function getCurriculumTrack(courseCode: string | null | undefined) {
  return CURRICULUM_TRACKS.find((track) => track.code === courseCode) ?? null;
}

export function curriculumForGrade(gradeLevel: number | null | undefined) {
  if (gradeLevel === null || gradeLevel === undefined) return getCurriculumTrack('MAT01-06');
  return gradeLevel >= 11 ? null : getCurriculumTrack('MAT01-06');
}

export function normalizeCurriculumSelection(gradeLevel: number, courseCode?: string | null) {
  if (gradeLevel < 1 || gradeLevel > 13) return null;
  if (gradeLevel <= 10) return getCurriculumTrack('MAT01-06');
  const track = getCurriculumTrack(courseCode);
  return track?.gradeLevel === gradeLevel ? track : null;
}

export function gradeLabel(gradeLevel: number | null | undefined) {
  if (!gradeLevel) return 'Trinn ikke valgt';
  return gradeLevel >= 11 ? `VG${gradeLevel - 10}` : `${gradeLevel}. trinn`;
}

export function studyLevelLabel(gradeLevel: number | null | undefined, courseCode?: string | null) {
  const track = getCurriculumTrack(courseCode);
  if (gradeLevel && gradeLevel >= 11) {
    return track ? `${gradeLabel(gradeLevel)} · ${track.code}` : gradeLabel(gradeLevel);
  }
  return gradeLabel(gradeLevel);
}
