import { createHash } from 'node:crypto';

import { unstable_cache } from 'next/cache';
import { redirect } from 'next/navigation';

import MattisApp, { type HomeScreenData } from '../components/mattis-app';
import {
  TUTOR_REQUEST_SCHEMA_VERSION,
  type LearnerProfileContext,
} from '../../lib/ai/contracts';
import { generateTutorTurn } from '../../lib/ai/provider';
import { generateSessionPlan } from '../../lib/ai/session-plan';
import { getBillingAccount, toClientBillingStatus } from '../../lib/billing';
import {
  buildSessionPlan,
  CONCEPT_TITLES_NB,
  type SessionPlanTimelineItem,
} from '../../lib/planning/session-plan';
import { getAuthenticatedTutorData } from '../../lib/request-auth';
import {
  ageBandForGrade,
  parentTogetherRequired,
} from '../../lib/learner-profile';
import {
  cleanStoredNextTopic,
  learnerProfileContext,
} from '../../lib/learner-context';

const ACTIVE_STATUSES = new Set([
  'planned',
  'capturing',
  'parsing',
  'active',
  'reviewing',
]);

function minutesWorked(session: {
  duration_minutes: number;
  started_at: string | null;
  ended_at: string | null;
}) {
  if (!session.started_at) return 0;
  const started = Date.parse(session.started_at);
  if (!Number.isFinite(started)) return 0;
  const ended = session.ended_at ? Date.parse(session.ended_at) : Date.now();
  if (!Number.isFinite(ended)) return 0;
  const elapsed = Math.max(0, (ended - started) / 60_000);
  return Math.min(session.duration_minutes, Math.max(0, Math.round(elapsed)));
}

function isThisWeek(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - day + 1);
  return date >= monday;
}

function fallbackConceptTitle(value: string) {
  return (
    value
      .split('.')
      .at(-1)
      ?.replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? value
  );
}

async function generateHomeOpening(input: {
  gradeLevel: number | null;
  courseCode: string | null;
  mastery: Array<{
    conceptKey: string;
    estimate: number;
    confidence: number;
    evidenceCount: number;
  }>;
  previousTopics: string[];
  recentSummaries: string[];
  previousLearningNotes: string[];
  focusTopics: string[];
  isFirstSession: boolean;
  learnerProfile: LearnerProfileContext;
}) {
  try {
    const result = await generateTutorTurn({
      schemaVersion: TUTOR_REQUEST_SCHEMA_VERSION,
      message: [
        'Skriv den første meldingen til dagens matteøkt.',
        'Tenk som en god privatlærer: varm, rolig, personlig og konkret. Skriv som om du kjenner eleven, men bruk bare den konteksten som faktisk passer.',
        'Velg selv hva som er mest naturlig å åpne med. Du kan nevne ett mulig startpunkt, spørre om lekser, følge opp et tema fra sist eller bare invitere eleven inn i økten. Du trenger ikke bruke all kontekst.',
        input.isFirstSession
          ? 'Skriv inkluderende til eleven og en foresatt med «dere» når dere snakker om oppstarten. Ikke omtal Mattis i tredjeperson.'
          : 'Skriv direkte til eleven med «jeg» og «vi». Ikke omtal Mattis i tredjeperson.',
        'Skriv vanligvis 1–3 korte setninger. Ikke bruk punktlister, tidsangivelser, planoppsummering, interne begrunnelser, standardspråk eller spørsmål om å godkjenne en plan. Ikke gjengi læringsdata som en rapport. Avslutt med ett enkelt spørsmål eller en åpen invitasjon når det faller naturlig.',
        input.isFirstSession
          ? 'Dette er første gang dere bruker Mattis. Start varmt og inkluderende, og legg opp til en kort bli-kjent-samtale der en foresatt gjerne kan være med. Ikke be om et langt fritekstsvar i første melding; en strukturert tabell med temaer og trygghetsnivå kommer under meldingen. Finn også ut etter hvert hvordan dere liker å jobbe og hvor ofte det passer, men ikke gjør første melding til et spørreskjema. Ikke gi konkrete matteoppgaver i denne meldingen.'
          : 'Dette er en elev som allerede har brukt Mattis. Bruk tidligere øktminne naturlig, og ikke gjør starten til et spørreskjema.',
        `Foreslått fokus: ${input.focusTopics.join(', ') || 'finn et godt utgangspunkt sammen'}.`,
        `Eksplisitte elevpreferanser: ${input.learnerProfile.focusConceptKeys.join(', ') || 'ingen fokusområder'}, ${input.learnerProfile.learningStyle ?? 'arbeidsmåte ikke oppgitt'}, ${input.learnerProfile.preferredSessionMinutes ?? 'øktlengde ikke oppgitt'} minutter, mål ${input.learnerProfile.goal ?? 'ikke oppgitt'}, arbeidsform ${input.learnerProfile.workMode ?? 'ikke oppgitt'}.`,
        `Læringsnotater fra tidligere økter (bruk bare hvis det passer naturlig, ikke som en logg): ${input.previousLearningNotes.join(' · ') || 'ingen'}.`,
      ].join(' '),
      history: [],
      locale: 'nb-NO',
      learnerContext: {
        gradeLevel: input.gradeLevel,
        courseCode: input.courseCode,
        mastery: input.mastery,
        learnerProfile: input.learnerProfile,
        sessionMemory: {
          previousTopics: input.previousTopics,
          recentSummaries: input.recentSummaries,
          currentPlanFocusConcepts: input.focusTopics,
          previousLearningNotes: input.previousLearningNotes,
          isFirstSession: input.isFirstSession,
        },
      },
    });
    const opening = result.response.assistantMessageNb.trim();
    if (
      opening.length < 30 ||
      opening.length > 480 ||
      /\bMattis\b/i.test(opening) ||
      /(?:svaralternativ|knapp(?:ene)?|velg mellom)/i.test(opening)
    ) {
      return null;
    }
    return opening;
  } catch {
    return null;
  }
}

