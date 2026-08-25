import { redirect } from 'next/navigation';

import MattisApp, { type HomeScreenData } from '../components/mattis-app';
import { TUTOR_REQUEST_SCHEMA_VERSION, type LearnerProfileContext } from '../../lib/ai/contracts';
import { generateTutorTurn } from '../../lib/ai/provider';
import { generateSessionPlan } from '../../lib/ai/session-plan';
import {
  buildSessionPlan,
  CONCEPT_TITLES_NB,
  type SessionPlanTimelineItem,
} from '../../lib/planning/session-plan';
import { getAuthenticatedTutorData } from '../../lib/request-auth';

const ACTIVE_STATUSES = new Set(['planned', 'capturing', 'parsing', 'active', 'reviewing']);

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

function cleanNextTopic(value: string | null) {
  if (!value) return null;

  const cleaned = value
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(
      /^(?:vi skal|vi bør|vi må|jeg skal|jeg bør|jeg må)\s+(?:jobbe|øve|se|repetere)\s+(?:litt\s+)?(?:med|på)\s+/i,
      '',
    )
    .replace(/^(?:jobbe|øve|se|repetere)\s+(?:litt\s+)?(?:med|på)\s+/i, '')
    .replace(/\s+(?:i dag|til neste gang|neste gang)$/i, '')
    .trim();

  return cleaned || value.trim();
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
  focusTopics: string[];
  reasonNb: string;
  isFirstSession: boolean;
  learnerProfile: LearnerProfileContext;
}) {
  try {
    const result = await generateTutorTurn({
      schemaVersion: TUTOR_REQUEST_SCHEMA_VERSION,
      message: [
        'Skriv den første meldingen til dagens matteøkt.',
        'Meldingen skal være personlig, varm og konkret – som en privatlærer som faktisk husker eleven.',
        'Foreslå en realistisk økt ut fra planen, svake områder og tidligere øktminne.',
        'Nevn lekser på en naturlig måte hvis eleven kan ha det, men ikke få det til å høres ut som et standardskjema.',
        'Bruk elevens eksplisitte ønsker hvis de finnes. Hvis bli-kjent-profilen ikke er ferdig, still bare ett naturlig oppfølgingsspørsmål når det passer.',
        'Hvis det finnes et tema fra sist, spør gjerne hvordan det har gått med akkurat det.',
        'Skriv direkte til eleven med «jeg» og «vi». Ikke omtal Mattis i tredjeperson.',
        'Skriv 1–3 korte setninger. Eleven skal kunne svare fritt i tekstfeltet etterpå; ikke lag svaralternativer eller knapper.',
        input.isFirstSession
          ? 'Dette er første gang eleven bruker Mattis. Start en kort, varm bli-kjent-samtale før dere lager oppgaver. Spør naturlig om hva som føles trygt eller vanskelig i matematikk, hva eleven har lyst til å bli bedre på, og gjerne hvordan eleven liker å jobbe. Finn også ut etter hvert hvor ofte og hvor lenge eleven helst vil jobbe, men ikke gjør første melding til et spørreskjema. Ikke gi konkrete matteoppgaver i denne meldingen.'
          : 'Dette er en elev som allerede har brukt Mattis. Bruk tidligere øktminne naturlig, og ikke gjør starten til et spørreskjema.',
        `Foreslått fokus: ${input.focusTopics.join(', ') || 'finn et godt utgangspunkt sammen'}.`,
        `Planens begrunnelse: ${input.reasonNb}`,
        `Eksplisitte elevpreferanser: ${input.learnerProfile.focusConceptKeys.join(', ') || 'ingen fokusområder'}, ${input.learnerProfile.learningStyle ?? 'arbeidsmåte ikke oppgitt'}, ${input.learnerProfile.preferredSessionMinutes ?? 'øktlengde ikke oppgitt'} minutter.`,
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
          currentPlanReason: input.reasonNb,
          currentPlanFocusConcepts: input.focusTopics,
          isFirstSession: input.isFirstSession,
        },
      },
    });
    const opening = result.response.assistantMessageNb.trim();
    if (
      opening.length < 30 ||
      opening.length > 650 ||
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

export default async function HomePage() {
  let data;
  try {
    ({ data } = await getAuthenticatedTutorData());
  } catch {
    redirect('/');
  }

  const [profile, sessions, mastery] = await Promise.all([
    data.getProfile(),
    data.listSessions(20),
    data.listMastery(100),
  ]);

  const sessionCandidates = [
    ...sessions.filter((session) => ACTIVE_STATUSES.has(session.status)).slice(0, 1),
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
        completedTasks: tasks.filter((task) => task.status === 'completed').length,
        totalTasks: tasks.length,
      },
    ]),
  );

  const weakest = mastery.find((item) => item.evidence_count > 0 && item.estimate < 0.72);
  const recommendation = weakest
    ? {
        title:
          CONCEPT_TITLES_NB[weakest.concept_key as keyof typeof CONCEPT_TITLES_NB] ??
          fallbackConceptTitle(weakest.concept_key),
        conceptKey: weakest.concept_key,
        estimate: weakest.estimate,
        lastPracticedAt: weakest.last_practiced_at,
      }
    : null;

  const previousNextTopicNb =
    sessions
      .find((session) => session.status === 'completed' && session.next_topic_nb?.trim())
      ?.next_topic_nb?.trim() ?? null;
  const previousNextTopic = cleanNextTopic(previousNextTopicNb);
  // A new learner profile skips the old identity onboarding form, but its first
  // real session should still be a short get-to-know-you conversation. The
  // presence of a completed session is the reliable signal here; profile
  // onboarding status only describes setup fields, not whether Mattis has met
  // the learner yet.
  const isFirstSession = !sessions.some((session) => session.status === 'completed');
  const preferredDurationMinutes = profile?.preferred_session_minutes ?? 45;
  const learnerProfileStatus: 'not_started' | 'in_progress' | 'complete' =
    profile?.learner_profile_status === 'complete'
      ? 'complete'
      : profile?.learner_profile_status === 'in_progress'
        ? 'in_progress'
        : 'not_started';
  const learnerProfileStyle =
    profile?.learning_style === 'step_by_step' ||
    profile?.learning_style === 'examples_first' ||
    profile?.learning_style === 'independent' ||
    profile?.learning_style === 'mixed'
      ? profile.learning_style
      : null;
  const learnerProfile: LearnerProfileContext = {
    status: learnerProfileStatus,
    preferredSessionMinutes: profile?.preferred_session_minutes ?? null,
    preferredWeeklySessions: profile?.preferred_weekly_sessions ?? null,
    learningStyle: learnerProfileStyle,
    strengthConceptKeys: profile?.strength_concept_keys ?? [],
    focusConceptKeys: profile?.focus_concept_keys ?? [],
  };
  const fallbackPlan = buildSessionPlan({
    durationMinutes: preferredDurationMinutes,
    homeworkTasks: [],
    mastery,
    nextTopicNb: previousNextTopicNb,
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
    .filter((session) => session.status === 'completed' && session.next_topic_nb?.trim())
    .map((session) => session.next_topic_nb!.trim())
    .slice(0, 3);
  const recentSummaries = sessions
    .filter((session) => session.status === 'completed' && session.summary_nb?.trim())
    .map((session) => session.summary_nb!.trim())
    .slice(0, 3);
  const aiPlan = await generateSessionPlan({
    durationMinutes: preferredDurationMinutes,
    gradeLevel: profile?.grade_level ?? null,
    courseCode: profile?.course_code ?? null,
    mastery: relevantMastery,
    previousNextTopic,
    previousTopics,
    recentSummaries,
    hasHomework: false,
    learnerProfile,
  });
  const draftPlan = aiPlan ?? fallbackPlan;
  const focusConcept = draftPlan.focusConcepts[0] ?? null;
  const focusTitle = focusConcept ? CONCEPT_TITLES_NB[focusConcept] : previousNextTopic;
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
  const aiOpeningNb = await generateHomeOpening({
    gradeLevel: profile?.grade_level ?? null,
    courseCode: profile?.course_code ?? null,
    mastery: relevantMastery,
    previousTopics,
    recentSummaries,
    focusTopics: draftPlan.focusConcepts.map((concept) => CONCEPT_TITLES_NB[concept]),
    reasonNb,
    isFirstSession,
    learnerProfile,
  });
  const openingNb =
    aiOpeningNb ??
    (isFirstSession
      ? 'Før vi begynner med matte vil jeg gjerne bli litt kjent med deg. Hva føler du deg mest trygg på, og hva har du lyst til å bli bedre på?'
      : focusTitle
        ? previousNextTopic
          ? `Jeg foreslår at vi ser på litt lekser hvis du har det, og så tar vi utgangspunkt i ${focusTitle} i dag. Hvordan har det gått med det siden sist?`
          : `Jeg foreslår at vi ser på litt lekser hvis du har det, og så jobber vi litt med ${focusTitle} i dag.`
        : 'Jeg foreslår at vi ser på litt lekser hvis du har det, og så finner vi et tema som passer i dag.');
  const suggestion = {
    openingNb,
    focusTopic: focusTitle,
    focusConcepts: draftPlan.focusConcepts,
    homeworkMinutes,
    repetitionMinutes,
    summaryMinutes,
    timeline: draftPlan.timeline as SessionPlanTimelineItem[],
    reasonNb,
    previousNextTopicNb,
  };

  const activeSession = sessions.find((session) => ACTIVE_STATUSES.has(session.status)) ?? null;
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
    .filter((session) => isThisWeek(session.started_at) && session.status !== 'cancelled')
    .reduce((total, session) => total + minutesWorked(session), 0);

  const homeData: HomeScreenData = {
    displayName: profile?.display_name?.trim() || 'Nora',
    gradeLevel: profile?.grade_level ?? null,
    weeklyGoalMinutes: profile?.weekly_goal_minutes ?? 120,
    minutesThisWeek,
    activeSession: activeHomeSession,
    recommendation,
    suggestion,
    recentSessions,
  };

  return <MattisApp screen="home" initialHome={homeData} />;
}