type HomeAiSuggestionInput = {
  planInput: Parameters<typeof generateSessionPlan>[0];
  openingInput: Omit<Parameters<typeof generateHomeOpening>[0], 'focusTopics'>;
  fallbackPlan: ReturnType<typeof buildSessionPlan>;
};

type HomeAiSuggestion = {
  aiPlan: Awaited<ReturnType<typeof generateSessionPlan>>;
  aiOpeningNb: string | null;
};

async function getCachedHomeAiSuggestion(
  userId: string,
  learnerId: string,
  fingerprint: string,
  input: HomeAiSuggestionInput,
): Promise<HomeAiSuggestion> {
  const loadSuggestion = unstable_cache(
    async () => {
      const aiPlan = await generateSessionPlan(input.planInput);
      if (!aiPlan) return { aiPlan: null, aiOpeningNb: null };

      const aiOpeningNb = input.openingInput.isFirstSession
        ? null
        : await generateHomeOpening({
            ...input.openingInput,
            focusTopics: aiPlan.focusConcepts.map(
              (concept) => CONCEPT_TITLES_NB[concept],
            ),
          });
      return { aiPlan, aiOpeningNb };
    },
    ['mattis-home-ai-suggestion-v2', userId, learnerId, fingerprint],
    { revalidate: 60 * 60 },
  );
  return loadSuggestion();
}

export default async function HomePage() {
  let authenticated;
  try {
    authenticated = await getAuthenticatedTutorData();
  } catch {
    redirect('/');
  }
  const { data, accessToken, user } = authenticated;

  const [profile, sessions, mastery, billingAccount, schedules] =
    await Promise.all([
      data.getProfile(),
      data.listSessions(20),
      data.listMastery(100),
      getBillingAccount(accessToken, user.id),
      data.listSchedules(1).catch(() => []),
    ]);
  const previousLearningNotes = data.listLearningSignals
    ? (
        await Promise.all(
          sessions
            .filter((session) => session.status === 'completed')
            .slice(0, 3)
            .map((session) =>
              data.listLearningSignals!(session.id, 20).catch(() => []),
            ),
        )
      )
        .flatMap((signals) =>
          signals.map((signal) => signal.note_nb?.trim() ?? ''),
        )
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const sessionCandidates = [
    ...sessions
      .filter((session) => ACTIVE_STATUSES.has(session.status))
      .slice(0, 1),
    ...sessions.filter((session) => session.status === 'completed').slice(0, 5),
  ];
  const taskEntries = await Promise.all(
    sessionCandidates.map(async (session) => {
      try {
        return [session.id, await data.listTasks(session.id, 100)] as const;
      } catch {
        return [session.id, []] as const;
      }
    }),
  );
  const taskCounts = new Map(
    taskEntries.map(([id, tasks]) => [
      id,
      {
        completedTasks: tasks.filter((task) => task.status === 'completed')
          .length,
        totalTasks: tasks.length,
      },
    ]),
  );

  const weakest = mastery.find(
    (item) => item.evidence_count > 0 && item.estimate < 0.72,
  );
  const recommendation = weakest
    ? {
        title:
          CONCEPT_TITLES_NB[
            weakest.concept_key as keyof typeof CONCEPT_TITLES_NB
          ] ?? fallbackConceptTitle(weakest.concept_key),
        conceptKey: weakest.concept_key,
        estimate: weakest.estimate,
        lastPracticedAt: weakest.last_practiced_at,
      }
    : null;

  const previousNextTopicNb =
    sessions
      .find(
        (session) =>
          session.status === 'completed' && session.next_topic_nb?.trim(),
      )
      ?.next_topic_nb?.trim() ?? null;
  const previousNextTopic = cleanStoredNextTopic(previousNextTopicNb);
  // A new learner profile skips the old identity onboarding form, but its first
  // real session should still be a short get-to-know-you conversation. The
  // presence of a completed session is the reliable signal here; profile
  // onboarding status only describes setup fields, not whether Mattis has met
  // the learner yet.
  const isFirstSession = !sessions.some(
    (session) => session.status === 'completed',
  );
  const preferredDurationMinutes = profile?.preferred_session_minutes ?? 45;
  const firstSessionMinutes = 10;
  const introMinutes = isFirstSession ? firstSessionMinutes : 0;
  const teachingMinutes = isFirstSession
    ? 0
    : Math.max(10, preferredDurationMinutes);
  const learnerProfile: LearnerProfileContext = profile
    ? learnerProfileContext(profile)
    : {
        status: 'not_started',
        ageBand: ageBandForGrade(null),
        parentTogetherRequired: parentTogetherRequired(null),
        preferredSessionMinutes: null,
        preferredWeeklySessions: null,
        learningStyle: null,
        strengthConceptKeys: [],
        focusConceptKeys: [],
      };
  const fallbackPlan = buildSessionPlan({
    durationMinutes: Math.max(10, teachingMinutes || introMinutes),
    homeworkTasks: [],
    mastery,
    nextTopicNb: previousNextTopic,
  });
  const relevantMastery = mastery
    .filter((item) => item.evidence_count > 0)
    .sort((left, right) => left.estimate - right.estimate)
    .slice(0, 6)
    .map((item) => ({
      conceptKey: item.concept_key,
      estimate: item.estimate,
      confidence: item.confidence,
      evidenceCount: item.evidence_count,
    }));
  const previousTopics = sessions
    .filter(
      (session) =>
        session.status === 'completed' && session.next_topic_nb?.trim(),
    )
    .map((session) => cleanStoredNextTopic(session.next_topic_nb))
    .filter((topic): topic is string => Boolean(topic))
    .slice(0, 3);
  const recentSummaries = sessions
    .filter(
      (session) => session.status === 'completed' && session.summary_nb?.trim(),
    )
    .map((session) => session.summary_nb!.trim())
    .slice(0, 3);
  const hasActiveSession = sessions.some((session) =>
    ACTIVE_STATUSES.has(session.status),
  );
  const suggestionFingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        profileId: profile?.id ?? null,
        profileUpdatedAt: profile?.updated_at ?? null,
        preferredDurationMinutes,
        isFirstSession,
        relevantMastery,
        previousNextTopic,
        previousTopics,
        recentSummaries,
        previousLearningNotes,
      }),
    )
    .digest('hex');
  const cachedHomeAi =
    hasActiveSession || isFirstSession
      ? { aiPlan: null, aiOpeningNb: null }
      : await getCachedHomeAiSuggestion(
          user.id,
          profile?.id ?? 'no-profile',
          suggestionFingerprint,
          {
            fallbackPlan,
            planInput: {
              durationMinutes: teachingMinutes,
              gradeLevel: profile?.grade_level ?? null,
              courseCode: profile?.course_code ?? null,
              mastery: relevantMastery,
              previousNextTopic,
              previousTopics,
              recentSummaries,
              previousLearningNotes,
              hasHomework: false,
              learnerProfile,
            },
            openingInput: {
              gradeLevel: profile?.grade_level ?? null,
              courseCode: profile?.course_code ?? null,
              mastery: relevantMastery,
              previousTopics,
              recentSummaries,
              isFirstSession,
              learnerProfile,
              previousLearningNotes,
            },
          },
        );
  const draftPlan = isFirstSession
    ? {
        reasonNb: 'Vi starter med en kort bli-kjent-samtale.',
        focusConcepts: [],
        timeline: [],
      }
    : (cachedHomeAi.aiPlan ?? fallbackPlan);
  const focusConcept = draftPlan.focusConcepts[0] ?? null;
  const focusTitle = focusConcept
    ? CONCEPT_TITLES_NB[focusConcept]
    : previousNextTopic;
  const reasonNb = draftPlan.reasonNb;
  const homeworkMinutes = draftPlan.timeline
    .filter((item) => item.phase === 'homework')
    .reduce((total, item) => total + item.minutes, 0);
  const repetitionMinutes = draftPlan.timeline
    .filter((item) => item.phase === 'repetition')
    .reduce((total, item) => total + item.minutes, 0);
  const summaryMinutes = draftPlan.timeline
    .filter((item) => item.phase === 'summary')
    .reduce((total, item) => total + item.minutes, 0);
  const timeline = [
    ...(introMinutes
      ? [
          {
            id: 'getting-to-know',
            label: 'Bli litt kjent',
            phase: 'intro' as const,
            segmentType: 'intro' as const,
            minutes: introMinutes,
          },
        ]
      : []),
    ...draftPlan.timeline,
  ] as SessionPlanTimelineItem[];
  const aiOpeningNb = cachedHomeAi.aiOpeningNb;
  const openingNb =
    aiOpeningNb ??
    (isFirstSession
      ? 'Hei! Så hyggelig at du vil bli bedre i matte sammen med meg! Før vi starter en ordentlig økt, vil jeg gjerne bli litt bedre kjent med deg. Hva er målet ditt i matte?'
      : focusTitle
        ? `Hei! Jeg tenker vi kan begynne med ${focusTitle.toLowerCase()} i dag. Har du en lekse eller oppgave du vil starte med, eller skal vi finne noe sammen?`
        : previousNextTopic
          ? `Hei! Skal vi bygge litt videre på ${previousNextTopic} i dag? Har du en oppgave eller noe annet du vil begynne med?`
          : 'Hei! Klar for litt matte? Har du en lekse eller et tema du vil starte med, eller skal jeg foreslå noe?');
  const suggestion = {
    openingNb,
    durationMinutes: isFirstSession
      ? firstSessionMinutes
      : preferredDurationMinutes,
    focusTopic: focusTitle,
    focusConcepts: draftPlan.focusConcepts,
    homeworkMinutes,
    repetitionMinutes,
    summaryMinutes,
    introMinutes,
    timeline,
    reasonNb,
    previousNextTopicNb: previousNextTopic,
  };

  const liveSession = sessions.find(
    (session) =>
      ACTIVE_STATUSES.has(session.status) && session.status !== 'planned',
  );
  const plannedSession = sessions
    .filter((session) => session.status === 'planned' && session.planned_at)
    .sort(
      (left, right) =>
        Date.parse(left.planned_at ?? '') - Date.parse(right.planned_at ?? ''),
    )[0];
  const activeSession = liveSession ?? plannedSession ?? null;
  const currentTime = new Date().getTime();
  const nextPlannedSession = sessions
    .filter(
      (session) =>
        session.status === 'planned' &&
        session.planned_at &&
        Date.parse(session.planned_at) > currentTime,
    )
    .sort(
      (left, right) =>
        Date.parse(left.planned_at ?? '') - Date.parse(right.planned_at ?? ''),
    )[0];
  const nextSchedule = schedules.find(
    (schedule) =>
      schedule.enabled && Date.parse(schedule.starts_at) > currentTime,
  );
  const nextSession = nextPlannedSession?.planned_at
    ? {
        plannedAt: nextPlannedSession.planned_at,
        durationMinutes: nextPlannedSession.duration_minutes,
      }
    : nextSchedule
      ? {
          plannedAt: nextSchedule.starts_at,
          durationMinutes: nextSchedule.duration_minutes,
        }
      : null;
  const recentSessions = sessions
    .filter((session) => session.status === 'completed')
    .slice(0, 5)
    .map((session) => ({
      id: session.id,
      status: session.status,
      currentPhase: session.current_phase,
      durationMinutes: session.duration_minutes,
      plannedAt: session.planned_at,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      summary: session.summary_nb,
      completedTasks: taskCounts.get(session.id)?.completedTasks ?? 0,
      totalTasks: taskCounts.get(session.id)?.totalTasks ?? 0,
    }));

  const activeHomeSession = activeSession
    ? {
        id: activeSession.id,
        status: activeSession.status,
        currentPhase: activeSession.current_phase,
        durationMinutes: activeSession.duration_minutes,
        plannedAt: activeSession.planned_at,
        startedAt: activeSession.started_at,
        endedAt: activeSession.ended_at,
        summary: activeSession.summary_nb,
        completedTasks: taskCounts.get(activeSession.id)?.completedTasks ?? 0,
        totalTasks: taskCounts.get(activeSession.id)?.totalTasks ?? 0,
      }
    : null;

  const minutesThisWeek = sessions
    .filter(
      (session) =>
        isThisWeek(session.started_at) && session.status !== 'cancelled',
    )
    .reduce((total, session) => total + minutesWorked(session), 0);

  const homeData: HomeScreenData = {
    displayName: profile?.display_name?.trim() || 'Nora',
    isFirstSession,
    gradeLevel: profile?.grade_level ?? null,
    parentTogetherRequired: parentTogetherRequired(profile?.grade_level),
    weeklyGoalMinutes: profile?.weekly_goal_minutes ?? 120,
    minutesThisWeek,
    activeSession: activeHomeSession,
    nextSession,
    recommendation,
    suggestion,
    recentSessions,
    billing: toClientBillingStatus(billingAccount),
  };

  return <MattisApp screen="home" initialHome={homeData} />;
}
