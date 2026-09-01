'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { fetchWithSessionRefresh } from '../../lib/authenticated-fetch';
import type { ClientBillingStatus } from '../../lib/billing';
import { requestPwaReminder } from '../../lib/pwa-reminders';
import {
  CURRICULUM_STAGES,
  getCurriculumTrack,
  studyLevelLabel,
} from '../../lib/curriculum/catalog';
import {
  ageBandForGrade,
  ageBandLabel,
  parentTogetherRequired,
  type LearnerAgeBand,
} from '../../lib/learner-profile';
import type { ProgressOverview } from '../../lib/progress';
import MathText from './math-text';
import SignOutButton from './sign-out-button';

const MAX_HOMEWORK_IMAGES = 10;

type ApiResult = {
  error?: string;
  destination?: string;
  authenticated?: boolean;
  learner?: { id: string };
  paymentUrl?: string | null;
  pendingLearnerId?: string;
};

type TutorApiResult = {
  reply?: string;
  error?: string;
  safetyFlags?: string[];
  safetyLevel?: 'support' | 'urgent';
  safetyCode?: string;
  safetyEventId?: string;
  safetyParentPolicy?: string;
  safetyChildConsentRequired?: boolean;
  safetyTrustedAdultOnly?: boolean;
  taskState?:
    | 'in_progress'
    | 'awaiting_answer'
    | 'checking'
    | 'ready_to_complete'
    | 'completed'
    | 'needs_human_review';
  expectedStudentAction?: string;
  suggestedActions?: string[];
  sessionProgress?: {
    activeSegmentId?: string;
    activePhase?: string;
    activeSegment?: string;
    nextSegment?: string | null;
    remainingMinutes?: number;
    transitionDue?: boolean;
    isFinished?: boolean;
  };
};

type TaskSetOfferReason = 'no_homework' | 'more_practice';

type TaskSetSuggestion = {
  topic: string;
  label: string;
};

type SessionOpeningMode =
  'suggested' | 'homework' | 'custom' | 'getting_to_know' | 'scheduled';

type TaskSetApiResult = {
  error?: string;
  title?: string;
  message?: string;
  tasks?: Array<{
    id: string;
    text: string;
    label: string | null;
    phase: 'homework' | 'repetition';
    status: string;
    taskType: string;
    conceptKeys: string[];
  }>;
};

type SessionApiResult = {
  id?: string;
  error?: string;
};

type ChatMessage = {
  id: string;
  role: 'tutor' | 'student';
  text: string;
  clientMessageId?: string | null;
  createdAt?: string;
  status?: 'sent' | 'sending' | 'failed';
  hasAttachment?: boolean;
  kind?: 'session_opening';
};

type SetupStep =
  'duration' | 'homework' | 'photos' | 'parsing' | 'review' | 'active';
export type IntakeStep =
  | 'goal'
  | 'confidence'
  | 'learning_style'
  | 'work_mode'
  | 'frequency'
  | 'duration'
  | 'schedule_mode'
  | 'schedule'
  | 'school'
  | 'homework'
  | 'done';
type IntroStep = IntakeStep;

type IntroConfidenceLevel = 'uncertain' | 'somewhat' | 'confident';

const INTRO_CONFIDENCE_LEVELS: Array<{
  key: IntroConfidenceLevel;
  label: string;
}> = [
  { key: 'uncertain', label: 'Usikker' },
  { key: 'somewhat', label: 'Litt trygg' },
  { key: 'confident', label: 'Trygg' },
];

const INTRO_CONFIDENCE_TOPICS = {
  primary: [
    { key: 'numbers', label: 'Tall og telling' },
    { key: 'arithmetic', label: 'Pluss, minus og ganging' },
    { key: 'geometry', label: 'Former og måling' },
    { key: 'time_money', label: 'Klokke og penger' },
  ],
  middle: [
    { key: 'numbers', label: 'Tall, brøk og desimaltall' },
    { key: 'arithmetic', label: 'Regnearter og regnestrategier' },
    { key: 'geometry', label: 'Geometri og måling' },
    { key: 'percent', label: 'Prosent og økonomi' },
    { key: 'patterns', label: 'Mønstre og problemløsing' },
  ],
  lower_secondary: [
    { key: 'numbers', label: 'Tall og prosent' },
    { key: 'algebra', label: 'Algebra og likninger' },
    { key: 'functions', label: 'Funksjoner' },
    { key: 'geometry', label: 'Geometri' },
    { key: 'data', label: 'Statistikk og sannsynlighet' },
  ],
  upper_secondary: [
    { key: 'algebra', label: 'Algebra og likninger' },
    { key: 'functions', label: 'Funksjoner' },
    { key: 'geometry', label: 'Geometri og trigonometri' },
    { key: 'data', label: 'Statistikk og sannsynlighet' },
    { key: 'modeling', label: 'Modellering og økonomi' },
  ],
} as const;

type IntroConfidenceTopicKey =
  (typeof INTRO_CONFIDENCE_TOPICS)[keyof typeof INTRO_CONFIDENCE_TOPICS][number]['key'];

function introConfidenceTopics(gradeLevel: number | null) {
  if (!gradeLevel || gradeLevel <= 4) return INTRO_CONFIDENCE_TOPICS.primary;
  if (gradeLevel <= 7) return INTRO_CONFIDENCE_TOPICS.middle;
  if (gradeLevel <= 10) return INTRO_CONFIDENCE_TOPICS.lower_secondary;
  return INTRO_CONFIDENCE_TOPICS.upper_secondary;
}

export type SessionTaskData = {
  id: string;
  text: string;
  label: string | null;
  phase: 'homework' | 'repetition';
  status: string;
  taskType: string;
  conceptKeys: string[];
};

export type SessionPlanTimelineItem = {
  id: string;
  label: string;
  phase: 'intro' | 'homework' | 'repetition' | 'summary';
  segmentType?:
    'intro' | 'homework' | 'review' | 'new_topic' | 'mixed' | 'summary';
  minutes: number;
  conceptKey?: string;
};

export type SessionPlanData = {
  version?: string;
  reasonNb?: string | null;
  previousNextTopicNb?: string | null;
  focusConcepts?: string[];
  openingNb?: string | null;
  mode?: SessionOpeningMode;
  introMinutes?: number;
  homeworkMinutes?: number;
  repetitionMinutes?: number;
  summaryMinutes?: number;
  planConfirmed?: boolean;
  activeSegmentId?: string | null;
  timeline?: SessionPlanTimelineItem[];
};

export type SessionScreenData = {
  id: string;
  status: string;
  currentPhase: string;
  durationMinutes: number;
  startedAt: string | null;
  endedAt: string | null;
  planSnapshot?: SessionPlanData | null;
  messages: ChatMessage[];
  tasks: SessionTaskData[];
  gradeLevel: number | null;
  ageBand: LearnerAgeBand;
  intakeStep?: IntakeStep;
  intakeData?: Record<string, unknown>;
};

export type ReviewScreenData = {
  tasks: Array<Pick<SessionTaskData, 'id' | 'text' | 'label'>>;
};

export type SummaryScreenData = {
  status: string;
  durationMinutes?: number;
  summary: string | null;
  completedTasks: number;
  totalTasks: number;
};

export type ProgressScreenData = {
  displayName: string;
  overview: ProgressOverview;
};

export type ProfileChooserData = {
  pendingPayment?: boolean;
  learners: Array<{
    id: string;
    displayName: string;
    gradeLevel: number | null;
    courseCode: string | null;
    onboardingComplete: boolean;
  }>;
};

export type OnboardingProfileData = {
  displayName: string;
  gradeLevel: number | null;
  courseCode: string | null;
  identityComplete: boolean;
  ageBand?: LearnerAgeBand;
  parentTogetherConfirmed?: boolean;
  safetyAcknowledged?: boolean;
};

export type BillingScreenData = {
  billing: ClientBillingStatus;
  learnerCount: number;
  checkoutStatus?: 'success' | 'cancelled' | null;
  onboarding?: boolean;
};

function CurriculumDetails({ courseCode }: { courseCode: string }) {
  const track = getCurriculumTrack(courseCode);
  if (!track) return null;

  return (
    <details className="curriculum-details">
      <summary>Se kompetansefokus</summary>
      <p>Læreplan {track.planCode}</p>
      <ul>
        {track.competenceGoals.map((goal) => (
          <li key={goal}>{goal}</li>
        ))}
      </ul>
      <a href={track.officialUrl} rel="noreferrer" target="_blank">
        Åpne læreplanen hos Udir
      </a>
    </details>
  );
}

export type HomeSessionData = {
  id: string;
  status: string;
  currentPhase: string;
  durationMinutes: number;
  plannedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  summary: string | null;
  completedTasks: number;
  totalTasks: number;
};

export type HomeNextSessionData = {
  plannedAt: string;
  durationMinutes: number;
};

export type HomeScreenData = {
  displayName: string;
  isFirstSession: boolean;
  gradeLevel: number | null;
  parentTogetherRequired: boolean;
  weeklyGoalMinutes: number;
  minutesThisWeek: number;
  activeSession: HomeSessionData | null;
  nextSession: HomeNextSessionData | null;
  recommendation: {
    title: string;
    conceptKey: string;
    estimate: number;
    lastPracticedAt: string | null;
  } | null;
  suggestion: {
    openingNb: string;
    durationMinutes: number;
    focusTopic: string | null;
    focusConcepts: string[];
    homeworkMinutes: number;
    repetitionMinutes: number;
    summaryMinutes: number;
    introMinutes: number;
    timeline: SessionPlanTimelineItem[];
    reasonNb: string;
    previousNextTopicNb: string | null;
  } | null;
  recentSessions: HomeSessionData[];
  billing: ClientBillingStatus;
};

function requestsTaskSet(text: string) {
  return (
    /\b(?:lag|lage|få|gi|sett opp|test meg)\b[\s\S]*\b(?:oppgave|oppgaver|oppgavesett|oppgavesamling)\b/i.test(
      text,
    ) ||
    /\b(?:oppgave|oppgaver|oppgavesett|oppgavesamling)\b[\s\S]*\b(?:lag|lage|få|gi)\b/i.test(
      text,
    ) ||
    /\b(?:kan du|jeg vil)\b[\s\S]*\b(?:øve|trene)\b[\s\S]*\b(?:på|med)\b/i.test(
      text,
    )
  );
}

function requestsSessionEnd(text: string) {
  if (/\bikke\b[\s\S]{0,20}\b(?:avslutte|avslutt|stoppe|stop)\b/i.test(text))
    return false;
  return (
    /\b(?:avslutte|avslutt|runde av|stoppe|stop|bli ferdig med)\b[\s\S]{0,40}\b(?:økt|økta|økten|i dag)\b/i.test(
      text,
    ) ||
    /\b(?:økt|økta|økten)\b[\s\S]{0,30}\b(?:avslutte|avslutt|runde av|stoppe|stop)\b/i.test(
      text,
    )
  );
}

function requestsSchedule(text: string) {
  return /\b(?:neste økt|avtale(?: en)? økt|planlegge(?: en)? økt|fast tid|tidspunkt)\b/i.test(
    text,
  );
}

function taskSetTitleFromLabel(label: string | null | undefined) {
  const value = label?.trim();
  if (
    !value ||
    /^(?:oppgave|repetisjon)\b/i.test(value) ||
    /^\d+[a-z]?$/i.test(value) ||
    /^ekstra$/i.test(value)
  ) {
    return null;
  }
  return value;
}

function taskDisplayLabel(
  task: Pick<SessionTaskData, 'label'>,
  fallbackIndex: number,
) {
  const label = task.label?.trim();
  if (!label) return `Oppgave ${fallbackIndex + 1}`;
  return /^(oppgave|repetisjon)\b/i.test(label) ? label : `Oppgave ${label}`;
}

async function compressChatImage(file: File) {
  const maxDimension = 1600;
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    if (longestSide <= maxDimension && file.size <= 1_500_000) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, maxDimension / longestSide);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.72),
    );
    return blob
      ? new File([blob], 'utregning.jpg', { type: 'image/jpeg' })
      : file;
  } catch {
    return file;
  }
}

async function readApiResult(response: Response): Promise<ApiResult> {
  return (await response.json().catch(() => ({}))) as ApiResult;
}

type Screen =
  | 'entry'
  | 'profiles'
  | 'onboarding'
  | 'home'
  | 'progress'
  | 'new'
  | 'capture'
  | 'review'
  | 'session'
  | 'summary'
  | 'billing'
  | 'privacy';

const iconFiles = {
  arrow: 'arrow.svg',
  calendar: 'calendar.svg',
  camera: 'camera.svg',
  check: 'check.svg',
  clock: 'clock.svg',
  close: 'close.svg',
  document: 'document.svg',
  help: 'help.svg',
  home: 'home.svg',
  image: 'image.svg',
  paperclip: 'paperclip.svg',
  repeat: 'repeat.svg',
  send: 'send.svg',
  spark: 'spark.svg',
  target: 'target.svg',
  trash: 'trash.svg',
  users: 'users.svg',
} as const;

type IconName = keyof typeof iconFiles;

const Icon = ({ name, size = 22 }: { name: IconName; size?: number }) => (
  <span
    aria-hidden="true"
    className="icon-mask"
    style={
      {
        '--icon-url': `url('/icons/${iconFiles[name]}')`,
        width: size,
        height: size,
      } as CSSProperties
    }
  />
);

function Brand() {
  return (
    <span className="brand-mark" aria-label="Mattis">
      <span className="brand-dot" aria-hidden="true" />
      Mattis
    </span>
  );
}

function TopBar({
  back = false,
  backHref = '/home',
  title,
  timerLabel,
}: {
  back?: boolean;
  backHref?: string;
  title?: string;
  timerLabel?: ReactNode;
}) {
  return (
    <header className="topbar">
      {back ? (
        <Link className="icon-button" href={backHref} aria-label="Tilbake">
          <Icon name="close" size={28} />
        </Link>
      ) : (
        <Brand />
      )}
      {title ? <h1 className="display topbar-title">{title}</h1> : null}
      {back ? (
        <span className="timer">{timerLabel ?? ''}</span>
      ) : (
        <Link
          className="icon-button"
          href="/profiles"
          aria-label="Bytt elevprofil"
        >
          <Icon name="users" />
        </Link>
      )}
    </header>
  );
}

function SessionTimer({
  ended,
  initialSeconds,
  running,
  startedAt,
}: {
  ended: boolean;
  initialSeconds: number;
  running: boolean;
  startedAt: string | null;
}) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (!running || ended) return;
    const updateRemainingTime = () => {
      if (!startedAt) {
        setRemainingSeconds((current) => Math.max(0, current - 1));
        return;
      }
      setRemainingSeconds(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(startedAt) + initialSeconds * 1_000 - Date.now()) /
              1_000,
          ),
        ),
      );
    };
    updateRemainingTime();
    const interval = window.setInterval(() => {
      updateRemainingTime();
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [ended, initialSeconds, running, startedAt]);

  if (ended) return 'Avsluttet';
  return `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')} igjen`;
}

function BottomNav({ active = 'home' }: { active?: string }) {
  return (
    <nav className="bottom-nav" aria-label="Hovednavigasjon">
      <Link className={active === 'home' ? 'active' : ''} href="/home">
        <Icon name="home" />
        <span>Hjem</span>
      </Link>
      <Link className={active === 'plan' ? 'active' : ''} href="/session/new">
        <Icon name="calendar" />
        <span>Plan</span>
      </Link>
      <Link className={active === 'progress' ? 'active' : ''} href="/progress">
        <Icon name="target" />
        <span>Fremgang</span>
      </Link>
    </nav>
  );
}

function formatHomeDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('nb-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatNextSession(value: string | null) {
  if (!value) return 'et tidspunkt som passer';
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function homeSessionStatus(status: string) {
  if (status === 'active') return 'Pågående økt';
  if (status === 'reviewing') return 'Oppgaver klare';
  if (status === 'planned') return 'Neste økt';
  if (status === 'capturing' || status === 'parsing') return 'Gjør økten klar';
  return 'Matteøkt';
}

function homeSessionActionLabel(status: string) {
  if (status === 'active') return 'Fortsett økt';
  if (status === 'reviewing') return 'Se gjennom oppgavene';
  return 'Gjør økten klar';
}

function getTaskSetSuggestion(
  plan: SessionPlanData | null,
): TaskSetSuggestion | null {
  const previousTopic = plan?.previousNextTopicNb?.trim();
  if (previousTopic) {
    return { topic: previousTopic, label: `«${previousTopic}»` };
  }
  const reason = plan?.reasonNb?.trim();
  if (reason) {
    return {
      topic: '',
      label: reason.replace(/^Repetisjonen prioriterer\s*/i, ''),
    };
  }
  return null;
}

function taskSetPromptFor(plan: SessionPlanData | null) {
  const suggestion = getTaskSetSuggestion(plan);
  return suggestion
    ? `Ingen lekser er helt greit. Jeg foreslår at vi tar utgangspunkt i ${suggestion.label} i dag. Vil du at jeg skal lage et kort oppgavesett?`
    : 'Ingen lekser er helt greit. Hva vil du helst øve på akkurat nå? Skriv gjerne ett eller to temaer, så lager jeg et lite oppgavesett.';
}

function HomeScreen({ initialHome }: { initialHome?: HomeScreenData }) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');
  const startKeyRef = useRef<string | null>(null);

  const home = initialHome ?? {
    displayName: 'Nora',
    isFirstSession: false,
    gradeLevel: 10,
    parentTogetherRequired: false,
    weeklyGoalMinutes: 120,
    minutesThisWeek: 0,
    activeSession: null,
    nextSession: null,
    recommendation: null,
    recentSessions: [],
    suggestion: null,
    billing: {
      status: 'inactive',
      hasAccess: false,
      trialEnd: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
  };
  const activeSession = home.activeSession;
  const sessionSuggestion = home.suggestion;
  const recommendation = home.recommendation;
  const weeklyGoal = Math.max(1, home.weeklyGoalMinutes);
  const weeklyProgress = Math.min(
    100,
    Math.round((home.minutesThisWeek / weeklyGoal) * 100),
  );
  const weekday = new Intl.DateTimeFormat('nb-NO', { weekday: 'long' }).format(
    new Date(),
  );
  const gradeLabel = home.gradeLevel ? ` · ${home.gradeLevel}. trinn` : '';

  async function startSession() {
    if (!home.billing.hasAccess) {
      router.push('/billing');
      return;
    }
    setIsStarting(true);
    setError('');
    const idempotencyKey =
      startKeyRef.current ?? (startKeyRef.current = crypto.randomUUID());
    const openingNb =
      sessionSuggestion?.openingNb ??
      'Jeg foreslår at vi ser på litt lekser hvis du har det, og så finner vi et tema som passer i dag.';
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationMinutes: home.isFirstSession
            ? 10
            : (sessionSuggestion?.durationMinutes ?? 45),
          idempotencyKey,
          startImmediately: true,
          openingMessageNb: openingNb,
          planSnapshot: {
            version: 'session-plan.v0.2',
            mode: home.isFirstSession ? 'getting_to_know' : 'suggested',
            openingNb,
            introMinutes: sessionSuggestion?.introMinutes ?? 0,
            reasonNb: sessionSuggestion?.reasonNb ?? null,
            previousNextTopicNb: sessionSuggestion?.previousNextTopicNb ?? null,
            focusConcepts: sessionSuggestion?.focusConcepts ?? [],
            homeworkMinutes: sessionSuggestion?.homeworkMinutes ?? 0,
            repetitionMinutes: sessionSuggestion?.repetitionMinutes ?? 0,
            summaryMinutes: sessionSuggestion?.summaryMinutes ?? 0,
            planConfirmed: false,
            activeSegmentId: sessionSuggestion?.timeline?.[0]?.id ?? null,
            timeline: sessionSuggestion?.timeline ?? [],
          },
        }),
      });
      const result = (await response
        .json()
        .catch(() => ({}))) as SessionApiResult;
      if (!response.ok || !result.id) {
        throw new Error(result.error ?? 'Vi klarte ikke å starte økten.');
      }
      router.push(`/session/${result.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Vi klarte ikke å starte økten.',
      );
      setIsStarting(false);
    }
  }

  async function startPlannedSession() {
    if (!activeSession || activeSession.status !== 'planned') return;
    setIsStarting(true);
    setError('');
    try {
      const response = await fetchWithSessionRefresh(
        `/api/sessions/${activeSession.id}/start`,
        { method: 'POST' },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? 'Økten kunne ikke startes.');
      }
      router.push(`/session/${activeSession.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Økten kunne ikke startes.',
      );
      setIsStarting(false);
    }
  }

  function openSession() {
    if (!activeSession) return;
    if (activeSession.status === 'reviewing') {
      router.push(`/session/${activeSession.id}/review`);
      return;
    }
    router.push(`/session/${activeSession.id}`);
  }

  return (
    <div className="app-shell has-bottom-nav">
      <TopBar />
      <main className="page-wrap app-content home-page">
        <div className="home-hero">
          <section className="welcome">
            <p className="eyebrow">
              {weekday.charAt(0).toUpperCase() + weekday.slice(1)}
              {gradeLabel}
            </p>
            <h1>
              Hei,
              <br />
              {home.displayName}
              <span className="coral-period">.</span>
            </h1>
            <p className="lead">
              {activeSession
                ? 'Mattis husker hvor dere slapp.'
                : 'Klar for litt matte?'}
            </p>
          </section>
          <div className="hero-shape" aria-hidden="true">
            <span className="sun" />
            <svg className="hero-graph" viewBox="0 0 120 120">
              <path d="M10 60h100M60 8v104" />
              <path d="M24 24c7 58 24 73 36 73s29-15 36-73" />
            </svg>
            <span className="flag" />
            <span className="teal-arc" />
            <span className="navy-arc" />
            <span className="dots" />
            <span className="equation">2(x − 3) = 4x + 6</span>
          </div>
        </div>
        <section className="card session-card" aria-labelledby="today-session">
          <div className="session-title">
            <span className="icon-button coral">
              <Icon name="clock" />
            </span>
            <div>
              <strong id="today-session">
                {!activeSession && home.isFirstSession
                  ? 'Bli kjent med Mattis'
                  : activeSession
                    ? activeSession.status === 'active'
                      ? 'Fortsett økten'
                      : activeSession.status === 'reviewing'
                        ? 'Se gjennom oppgavene'
                        : 'Gjør økten klar'
                    : 'Dagens økt'}
              </strong>
              <span className="dot"> · </span>
              <span>
                {home.isFirstSession && !activeSession
                  ? 10
                  : (activeSession?.durationMinutes ?? 45)}{' '}
                min
              </span>
            </div>
          </div>
          {home.billing.hasAccess ? (
            activeSession ? (
              <div className="timeline">
                <div className="timeline-item">
                  <span className="timeline-icon">
                    <Icon name="clock" />
                  </span>
                  <div className="timeline-copy">
                    <strong>{homeSessionStatus(activeSession.status)}</strong>
                    <span>
                      {activeSession.status === 'active'
                        ? 'Fortsett der dere slapp'
                        : activeSession.plannedAt
                          ? `Vår neste økt er planlagt ${formatNextSession(activeSession.plannedAt)}.`
                          : 'Økten venter på deg'}
                    </span>
                  </div>
                  <span className="timeline-time">
                    {activeSession.durationMinutes} min
                  </span>
                </div>
                <div className="timeline-item">
                  <span className="timeline-icon">
                    <Icon name="target" />
                  </span>
                  <div className="timeline-copy">
                    <strong>
                      {recommendation
                        ? recommendation.title
                        : 'Tilpasset øving'}
                    </strong>
                    <span>
                      {recommendation
                        ? 'Mattis prioriterer dette ut fra tidligere økter'
                        : 'Mattis lager en plan ut fra det dere sender inn'}
                    </span>
                  </div>
                  <span className="timeline-time">Neste</span>
                </div>
              </div>
            ) : (
              <div className="home-plan">
                {home.isFirstSession ? (
                  <div className="home-intro-cta">
                    <p className="eyebrow">Første samtale</p>
                    <p>
                      Vi starter med en kort bli-kjent-samtale i chatten, så
                      Mattis kan tilpasse øktene. En foresatt kan gjerne være
                      med.
                    </p>
                    <button
                      className="button primary"
                      disabled={isStarting}
                      onClick={() => void startSession()}
                      type="button"
                    >
                      {isStarting ? 'Starter økt …' : 'Start økt'}
                      {!isStarting ? <Icon name="arrow" /> : null}
                    </button>
                  </div>
                ) : (
                  <div className="home-start-cta">
                    <p className="eyebrow">Klar når du er</p>
                    <p>
                      {sessionSuggestion?.focusTopic
                        ? `Mattis foreslår å bruke økten på ${sessionSuggestion.focusTopic}.`
                        : 'Mattis har et tilpasset forslag klart for denne økten.'}
                    </p>
                    {sessionSuggestion?.timeline.length ? (
                      <p className="secondary-text">
                        {sessionSuggestion.timeline
                          .slice(0, 3)
                          .map((item) => item.label)
                          .join(' · ')}
                      </p>
                    ) : null}
                    <button
                      className="button primary"
                      disabled={isStarting}
                      onClick={() => void startSession()}
                      type="button"
                    >
                      {isStarting ? 'Starter økt …' : 'Start økt'}
                      {!isStarting ? <Icon name="arrow" /> : null}
                    </button>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="billing-inline-prompt">
              <p className="eyebrow">Prøv Mattis gratis i 7 dager</p>
              <h2>Kom i gang med en prøveuke.</h2>
              <p className="secondary-text">
                Foresatt legger inn betalingsmåte i Stripe. Dere blir ikke
                belastet før prøveuken er over, og abonnementet kan avsluttes
                når som helst.
              </p>
              <Link className="button primary" href="/billing">
                Se prøveuken <Icon name="arrow" />
              </Link>
            </div>
          )}
          {error ? (
            <p className="form-message" role="alert">
              {error}
            </p>
          ) : null}
          {activeSession ? (
            <>
              <button
                className="button primary"
                disabled={isStarting}
                onClick={() => void openSession()}
                style={{ marginTop: 20 }}
                type="button"
              >
                {isStarting
                  ? 'Åpner økt …'
                  : homeSessionActionLabel(activeSession.status)}
                {!isStarting ? <Icon name="arrow" /> : null}
              </button>
              {activeSession.status === 'planned' ? (
                <button
                  className="button secondary"
                  disabled={isStarting}
                  onClick={() => void startPlannedSession()}
                  style={{ marginTop: 12, width: '100%' }}
                  type="button"
                >
                  Start økten tidligere
                </button>
              ) : null}
              <p className="next-session">
                <Icon name="calendar" />
                {homeSessionStatus(activeSession.status)}
              </p>
            </>
          ) : null}
          {home.nextSession &&
          (!activeSession ||
            activeSession.plannedAt !== home.nextSession.plannedAt) ? (
            <div
              className="home-next-session"
              aria-labelledby="home-next-session-title"
            >
              <div className="home-next-session-icon" aria-hidden="true">
                <Icon name="calendar" />
              </div>
              <div>
                <p className="eyebrow" id="home-next-session-title">
                  Neste økt
                </p>
                <strong>
                  Vår neste økt er planlagt{' '}
                  {formatNextSession(home.nextSession.plannedAt)}.
                </strong>
                <span>
                  {home.nextSession.durationMinutes} min · klar når dere er
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section
          className="card home-progress-card"
          aria-labelledby="home-progress-title"
        >
          <div className="home-card-heading">
            <div>
              <p className="eyebrow">Denne uka</p>
              <h2 id="home-progress-title">Litt jevn matte gjør forskjell</h2>
            </div>
            <strong>{weeklyProgress}%</strong>
          </div>
          <div className="home-progress-track" aria-hidden="true">
            <span style={{ width: weeklyProgress + '%' }} />
          </div>
          <p className="secondary-text home-progress-copy">
            {home.minutesThisWeek} av {home.weeklyGoalMinutes} minutter
          </p>
        </section>

        {home.recentSessions.length ? (
          <section
            className="home-history"
            aria-labelledby="home-history-title"
          >
            <div className="home-card-heading">
              <div>
                <p className="eyebrow">Historikk</p>
                <h2 id="home-history-title">Siste økter</h2>
              </div>
              <span className="secondary-text">
                {home.recentSessions.length}
              </span>
            </div>
            <div className="home-history-list">
              {home.recentSessions.map((session) => (
                <Link
                  className="home-history-item"
                  href={`/session/${session.id}/summary`}
                  key={session.id}
                >
                  <span className="history-icon">
                    <Icon name="check" size={18} />
                  </span>
                  <span className="history-copy">
                    <strong>
                      {formatHomeDate(session.endedAt ?? session.startedAt)}
                    </strong>
                    <span>
                      {session.completedTasks} av {session.totalTasks} oppgaver
                    </span>
                  </span>
                  <Icon name="arrow" size={18} />
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <BottomNav />
    </div>
  );
}
function EntryScreen() {
  const router = useRouter();
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => readApiResult(response))
      .then((result) => {
        if (active && result.authenticated && result.destination) {
          router.replace(result.destination);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router]);

  async function requestCode() {
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await readApiResult(response);
      if (!response.ok)
        throw new Error(result.error ?? 'Vi klarte ikke å sende koden.');
      setStage('code');
      setMessage(`Koden er sendt til ${email}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Vi klarte ikke å sende koden.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function verifyCode() {
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: code }),
      });
      const result = await readApiResult(response);
      if (!response.ok)
        throw new Error(result.error ?? 'Vi klarte ikke å logge deg inn.');
      router.replace(result.destination ?? '/onboarding');
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Vi klarte ikke å logge deg inn.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="app-shell entry-shell landing-shell">
      <main className="landing-content">
        <div className="landing-inner">
          <nav className="landing-nav" aria-label="Hovedmeny">
            <Brand />
            <a className="landing-nav-link" href="#login">
              Logg inn
            </a>
          </nav>

          <section className="landing-hero">
            <div className="landing-hero-copy">
              <p className="eyebrow">En roligere mattetime</p>
              <h1>
                Matte, ett steg av gangen<span className="coral-period">.</span>
              </h1>
              <p className="landing-hero-lead">
                Mattis hjelper eleven å forstå mer, uten å ta over. Sammen
                finner dere ut hva som er lurt å jobbe med akkurat nå.
              </p>
              <a className="button primary landing-hero-cta" href="#login">
                Start gratis prøveuke <Icon name="arrow" />
              </a>
              <p className="landing-note">
                7 dager gratis · ingen belastning før prøveuken er over
              </p>
            </div>
            <div className="landing-art-card" aria-hidden="true">
              <div className="landing-art-window">
                <span />
                <span />
                <span />
              </div>
            </div>
          </section>

          <section className="landing-section" id="how-it-works">
            <div className="landing-section-heading">
              <p className="eyebrow">Slik fungerer det</p>
              <h2>
                En privat mattelærer som blir bedre kjent med måten eleven lærer
                på.
              </h2>
              <p>
                Mattis starter med en samtale, foreslår en passende økt og
                justerer planen underveis.
              </p>
            </div>
            <div className="landing-feature-grid">
              <article className="landing-feature-card">
                <h3>Samtale først</h3>
                <p>
                  Eleven kan skrive fritt om lekser, temaer og hva som føles
                  vanskelig. Mattis stiller spørsmål før den lager oppgaver.
                </p>
              </article>
              <article className="landing-feature-card">
                <h3>Oppgaver når det passer</h3>
                <p>
                  Når dere vil øve, lager Mattis små oppgavesett som passer
                  tiden, nivået og det dere har snakket om.
                </p>
              </article>
              <article className="landing-feature-card">
                <h3>En plan som kan endres</h3>
                <p>
                  En fri tidslinje viser hva dere kan ta først, hva som bør
                  repeteres og hva som kan vente til neste gang.
                </p>
              </article>
            </div>
          </section>

          <section className="landing-section">
            <div className="landing-trial-band">
              <div>
                <h2>Laget for hele familien.</h2>
                <p>
                  Foresatt har én konto, og hver elev får sin egen profil.
                  Fremgang, preferanser og økter holdes adskilt mellom elevene.
                </p>
              </div>
              <a className="button" href="#login">
                Se hvordan det fungerer <Icon name="arrow" />
              </a>
            </div>
          </section>

          <section className="landing-section" id="faq">
            <div className="landing-section-heading">
              <p className="eyebrow">Vanlige spørsmål</p>
              <h2>Det viktigste før dere begynner.</h2>
            </div>
            <div className="landing-faq">
              <details>
                <summary>Gir Mattis eleven fasiten med en gang?</summary>
                <p>
                  Nei. Mattis skal hjelpe eleven å tenke selv. Når dere vil øve
                  mer, lager den et lite oppgavesett i stedet for å legge
                  enkeltoppgaver direkte inn i samtalen.
                </p>
              </details>
              <details>
                <summary>Hva husker Mattis?</summary>
                <p>
                  Mattis bruker læringsmål, temaer og korte notater om hva som
                  kan være nyttig neste gang. Vi lagrer ikke mer persondata enn
                  det som trengs for at oppfølgingen skal fungere.
                </p>
              </details>
              <details>
                <summary>Kan en foresatt følge med?</summary>
                <p>
                  Ja. Foresatt administrerer elevprofilene, abonnementet og
                  enkelte varsler fra sin egen foreldreseksjon. Eleven har
                  fortsatt sin egen arbeidsflate.
                </p>
              </details>
              <details>
                <summary>Hva koster Mattis?</summary>
                <p>
                  Dere får en gratis prøveuke. Etter prøveuken koster
                  abonnementet 249 kr per måned, og hvert ekstra barn koster 149
                  kr per måned. Betaling håndteres trygt hos Stripe.
                </p>
              </details>
              <details>
                <summary>
                  Er Mattis en erstatning for lærer eller helsehjelp?
                </summary>
                <p>
                  Nei. Mattis er et læringsverktøy for matematikk og skal ikke
                  brukes som akuttjeneste, helsehjelp eller erstatning for
                  oppfølging fra voksne og fagpersoner.
                </p>
              </details>
            </div>
          </section>

          <section className="landing-section" id="login">
            <div className="landing-login-card">
              <p className="eyebrow">Foreldreinnlogging</p>
              <h2>Kom i gang med Mattis.</h2>
              <p>
                Bruk e-postadressen din. Vi sender en engangskode – du trenger
                ikke passord.
              </p>
              <form
                className="login-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void (stage === 'email' ? requestCode() : verifyCode());
                }}
              >
                {stage === 'email' ? (
                  <div className="input-group">
                    <label htmlFor="email">E-post</label>
                    <input
                      autoComplete="email"
                      className="input"
                      id="email"
                      inputMode="email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="E-postadressen din"
                      required
                      type="email"
                      value={email}
                    />
                  </div>
                ) : (
                  <div className="input-group">
                    <label htmlFor="otp">Sekssifret kode</label>
                    <input
                      autoComplete="one-time-code"
                      autoFocus
                      className="input otp-input"
                      id="otp"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) =>
                        setCode(
                          event.target.value.replace(/\D/g, '').slice(0, 6),
                        )
                      }
                      pattern="[0-9]{6}"
                      placeholder="000000"
                      required
                      value={code}
                    />
                    <button
                      className="text-button"
                      onClick={() => {
                        setStage('email');
                        setCode('');
                        setMessage('');
                      }}
                      type="button"
                    >
                      Bruk en annen e-post
                    </button>
                  </div>
                )}
                {message ? (
                  <p aria-live="polite" className="form-message">
                    {message}
                  </p>
                ) : null}
                <button
                  className="button primary"
                  disabled={isLoading}
                  type="submit"
                >
                  {isLoading
                    ? 'Et øyeblikk …'
                    : stage === 'email'
                      ? 'Send kode'
                      : 'Logg inn'}
                  {!isLoading ? <Icon name="arrow" /> : null}
                </button>
              </form>
              <p className="helper-text">
                Mattis er åpen for alle foresatte. Du får de første 7 dagene
                gratis.
              </p>
            </div>
          </section>

          <footer className="landing-footer">
            Mattis er laget for å gjøre matte litt mer oversiktlig – én samtale
            og ett steg om gangen.
          </footer>
        </div>
      </main>
    </div>
  );
}

function ProfileChooser({
  initialProfiles,
}: {
  initialProfiles: ProfileChooserData;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [ageBand, setAgeBand] = useState<LearnerAgeBand>('12_16');
  const [parentTogetherConfirmed, setParentTogetherConfirmed] = useState(false);

  function handleGradeChange(value: string) {
    setGradeLevel(value);
    const stage = CURRICULUM_STAGES.find(
      (item) => item.value === Number(value),
    );
    setCourseCode(stage?.courseCodes[0] ?? '');
    setAgeBand(ageBandForGrade(Number(value)));
    if (Number(value) > 4) setParentTogetherConfirmed(false);
  }

  async function chooseProfile(learnerId: string) {
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/learners/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnerId }),
      });
      const result = await readApiResult(response);
      if (!response.ok)
        throw new Error(result.error ?? 'Vi klarte ikke å bytte profil.');
      router.replace(result.destination ?? '/home');
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Vi klarte ikke å bytte profil.',
      );
      setIsLoading(false);
    }
  }

  async function addProfile() {
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/learners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          gradeLevel: Number(gradeLevel),
          courseCode,
          ageBand,
          parentTogetherConfirmed,
        }),
      });
      const result = await readApiResult(response);
      if (!response.ok) {
        throw new Error(result.error ?? 'Vi klarte ikke å legge til eleven.');
      }
      if (result.learner?.id) {
        await chooseProfile(result.learner.id);
        return;
      }
      if (response.status === 202 && result.paymentUrl) {
        window.location.assign(result.paymentUrl);
        return;
      }
      setMessage(
        'Betalingen ble startet, men vi fikk ingen betalingslenke. Prøv igjen fra foreldresiden.',
      );
      setIsLoading(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Vi klarte ikke å legge til eleven.',
      );
      setIsLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <TopBar />
      <main className="page-wrap narrow app-content profile-chooser">
        <p className="eyebrow">Familiekonto</p>
        <h1>Hvem skal jobbe med Mattis?</h1>
        <p className="secondary-text">
          Velg en elevprofil for å fortsette der dere slapp.
        </p>
        {initialProfiles.pendingPayment ? (
          <aside className="pending-payment-banner" role="status">
            <strong>Betalingen behandles</strong>
            <span>
              Den nye elevprofilen blir synlig her så snart Stripe har bekreftet
              betalingen. Oppdater siden om den ikke vises med en gang.
            </span>
          </aside>
        ) : null}
        <div className="profile-grid">
          {initialProfiles.learners.map((learner) => (
            <button
              className="profile-card"
              disabled={isLoading}
              key={learner.id}
              onClick={() => void chooseProfile(learner.id)}
              type="button"
            >
              <span className="profile-avatar" aria-hidden="true">
                {learner.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="profile-card-copy">
                <strong>{learner.displayName}</strong>
                <span>
                  {learner.onboardingComplete
                    ? studyLevelLabel(learner.gradeLevel, learner.courseCode)
                    : 'Profilen er ikke ferdig satt opp'}
                </span>
              </span>
              <Icon name="arrow" size={18} />
            </button>
          ))}
        </div>
        <button
          className="text-button profile-add-toggle"
          onClick={() => setIsAdding((current) => !current)}
          type="button"
        >
          {isAdding ? 'Lukk' : '+ Legg til elev'}
        </button>
        {isAdding ? (
          <form
            className="card profile-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              void addProfile();
            }}
          >
            <div className="input-group">
              <label htmlFor="new-profile-name">Navn</label>
              <input
                className="input"
                id="new-profile-name"
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Hva vil eleven kalles?"
                required
                value={displayName}
              />
            </div>
            <div className="input-group">
              <label htmlFor="new-profile-grade">Trinn</label>
              <select
                className="select"
                id="new-profile-grade"
                onChange={(event) => handleGradeChange(event.target.value)}
                required
                value={gradeLevel}
              >
                <option disabled value="">
                  Velg trinn
                </option>
                {CURRICULUM_STAGES.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>
            {Number(gradeLevel) >= 11 ? (
              <div className="input-group">
                <label htmlFor="new-profile-course">Matematikkfag</label>
                <select
                  className="select"
                  id="new-profile-course"
                  onChange={(event) => setCourseCode(event.target.value)}
                  required
                  value={courseCode}
                >
                  {CURRICULUM_STAGES.find(
                    (stage) => stage.value === Number(gradeLevel),
                  )?.courseCodes.map((code) => (
                    <option key={code} value={code}>
                      {getCurriculumTrack(code)?.label ?? code}
                    </option>
                  ))}
                </select>
                {getCurriculumTrack(courseCode) ? (
                  <CurriculumDetails courseCode={courseCode} />
                ) : null}
              </div>
            ) : null}
            <div className="input-group">
              <label htmlFor="new-profile-age">Alder</label>
              <select
                className="select"
                id="new-profile-age"
                onChange={(event) =>
                  setAgeBand(event.target.value as LearnerAgeBand)
                }
                value={ageBand}
              >
                {(['under_12', '12_16', '17_plus'] as LearnerAgeBand[]).map(
                  (band) => (
                    <option
                      disabled={Number(gradeLevel) <= 4 && band !== 'under_12'}
                      key={band}
                      value={band}
                    >
                      {ageBandLabel(band)}
                    </option>
                  ),
                )}
              </select>
            </div>
            {parentTogetherRequired(Number(gradeLevel)) ? (
              <label className="check-row">
                <input
                  checked={parentTogetherConfirmed}
                  onChange={(event) =>
                    setParentTogetherConfirmed(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  Denne eleven bruker Mattis sammen med en foresatt og skal ikke
                  ha tilgang alene.
                </span>
              </label>
            ) : null}
            <button
              className="button primary"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? 'Gjør klar betaling …' : 'Fortsett til betaling'}
              {!isLoading ? <Icon name="arrow" /> : null}
            </button>
          </form>
        ) : null}
        {message ? <p className="form-message">{message}</p> : null}
        <Link className="text-button profile-parent-link" href="/parent">
          Foreldreinnstillinger
        </Link>
      </main>
    </div>
  );
}

function OnboardingScreen({
  initialProfile,
}: {
  initialProfile?: OnboardingProfileData;
}) {
  const [displayName, setDisplayName] = useState(
    initialProfile
      ? initialProfile.identityComplete
        ? initialProfile.displayName
        : initialProfile.displayName === 'Elev'
          ? ''
          : initialProfile.displayName
      : 'Nora',
  );
  const [gradeLevel, setGradeLevel] = useState(
    initialProfile?.gradeLevel ? String(initialProfile.gradeLevel) : '10',
  );
  const [courseCode, setCourseCode] = useState(
    initialProfile?.courseCode ?? 'MAT01-06',
  );
  const [ageBand, setAgeBand] = useState<LearnerAgeBand>(
    initialProfile?.ageBand ??
      ageBandForGrade(initialProfile?.gradeLevel ?? 10),
  );
  const [parentTogetherConfirmed, setParentTogetherConfirmed] = useState(
    initialProfile?.parentTogetherConfirmed ?? false,
  );
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(
    initialProfile?.safetyAcknowledged ?? false,
  );
  const [goal, setGoal] = useState('120 minutter');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const identityComplete = initialProfile?.identityComplete ?? false;

  function handleGradeChange(value: string) {
    setGradeLevel(value);
    const stage = CURRICULUM_STAGES.find(
      (item) => item.value === Number(value),
    );
    setCourseCode(stage?.courseCodes[0] ?? '');
    setAgeBand(ageBandForGrade(Number(value)));
    if (Number(value) > 4) setParentTogetherConfirmed(false);
  }

  async function saveProfile() {
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/profile/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          gradeLevel: Number(gradeLevel),
          courseCode,
          weeklyGoalMinutes: Number(goal.split(' ')[0]),
          ageBand,
          parentTogetherConfirmed,
          safetyAcknowledged,
        }),
      });
      const result = await readApiResult(response);
      if (!response.ok)
        throw new Error(result.error ?? 'Vi klarte ikke å lagre profilen.');
      router.replace('/billing?onboarding=1');
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Vi klarte ikke å lagre profilen.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <TopBar />
      <main className="page-wrap narrow app-content">
        <p className="eyebrow">Sett opp elevprofilen</p>
        <h1>Fortell oss litt om eleven</h1>
        <p className="secondary-text">
          Dette hjelper Mattis å tilpasse oppgavene og øktene. Du som foresatt
          kan fylle inn det du vet nå – dere kan endre det senere.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveProfile();
          }}
        >
          <div className="card" style={{ marginTop: 24 }}>
            {identityComplete ? (
              <div className="profile-context">
                <strong>{displayName}</strong>
                <span>{studyLevelLabel(Number(gradeLevel), courseCode)}</span>
              </div>
            ) : (
              <>
                <div className="input-group">
                  <label htmlFor="name">Hva skal eleven kalles?</label>
                  <input
                    className="input"
                    id="name"
                    maxLength={40}
                    onChange={(event) => setDisplayName(event.target.value)}
                    required
                    value={displayName}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="stage">Hvilket trinn går eleven på?</label>
                  <select
                    className="select"
                    id="stage"
                    onChange={(event) => handleGradeChange(event.target.value)}
                    required
                    value={gradeLevel}
                  >
                    {CURRICULUM_STAGES.map((stage) => (
                      <option key={stage.value} value={stage.value}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                </div>
                {Number(gradeLevel) >= 11 ? (
                  <div className="input-group">
                    <label htmlFor="course">Matematikkfag</label>
                    <select
                      className="select"
                      id="course"
                      onChange={(event) => setCourseCode(event.target.value)}
                      required
                      value={courseCode}
                    >
                      {CURRICULUM_STAGES.find(
                        (stage) => stage.value === Number(gradeLevel),
                      )?.courseCodes.map((code) => (
                        <option key={code} value={code}>
                          {getCurriculumTrack(code)?.label ?? code}
                        </option>
                      ))}
                    </select>
                    <CurriculumDetails courseCode={courseCode} />
                  </div>
                ) : null}
              </>
            )}
            <div className="input-group">
              <label htmlFor="age-band">Alder på eleven</label>
              <select
                className="select"
                id="age-band"
                onChange={(event) =>
                  setAgeBand(event.target.value as LearnerAgeBand)
                }
                value={ageBand}
              >
                {(['under_12', '12_16', '17_plus'] as LearnerAgeBand[]).map(
                  (band) => (
                    <option
                      disabled={Number(gradeLevel) <= 4 && band !== 'under_12'}
                      key={band}
                      value={band}
                    >
                      {ageBandLabel(band)}
                    </option>
                  ),
                )}
              </select>
            </div>
            {parentTogetherRequired(Number(gradeLevel)) ? (
              <div className="onboarding-co-use">
                <aside className="co-use-banner" role="note">
                  <strong>Denne matteøkten gjør dere sammen</strong>
                  <span>
                    Elever på 1.–4. trinn skal ikke bruke Mattis alene. En
                    foresatt bør være med hele veien.
                  </span>
                </aside>
                <label className="check-row">
                  <input
                    checked={parentTogetherConfirmed}
                    onChange={(event) =>
                      setParentTogetherConfirmed(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    Jeg forstår at en foresatt skal være med gjennom økten.
                  </span>
                </label>
              </div>
            ) : null}
            <section
              className="onboarding-safety-note"
              aria-labelledby="safety-onboarding-title"
            >
              <strong id="safety-onboarding-title">
                Hvis noe gjør eleven utrygg
              </strong>
              <p>
                Mattis kan hjelpe eleven å sette ord på bekymringer, men
                erstatter ikke en trygg voksen eller akutt hjelp. Snakk med
                eleven om at dere kan få en nøytral beskjed hvis noe alvorlig
                eller viktig å følge opp kommer fram.
              </p>
              <label className="check-row">
                <input
                  checked={safetyAcknowledged}
                  onChange={(event) =>
                    setSafetyAcknowledged(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  Jeg har snakket med eleven om dette og ønsker trygge
                  oppfølgingsvarsler.
                </span>
              </label>
            </section>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <span className="input-group label">
                Hvor mye ønsker dere å bruke Mattis?
              </span>
              <div
                className="choice-grid"
                role="radiogroup"
                aria-label="Velg ukentlig mål"
              >
                {['60 minutter', '120 minutter', '180 minutter'].map((item) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={goal === item}
                    key={item}
                    className={`choice-card ${goal === item ? 'selected' : ''}`}
                    onClick={() => setGoal(item)}
                  >
                    <span>
                      <strong>{item}</strong>
                      <span>
                        {item === '60 minutter'
                          ? 'En rolig start'
                          : item === '120 minutter'
                            ? 'Passe for en god rytme'
                            : 'For jevn oppfølging'}
                      </span>
                    </span>
                    <span className="radio" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          {message ? (
            <p aria-live="polite" className="form-message">
              {message}
            </p>
          ) : null}
          <p className="field-hint">
            Neste steg er å aktivere familiens gratis prøveuke. Dere registrerer
            betalingsmåte hos Stripe, men blir ikke belastet de første 7 dagene.
          </p>
          <div className="sticky-cta">
            <button
              className="button primary"
              disabled={
                isLoading ||
                !safetyAcknowledged ||
                (parentTogetherRequired(Number(gradeLevel)) &&
                  !parentTogetherConfirmed)
              }
              type="submit"
            >
              {isLoading ? 'Lagrer …' : 'Fortsett til prøveuke'}
              {!isLoading ? <Icon name="arrow" /> : null}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function NewSessionScreen() {
  const router = useRouter();
  const [duration, setDuration] = useState('45 minutter');
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState('');

  async function startSession() {
    setIsStarting(true);
    setStartError('');
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationMinutes: Number.parseInt(duration, 10),
          startImmediately: false,
        }),
      });
      const result = (await response
        .json()
        .catch(() => ({}))) as SessionApiResult;
      if (!response.ok || !result.id) {
        throw new Error(result.error ?? 'Vi klarte ikke å starte økten.');
      }
      router.push(`/session/${result.id}/capture`);
    } catch (error) {
      setStartError(
        error instanceof Error
          ? error.message
          : 'Vi klarte ikke å starte økten.',
      );
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="app-shell">
      <TopBar />
      <main className="page-wrap narrow app-content">
        <p className="eyebrow">Ny økt</p>
        <h1>Hvor lenge vil du jobbe?</h1>
        <p className="secondary-text">
          Mattis foreslår en liten økt med tid til både lekser og repetisjon.
        </p>
        <div
          className="choice-grid section"
          role="radiogroup"
          aria-label="Velg øktlengde"
        >
          {['25 minutter', '45 minutter', '60 minutter'].map((item) => (
            <button
              type="button"
              role="radio"
              aria-checked={duration === item}
              key={item}
              className={`choice-card ${duration === item ? 'selected' : ''}`}
              onClick={() => setDuration(item)}
            >
              <span>
                <strong>{item}</strong>
                <span>
                  {item === '45 minutter'
                    ? 'Lekser + repetisjon'
                    : 'Fokusert mattetid'}
                </span>
              </span>
              <span className="radio" />
            </button>
          ))}
        </div>
        <div className="sticky-cta">
          {startError ? (
            <p className="form-message" role="alert">
              {startError}
            </p>
          ) : null}
          <button
            className="button primary"
            disabled={isStarting}
            onClick={() => void startSession()}
            type="button"
          >
            {isStarting ? 'Starter …' : 'Fortsett til lekser'}
            {!isStarting ? <Icon name="arrow" /> : null}
          </button>
        </div>
      </main>
    </div>
  );
}

function CaptureScreen({ sessionId = 'demo' }: { sessionId?: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    setError('');
    const valid = Array.from(selected).filter((file) => {
      return (
        ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
        file.size > 0 &&
        file.size <= 6 * 1024 * 1024
      );
    });
    if (valid.length !== selected.length) {
      setError('Bruk JPG, PNG eller WebP under 6 MB.');
    }
    setFiles((current) => {
      const available = MAX_HOMEWORK_IMAGES - current.length;
      if (valid.length > available) {
        setError(
          `Du kan legge til opptil ${MAX_HOMEWORK_IMAGES} bilder per økt.`,
        );
      }
      return [...current, ...valid.slice(0, available)];
    });
  }

  async function prepareAndUpload(file: File) {
    const preparedResponse = await fetch(`/api/sessions/${sessionId}/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mimeType: file.type, byteSize: file.size }),
    });
    const prepared = (await preparedResponse.json().catch(() => ({}))) as {
      uploadId?: string;
      signedUrl?: string;
      error?: string;
    };
    if (!preparedResponse.ok || !prepared.uploadId || !prepared.signedUrl) {
      throw new Error(prepared.error ?? 'Bildet kunne ikke klargjøres.');
    }
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', file);
    const uploadResponse = await fetch(prepared.signedUrl, {
      method: 'PUT',
      body: form,
    });
    if (!uploadResponse.ok) throw new Error('Bildet kunne ikke lastes opp.');
    return prepared.uploadId;
  }

  async function interpretHomework() {
    if (!files.length || isWorking) return;
    setIsWorking(true);
    setError('');
    try {
      setStatus(`Laster opp bilde 1 av ${files.length} …`);
      const uploadIds: string[] = [];
      for (const [index, file] of files.entries()) {
        setStatus(`Laster opp bilde ${index + 1} av ${files.length} …`);
        uploadIds.push(await prepareAndUpload(file));
      }
      setStatus('Finner oppgavene …');
      const response = await fetch(
        `/api/sessions/${sessionId}/homework/parse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadIds }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Oppgavene kunne ikke tolkes.');
      router.push(`/session/${sessionId}/review`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Noe gikk galt. Prøv igjen.',
      );
      setStatus('');
      setIsWorking(false);
    }
  }

  async function startWithoutHomework() {
    setIsWorking(true);
    setError('');
    const response = await fetch(`/api/sessions/${sessionId}/start`, {
      method: 'POST',
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      setError(result.error ?? 'Økten kunne ikke startes.');
      setIsWorking(false);
      return;
    }
    router.push(`/session/${sessionId}`);
    router.refresh();
  }

  return (
    <div className="app-shell">
      <TopBar />
      <main className="page-wrap narrow app-content">
        <p className="eyebrow">Steg 1 av 2</p>
        <h1>Legg til leksene dine</h1>
        <p className="secondary-text">
          Ta bilde av oppgavene, så lager vi en ryddig liste sammen.
        </p>
        <section className="capture-box section">
          <span className="upload-icon">
            <Icon name="camera" size={27} />
          </span>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>
            Ta bilde eller velg fra mobilen
          </h2>
          <p>JPG, PNG eller WebP · maks {MAX_HOMEWORK_IMAGES} bilder</p>
          <label className="button secondary" htmlFor="homework-photo">
            Legg til bilde <Icon name="image" />
          </label>
          <input
            className="file-input"
            id="homework-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            disabled={isWorking || files.length >= MAX_HOMEWORK_IMAGES}
            onChange={(event) => addFiles(event.target.files)}
          />
        </section>
        <div className="upload-list" aria-live="polite">
          {files.map((file, index) => (
            <div
              className="upload-item"
              key={`${file.name}-${file.lastModified}`}
            >
              <span className="thumbnail">
                <Icon name="image" size={21} />
              </span>
              <div className="upload-meta">
                <strong>
                  Side {index + 1} · {file.name}
                </strong>
                <span>{Math.max(1, Math.round(file.size / 1024))} kB</span>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={`Fjern side ${index + 1}`}
                disabled={isWorking}
                onClick={() =>
                  setFiles((current) => current.filter((item) => item !== file))
                }
              >
                <Icon name="trash" size={19} />
              </button>
            </div>
          ))}
        </div>
        <div className="sticky-cta">
          {error ? (
            <p className="form-message" role="alert">
              {error}
            </p>
          ) : null}
          {status ? <p className="status-line">{status}</p> : null}
          <button
            className="button primary"
            disabled={!files.length || isWorking}
            onClick={() => void interpretHomework()}
            type="button"
          >
            {isWorking ? 'Jobber …' : 'Finn oppgavene'}
            {!isWorking ? <Icon name="arrow" /> : null}
          </button>
          {!files.length ? (
            <button
              className="text-button capture-skip"
              disabled={isWorking}
              onClick={() => void startWithoutHomework()}
              type="button"
            >
              Jeg har ingen lekser nå
            </button>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function ReviewScreen({
  initialReview,
  sessionId = 'demo',
}: {
  initialReview?: ReviewScreenData;
  sessionId?: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialReview?.tasks ?? []);
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  async function saveAndStart() {
    setIsStarting(true);
    setError('');
    try {
      const reviewResponse = await fetch(`/api/sessions/${sessionId}/tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: tasks.map((task) => ({ id: task.id, text: task.text })),
        }),
      });
      const reviewResult = (await reviewResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!reviewResponse.ok) {
        throw new Error(reviewResult.error ?? 'Oppgavene kunne ikke lagres.');
      }
      const startResponse = await fetch(`/api/sessions/${sessionId}/start`, {
        method: 'POST',
      });
      const startResult = (await startResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!startResponse.ok)
        throw new Error(startResult.error ?? 'Økten kunne ikke startes.');
      router.push(`/session/${sessionId}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Noe gikk galt. Prøv igjen.',
      );
      setIsStarting(false);
    }
  }

  return (
    <div className="app-shell">
      <TopBar />
      <main className="page-wrap narrow app-content">
        <p className="eyebrow">Steg 2 av 2</p>
        <h1>Stemmer dette?</h1>
        <p className="secondary-text">
          Sjekk oppgavene før vi starter. Du kan skrive om eller fjerne en
          oppgave.
        </p>
        <div className="review-list section">
          {tasks.map((task, index) => (
            <div className="task-edit" key={task.id}>
              <span
                className="task-number"
                title={taskDisplayLabel(task, index)}
              >
                {index + 1}
              </span>
              <div className="task-edit-body">
                {taskSetTitleFromLabel(task.label) ? (
                  <span className="task-edit-set-label">
                    {taskSetTitleFromLabel(task.label)}
                  </span>
                ) : null}
                <div className="task-edit-preview">
                  <MathText text={task.text} />
                </div>
                <textarea
                  className="textarea"
                  aria-label={`Rediger oppgave ${index + 1}`}
                  value={task.text}
                  onChange={(event) =>
                    setTasks((current) =>
                      current.map((item, taskIndex) =>
                        taskIndex === index
                          ? { ...item, text: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={`Fjern oppgave ${index + 1}`}
                onClick={() =>
                  setTasks((current) =>
                    current.filter((_, taskIndex) => taskIndex !== index),
                  )
                }
              >
                <Icon name="trash" size={19} />
              </button>
            </div>
          ))}
        </div>
        <p className="status-line section">
          <Icon name="check" size={17} /> {tasks.length} oppgaver klare
        </p>
        <div className="sticky-cta">
          {error ? (
            <p className="form-message" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button primary"
            disabled={isStarting}
            onClick={() => void saveAndStart()}
            type="button"
          >
            {isStarting
              ? 'Planlegger økten …'
              : tasks.length
                ? 'Start økten'
                : 'Start uten lekser'}
            {!isStarting ? <Icon name="arrow" /> : null}
          </button>
        </div>
      </main>
    </div>
  );
}

function GeometryFigure() {
  return (
    <svg
      className="geometry-figure"
      viewBox="0 0 600 300"
      role="img"
      aria-label="Rettvinklet trekant med kateter på 8 og 6 centimeter, og hypotenuse x"
    >
      <path
        d="M70 245H470V65Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M438 245v-30h32"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <text
        x="267"
        y="273"
        fontFamily="var(--math)"
        fontSize="23"
        textAnchor="middle"
        fill="currentColor"
      >
        8 cm
      </text>
      <text
        x="498"
        y="162"
        fontFamily="var(--math)"
        fontSize="23"
        textAnchor="middle"
        fill="currentColor"
      >
        6 cm
      </text>
      <text
        x="270"
        y="135"
        fontFamily="var(--math)"
        fontSize="28"
        textAnchor="middle"
        fill="currentColor"
        transform="rotate(-31 270 135)"
      >
        x
      </text>
    </svg>
  );
}

function TaskCard({
  task,
  tasks: allTasks,
  className,
  showGeometry,
  showCompletion,
}: {
  task: SessionTaskData;
  tasks: SessionTaskData[];
  className: string;
  showGeometry: boolean;
  showCompletion?: boolean;
}) {
  const index = allTasks.findIndex((item) => item.id === task.id);
  const taskId = `task-prompt-${task.id}`;
  const taskSetTitle = taskSetTitleFromLabel(task.label);
  return (
    <section
      className={`task-prompt task-prompt-card${task.text.length > 120 ? ' task-prompt-card-long' : ''}${task.text.length > 280 ? ' task-prompt-card-very-long' : ''} ${className}${showCompletion ? ' has-completion' : ''}`}
      aria-labelledby={taskId}
      aria-live={showCompletion ? 'polite' : undefined}
    >
      {showCompletion ? (
        <span
          className="task-card-completion"
          role="status"
          aria-label="Oppgave fullført"
        >
          <Icon name="check" size={30} />
        </span>
      ) : null}
      <div className="task-prompt-heading">
        <span>
          {taskSetTitle ?? (task.phase === 'homework' ? 'Lekse' : 'Repetisjon')}
        </span>
        <span>
          {taskSetTitle
            ? `Oppgave ${Math.max(index + 1, 1)} av ${allTasks.length}`
            : `${taskDisplayLabel(task, Math.max(index, 0))} · ${Math.max(index + 1, 1)} av ${allTasks.length}`}
        </span>
      </div>
      <div className="math-expression" id={taskId}>
        <MathText text={task.text} />
      </div>
      {showGeometry ? <GeometryFigure /> : null}
    </section>
  );
}

function SessionTimeline({
  plan,
  activePhase,
  activeTask,
}: {
  plan: SessionPlanData | null;
  activePhase: string;
  activeTask: SessionTaskData | null;
}) {
  const fallbackTimeline: SessionPlanTimelineItem[] = [
    { id: 'homework', label: 'Lekser', phase: 'homework', minutes: 0 },
    { id: 'repetition', label: 'Repetisjon', phase: 'repetition', minutes: 0 },
    { id: 'summary', label: 'Oppsummering', phase: 'summary', minutes: 0 },
  ];
  const items = plan?.timeline?.length ? plan.timeline : fallbackTimeline;
  const activeConcept = activeTask?.conceptKeys[0] ?? null;
  const plannedIndex = plan?.activeSegmentId
    ? items.findIndex((item) => item.id === plan.activeSegmentId)
    : -1;
  const matchingIndex = items.findIndex(
    (item) =>
      item.phase === activePhase &&
      (item.phase !== 'repetition' ||
        !activeConcept ||
        item.conceptKey === activeConcept),
  );
  const activeIndex =
    plannedIndex >= 0
      ? plannedIndex
      : matchingIndex >= 0
        ? matchingIndex
        : activePhase === 'summary'
          ? items.length - 1
          : 0;
  const activeItem = items[activeIndex] ?? items[0]!;
  const nextItem = items[activeIndex + 1] ?? null;
  const progress =
    items.length <= 1 ? 0 : (activeIndex / (items.length - 1)) * 100;

  return (
    <div className="session-timeline" aria-label="Foreslått plan for økten">
      <div className="session-timeline-current" aria-hidden="true">
        <span className="session-timeline-current-dot" />
        <strong className="session-timeline-current-label">
          {activeItem.label}
        </strong>
        <span className="session-timeline-current-time">
          {activeItem.minutes > 0 ? `${activeItem.minutes} min` : 'Neste'}
        </span>
      </div>
      <p className="session-timeline-next" aria-live="polite">
        {nextItem
          ? `Neste: ${nextItem.label}${nextItem.minutes > 0 ? ` · ${nextItem.minutes} min` : ''}`
          : 'Dette er siste del av økten'}
      </p>
      <div className="session-timeline-track" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div
        className="session-timeline-items"
        style={{ '--timeline-count': items.length } as CSSProperties}
      >
        {items.map((item, index) => {
          const completed = index < activeIndex;
          const active = index === activeIndex;
          return (
            <div
              className={`session-timeline-item${active ? ' active' : ''}${completed ? ' completed' : ''}`}
              aria-current={active ? 'step' : undefined}
              aria-label={`${item.label}${active ? ', aktiv fase' : ''}`}
              key={item.id}
            >
              <span className="session-timeline-marker">
                {completed ? <Icon name="check" size={13} /> : null}
              </span>
              <span className="session-timeline-label">{item.label}</span>
              <span className="session-timeline-time">
                {item.minutes > 0 ? `${item.minutes} min` : 'Neste'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InlinePlanProposal({
  plan,
  onAccept,
  onApplyChange,
}: {
  plan: SessionPlanData;
  onAccept: () => void;
  onApplyChange: (change: string) => void;
}) {
  const [isChanging, setIsChanging] = useState(false);
  const [change, setChange] = useState('');
  const items = plan.timeline?.length
    ? plan.timeline
    : [
        {
          id: 'homework',
          label: 'Lekser',
          phase: 'homework' as const,
          minutes: 0,
        },
        {
          id: 'repetition',
          label: 'Repetisjon',
          phase: 'repetition' as const,
          minutes: 0,
        },
        {
          id: 'summary',
          label: 'Oppsummering',
          phase: 'summary' as const,
          minutes: 0,
        },
      ];

  function submitChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = change.trim();
    if (!value) return;
    onApplyChange(value);
    setChange('');
  }

  return (
    <section
      className="card session-plan-proposal"
      aria-labelledby="session-plan-title"
    >
      <p className="eyebrow">Planforslag</p>
      <h2 id="session-plan-title">Hva tenker du om denne planen?</h2>
      <p className="secondary-text">
        Vi kan endre rekkefølgen eller bruke mer tid på det som føles viktigst
        før vi begynner.
      </p>
      <ol className="session-plan-list">
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.label}</span>
            <span>
              {item.minutes > 0 ? `${item.minutes} min` : 'Etter behov'}
            </span>
          </li>
        ))}
      </ol>
      {isChanging ? (
        <form className="session-plan-change" onSubmit={submitChange}>
          <label htmlFor="session-plan-change-input">Hva vil du endre?</label>
          <input
            className="input"
            id="session-plan-change-input"
            maxLength={240}
            onChange={(event) => setChange(event.target.value)}
            placeholder="For eksempel: mer tid til lekser"
            value={change}
          />
          <div className="button-row">
            <button
              className="button primary"
              disabled={!change.trim()}
              type="submit"
            >
              Bruk planen <Icon name="arrow" />
            </button>
            <button
              className="button ghost"
              onClick={() => setIsChanging(false)}
              type="button"
            >
              Tilbake
            </button>
          </div>
        </form>
      ) : (
        <div className="button-row session-plan-actions">
          <button className="button primary" onClick={onAccept} type="button">
            Planen passer <Icon name="arrow" />
          </button>
          <button
            className="button secondary"
            onClick={() => setIsChanging(true)}
            type="button"
          >
            Endre planen
          </button>
        </div>
      )}
    </section>
  );
}

function SessionScreen({
  initialGeometry = false,
  initialSession,
  sessionId,
  visualTest = false,
}: {
  initialGeometry?: boolean;
  initialSession?: SessionScreenData;
  sessionId?: string;
  visualTest?: boolean;
}) {
  const router = useRouter();
  const chatLogRef = useRef<HTMLDivElement>(null);
  const usesConversationFixture = visualTest && !initialSession;
  const initialSetupStep: SetupStep =
    initialSession?.status === 'parsing'
      ? 'parsing'
      : initialSession?.status === 'capturing'
        ? 'photos'
        : initialSession?.status === 'planned'
          ? initialSession.currentPhase === 'setup_photos'
            ? 'photos'
            : initialSession.currentPhase === 'setup_homework'
              ? 'homework'
              : 'duration'
          : 'active';
  const [setupStep, setSetupStep] = useState<SetupStep>(initialSetupStep);
  const [sessionDuration, setSessionDuration] = useState(
    initialSession?.durationMinutes ?? 45,
  );
  const [sessionStartedAt, setSessionStartedAt] = useState(
    initialSession?.startedAt ?? null,
  );
  const [setupFiles, setSetupFiles] = useState<File[]>([]);
  const [setupStatus, setSetupStatus] = useState('');
  const [isSessionLive, setIsSessionLive] = useState(
    visualTest || initialSession?.status === 'active',
  );
  const [geometry, setGeometry] = useState(initialGeometry);
  const [tasks, setTasks] = useState<SessionTaskData[]>(() => {
    if (initialSession?.tasks) return initialSession.tasks;
    if (usesConversationFixture) {
      return [
        {
          id: 'visual-task',
          text: initialGeometry
            ? 'Hvor lang er hypotenusen?'
            : 'Løs \\(2(x - 3) = 4x + 6\\)',
          label: initialGeometry ? '7b' : '4a',
          phase: 'homework',
          status: 'in_progress',
          taskType: initialGeometry ? 'geometry' : 'equation',
          conceptKeys: [
            initialGeometry ? 'geometry.pythagoras' : 'algebra.equations',
          ],
        },
      ];
    }
    return [];
  });
  const [taskCardTask, setTaskCardTask] = useState<SessionTaskData | null>(
    () =>
      tasks.find((task) => !['completed', 'skipped'].includes(task.status)) ??
      null,
  );
  const [incomingTaskCard, setIncomingTaskCard] =
    useState<SessionTaskData | null>(null);
  const taskCardTaskRef = useRef<SessionTaskData | null>(taskCardTask);
  const taskCardTimersRef = useRef<number[]>([]);
  const initialOpeningMode =
    !visualTest &&
    initialSession?.status === 'active' &&
    initialSession.planSnapshot?.mode
      ? initialSession.planSnapshot.mode
      : null;
  const initialTaskSetTopicNeeded: TaskSetOfferReason | null =
    !visualTest &&
    initialSession?.status === 'active' &&
    initialSession.tasks.length === 0 &&
    (!initialOpeningMode ||
      (initialSession.intakeStep === 'done' &&
        initialSession.intakeData?.homework === 'none'))
      ? 'no_homework'
      : null;
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (usesConversationFixture) {
      return initialGeometry
        ? [
            {
              id: 'visual-tutor-1',
              role: 'tutor',
              text: 'Hva vet du om sidene i en rettvinklet trekant?',
              status: 'sent',
            },
            {
              id: 'visual-student-1',
              role: 'student',
              text: 'Er det a² + b² = c²?',
              status: 'sent',
            },
            {
              id: 'visual-tutor-2',
              role: 'tutor',
              text: 'Nettopp. Hvilke tall setter du inn?',
              status: 'sent',
            },
          ]
        : [
            {
              id: 'visual-tutor-1',
              role: 'tutor',
              text: 'Hva ville du gjort først?',
              status: 'sent',
            },
            {
              id: 'visual-student-1',
              role: 'student',
              text: 'Kan jeg dele begge sider på 2?',
              status: 'sent',
            },
            {
              id: 'visual-tutor-2',
              role: 'tutor',
              text: 'Det kan du. Hva blir høyresiden da?',
              status: 'sent',
            },
          ];
    }

    if (initialSession?.status === 'planned') {
      return [
        {
          id: 'setup-tutor-duration',
          role: 'tutor',
          text:
            initialSession.currentPhase === 'setup_photos'
              ? 'Last opp ett eller flere bilder av leksene, så finner jeg oppgavene sammen med dere.'
              : initialSession.currentPhase === 'setup_homework'
                ? 'Har dere lekser dere vil ta bilde av før vi begynner?'
                : 'Hvor lenge vil dere jobbe i dag?',
          status: 'sent',
        },
      ];
    }
    if (initialSession?.status === 'capturing') {
      return [
        {
          id: 'setup-tutor-photos',
          role: 'tutor',
          text: 'Last opp ett eller flere bilder av leksene, så finner jeg oppgavene sammen med dere.',
          status: 'sent',
        },
      ];
    }
    if (initialSession?.status === 'parsing') {
      return [
        {
          id: 'setup-tutor-parsing',
          role: 'tutor',
          text: 'Jeg analyserer leksebildene nå …',
          status: 'sent',
        },
      ];
    }

    const storedMessages: ChatMessage[] | undefined =
      initialSession?.messages.map((message) => ({
        ...message,
        status: 'sent',
      }));
    if (!storedMessages?.length) {
      const opening = initialSession?.planSnapshot?.openingNb?.trim();
      const initialMessages: ChatMessage[] = opening
        ? [
            {
              id: 'session-opening',
              role: 'tutor',
              text: opening,
              kind: 'session_opening',
              status: 'sent',
            },
          ]
        : [];
      return initialTaskSetTopicNeeded
        ? [
            ...initialMessages,
            {
              id: 'task-set-topic-prompt',
              role: 'tutor',
              text: taskSetPromptFor(initialSession?.planSnapshot ?? null),
              status: 'sent',
            },
          ]
        : initialMessages;
    }
    const lastMessage = storedMessages[storedMessages.length - 1];
    if (lastMessage.role === 'student') lastMessage.status = 'failed';
    if (initialTaskSetTopicNeeded) {
      const prompt = taskSetPromptFor(initialSession?.planSnapshot ?? null);
      if (!storedMessages.some((message) => message.text === prompt)) {
        storedMessages.push({
          id: 'task-set-topic-prompt',
          role: 'tutor',
          text: prompt,
          status: 'sent',
        });
      }
    }
    return storedMessages;
  });
  const [draft, setDraft] = useState('');
  const [chatImage, setChatImage] = useState<File | null>(null);
  const [isTutorReplying, setIsTutorReplying] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [justCompletedTaskId, setJustCompletedTaskId] = useState<string | null>(
    null,
  );
  const [sessionPlan, setSessionPlan] = useState<SessionPlanData | null>(
    initialSession?.planSnapshot ?? null,
  );
  const [planReviewPending, setPlanReviewPending] = useState(
    !visualTest &&
      initialSession?.status === 'active' &&
      initialSession.planSnapshot?.mode === 'suggested' &&
      initialSession.planSnapshot.planConfirmed !== true &&
      Boolean(initialSession.planSnapshot.timeline?.length),
  );
  const [showScheduleWidget, setShowScheduleWidget] = useState(false);
  const [openingMode, setOpeningMode] = useState<SessionOpeningMode | null>(
    initialOpeningMode,
  );
  const [currentPhase, setCurrentPhase] = useState(
    initialSession?.currentPhase ?? 'summary',
  );
  const [introStep, setIntroStep] = useState<IntroStep>(
    initialSession?.intakeStep ?? 'goal',
  );
  const [introData, setIntroData] = useState<Record<string, unknown>>(
    initialSession?.intakeData ?? {},
  );
  const [introTextMode, setIntroTextMode] = useState<
    'goal_other' | 'frequency_other' | 'schedule' | 'school' | 'homework' | null
  >(null);
  const [introDraft, setIntroDraft] = useState('');
  const [introConfidence, setIntroConfidence] = useState<
    Partial<Record<IntroConfidenceTopicKey, IntroConfidenceLevel>>
  >(() => {
    const saved = initialSession?.intakeData?.confidence;
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(
      Object.entries(saved).filter(
        ([, value]) =>
          value === 'uncertain' ||
          value === 'somewhat' ||
          value === 'confident',
      ),
    ) as Partial<Record<IntroConfidenceTopicKey, IntroConfidenceLevel>>;
  });
  const initialTaskSetSuggestion = initialTaskSetTopicNeeded
    ? getTaskSetSuggestion(initialSession?.planSnapshot ?? null)
    : null;
  const [taskSetOffer, setTaskSetOffer] = useState<TaskSetOfferReason | null>(
    initialTaskSetSuggestion ? initialTaskSetTopicNeeded : null,
  );
  const [taskSetSuggestion, setTaskSetSuggestion] =
    useState<TaskSetSuggestion | null>(initialTaskSetSuggestion);
  const [taskSetTopicNeeded, setTaskSetTopicNeeded] =
    useState<TaskSetOfferReason | null>(
      initialTaskSetSuggestion ? null : initialTaskSetTopicNeeded,
    );
  const [isGeneratingTaskSet, setIsGeneratingTaskSet] = useState(false);
  const [hasGeneratedTaskSet, setHasGeneratedTaskSet] = useState(false);
  const [tutorError, setTutorError] = useState(() =>
    !visualTest && initialSession?.messages.at(-1)?.role === 'student'
      ? 'Mattis mangler et svar på den siste meldingen.'
      : '',
  );
  const [safetyLevel, setSafetyLevel] = useState<'support' | 'urgent' | null>(
    null,
  );
  const [safetyCode, setSafetyCode] = useState<string | null>(null);
  const [safetyEventId, setSafetyEventId] = useState<string | null>(null);
  const [safetyChildConsentRequired, setSafetyChildConsentRequired] =
    useState(false);
  const [safetyTrustedAdultOnly, setSafetyTrustedAdultOnly] = useState(false);
  const failedMessage = messages.findLast(
    (message) => message.status === 'failed',
  );
  const sessionEnded =
    initialSession?.status === 'completed' ||
    initialSession?.status === 'cancelled';
  const activeTask = tasks.find(
    (task) => !['completed', 'skipped'].includes(task.status),
  );
  const activeTaskIndex = activeTask
    ? tasks.findIndex((task) => task.id === activeTask.id)
    : -1;
  const activePhase =
    activeTask?.phase ??
    (currentPhase === 'intro' && introStep === 'done'
      ? 'homework'
      : currentPhase);
  const confidenceTopics = introConfidenceTopics(
    initialSession?.gradeLevel ?? null,
  );
  const completedTask = justCompletedTaskId
    ? (tasks.find((task) => task.id === justCompletedTaskId) ?? null)
    : null;

  useEffect(() => {
    if (!justCompletedTaskId) return;
    const timeout = window.setTimeout(() => setJustCompletedTaskId(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [justCompletedTaskId]);

  useEffect(() => {
    const displayedTaskId = taskCardTaskRef.current?.id ?? null;
    if (activeTask?.id === displayedTaskId) return;

    for (const timer of taskCardTimersRef.current) window.clearTimeout(timer);
    taskCardTimersRef.current = [];

    const nextTask = activeTask ?? null;
    const pauseAfterCheck = justCompletedTaskId ? 620 : 0;

    const startTimer = window.setTimeout(() => {
      taskCardTaskRef.current = null;
      setTaskCardTask(null);
      setIncomingTaskCard(null);

      const enterTimer = window.setTimeout(() => {
        setIncomingTaskCard(nextTask);
      }, 120);
      const swapTimer = window.setTimeout(() => {
        taskCardTaskRef.current = nextTask;
        setTaskCardTask(nextTask);
        setIncomingTaskCard(null);
      }, 680);
      taskCardTimersRef.current.push(enterTimer, swapTimer);
    }, pauseAfterCheck);
    taskCardTimersRef.current.push(startTimer);

    return () => {
      for (const timer of taskCardTimersRef.current) window.clearTimeout(timer);
      taskCardTimersRef.current = [];
    };
  }, [activeTask, justCompletedTaskId]);

  function appendSetupTurn(
    studentText: string,
    tutorText: string,
    tutorKind?: ChatMessage['kind'],
  ) {
    const turnId = crypto.randomUUID();
    setMessages((items) => [
      ...items,
      {
        id: `setup-student-${turnId}`,
        role: 'student',
        text: studentText,
        status: 'sent',
      },
      {
        id: `setup-tutor-${turnId}`,
        role: 'tutor',
        text: tutorText,
        ...(tutorKind ? { kind: tutorKind } : {}),
        status: 'sent',
      },
    ]);
  }

  function appendTutorTurn(text: string) {
    setMessages((items) => [
      ...items,
      {
        id: `tutor-local-${crypto.randomUUID()}`,
        role: 'tutor',
        text,
        status: 'sent',
      },
    ]);
  }

  async function savePlanReview(change?: string) {
    if (!sessionPlan || !planReviewPending) return;
    setTutorError('');
    let savedPlan: SessionPlanData | undefined;
    try {
      if (sessionId && !visualTest) {
        const response = await fetchWithSessionRefresh(
          `/api/sessions/${sessionId}/plan`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(change ? { change } : { planConfirmed: true }),
          },
        );
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
          planConfirmed?: boolean;
          plan?: SessionPlanData;
        };
        if (!response.ok)
          throw new Error(result.error ?? 'Planen kunne ikke lagres.');
        savedPlan = result.plan;
      }
      setSessionPlan(
        (current) =>
          savedPlan ??
          (current ? { ...current, planConfirmed: !change } : current),
      );
      setPlanReviewPending(Boolean(change));
      if (change) {
        appendSetupTurn(
          change,
          'Klart. Jeg har justert planen. Se om denne versjonen passer, så legger vi den inn i tidslinjen.',
        );
      } else {
        appendTutorTurn(
          'Fint — da legger vi planen inn i tidslinjen. Vi kan fortsatt justere underveis.',
        );
      }
    } catch (error) {
      setTutorError(
        error instanceof Error ? error.message : 'Planen kunne ikke lagres.',
      );
    }
  }

  async function saveIntroAnswer(
    studentText: string,
    tutorText: string,
    nextStep: IntroStep,
    data: Record<string, unknown>,
    complete = false,
  ) {
    if (isTutorReplying || !sessionId || visualTest) return false;
    const mergedData = { ...introData, ...data };
    const studentClientMessageId = crypto.randomUUID();
    const tutorClientMessageId = crypto.randomUUID();
    appendSetupTurn(studentText, tutorText);
    setIsTutorReplying(true);
    setTutorError('');
    try {
      const response = await fetchWithSessionRefresh('/api/learners/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intakeStep: nextStep,
          intakeData: mergedData,
          complete,
          sessionId,
          studentText,
          tutorText,
          studentClientMessageId,
          tutorClientMessageId,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Svaret kunne ikke lagres.');
      setIntroData(mergedData);
      setIntroStep(nextStep);
      return true;
    } catch (error) {
      setTutorError(
        error instanceof Error ? error.message : 'Svaret kunne ikke lagres.',
      );
      return false;
    } finally {
      setIsTutorReplying(false);
    }
  }

  async function finishIntro(
    studentText: string,
    tutorText: string,
    data: Record<string, unknown>,
  ) {
    const saved = await saveIntroAnswer(
      studentText,
      tutorText,
      'done',
      data,
      true,
    );
    if (!saved) return;
    setCurrentPhase('homework');
    setOpeningMode(null);
    if (data.homework === 'none') {
      setTaskSetOffer('no_homework');
      setTaskSetTopicNeeded('no_homework');
    }
  }

  async function respondToSafetyConsent(consent: boolean) {
    if (!safetyEventId || isTutorReplying) return;
    setIsTutorReplying(true);
    try {
      const response = await fetchWithSessionRefresh('/api/safety/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: safetyEventId, consent }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Sikkerhetssvaret kunne ikke lagres.');
      setSafetyChildConsentRequired(false);
      setSafetyTrustedAdultOnly(
        !consent || result.status === 'trusted_adult_only',
      );
      appendTutorTurn(
        consent
          ? 'Takk, jeg har notert at det er greit å gi foreldrene en nøytral beskjed. Snakk gjerne videre med en trygg voksen også.'
          : 'Det er helt greit. Snakk med en annen trygg voksen du stoler på. Du skal ikke måtte stå alene med dette.',
      );
    } catch (error) {
      setTutorError(
        error instanceof Error
          ? error.message
          : 'Sikkerhetssvaret kunne ikke lagres.',
      );
    } finally {
      setIsTutorReplying(false);
    }
  }

  function offerTaskSet(reason: TaskSetOfferReason, announce = true) {
    if (
      visualTest ||
      hasGeneratedTaskSet ||
      taskSetOffer ||
      taskSetTopicNeeded ||
      isGeneratingTaskSet
    ) {
      return;
    }
    const suggestion = getTaskSetSuggestion(sessionPlan);
    if (suggestion) setTaskSetSuggestion(suggestion);
    setTaskSetOffer(reason);
    if (announce) {
      appendTutorTurn(
        reason === 'no_homework'
          ? suggestion
            ? `Ingen lekser i dag går fint. Jeg foreslår ${suggestion.label}. Vil du at jeg skal lage et kort oppgavesett?`
            : 'Ingen lekser i dag går fint. Vil du at jeg skal lage et kort oppgavesett?'
          : suggestion
            ? `Alle oppgavene er ferdige. Jeg foreslår at vi øver litt mer på ${suggestion.label}. Vil du det?`
            : 'Alle oppgavene er ferdige. Vil du øve litt mer med et nytt oppgavesett?',
      );
    }
  }

  function askForTaskSetTopic(reason: TaskSetOfferReason) {
    if (visualTest || hasGeneratedTaskSet || isGeneratingTaskSet) return;
    setTaskSetOffer(null);
    setTaskSetSuggestion(null);
    setTaskSetTopicNeeded(reason);
    appendTutorTurn(
      'Hva vil du helst øve på akkurat nå? Skriv gjerne tema, om du vil ha rolige eller litt mer utfordrende oppgaver, eller hva som føles vanskelig, så lager jeg et lite oppgavesett – ikke enkeltoppgaver direkte i chatten.',
    );
  }

  async function chooseDuration(durationMinutes: number) {
    setSetupStatus('Lagrer økttiden …');
    setTutorError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/setup`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes, step: 'homework' }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Økttiden kunne ikke lagres.');
      setSessionDuration(durationMinutes);
      setSetupStep('homework');
      setSetupStatus('');
      appendSetupTurn(
        `${durationMinutes} minutter`,
        'Har dere lekser dere vil ta bilde av før vi begynner?',
      );
    } catch (caught) {
      setSetupStatus('');
      setTutorError(
        caught instanceof Error
          ? caught.message
          : 'Økttiden kunne ikke lagres.',
      );
    }
  }

  async function startLiveSession(hasHomework = false) {
    setSetupStatus('Gjør økten klar …');
    setTutorError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/start`, {
        method: 'POST',
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        session?: { startedAt?: string | null; currentPhase?: string };
        plan?: SessionPlanData | null;
        previousNextTopicNb?: string | null;
        tasks?: Array<{
          id: string;
          text: string;
          label: string | null;
          phase: 'homework' | 'repetition';
          status: string;
          taskType?: string;
          conceptKeys: string[];
        }>;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Økten kunne ikke startes.');
      const startedTasks = result.tasks ?? [];
      if (result.tasks) {
        setTasks(
          startedTasks.map((task) => ({
            ...task,
            taskType: task.taskType ?? 'open_response',
          })),
        );
      }
      const returnedPlan = result.plan ?? null;
      const planWithMemory =
        returnedPlan || result.previousNextTopicNb
          ? {
              ...(returnedPlan ?? {}),
              previousNextTopicNb:
                result.previousNextTopicNb ??
                returnedPlan?.previousNextTopicNb ??
                null,
            }
          : null;
      setSessionPlan(planWithMemory);
      if (result.session?.currentPhase) {
        setCurrentPhase(result.session.currentPhase);
      }
      if (planWithMemory?.activeSegmentId) {
        setSessionPlan((current) =>
          current
            ? { ...current, activeSegmentId: planWithMemory.activeSegmentId }
            : current,
        );
      }
      setPlanReviewPending(
        !visualTest &&
          planWithMemory?.mode === 'suggested' &&
          planWithMemory.planConfirmed !== true &&
          Boolean(planWithMemory.timeline?.length),
      );
      const suggestion = getTaskSetSuggestion(planWithMemory);
      if (suggestion && !startedTasks.length) setTaskSetSuggestion(suggestion);
      setSessionStartedAt(
        result.session?.startedAt ?? new Date().toISOString(),
      );
      setSetupStep('active');
      setIsSessionLive(true);
      setSetupStatus('');
      appendSetupTurn(
        hasHomework ? 'Leksebildene er klare' : 'Nei, vi starter uten lekser',
        startedTasks.length
          ? `Da begynner vi med et lite repetisjonssett.${returnedPlan?.reasonNb ? ` ${returnedPlan.reasonNb}` : ''}`
          : suggestion
            ? `Ingen lekser er helt greit. Jeg foreslår at vi tar utgangspunkt i ${suggestion.label} i dag. Vil du at jeg skal lage et kort oppgavesett?`
            : 'Ingen lekser er helt greit. Hva har dere jobbet med på skolen i det siste? Skriv gjerne ett eller to temaer, så lager jeg et kort oppgavesett.',
        'session_opening',
      );
      if (!hasHomework && startedTasks.length === 0) {
        if (suggestion) setTaskSetOffer('no_homework');
        else setTaskSetTopicNeeded('no_homework');
      }
    } catch (caught) {
      setSetupStatus('');
      setTutorError(
        caught instanceof Error ? caught.message : 'Økten kunne ikke startes.',
      );
    }
  }

  async function chooseHomework(hasHomework: boolean) {
    if (hasHomework) {
      setSetupStatus('Lagrer leksevalget …');
      setTutorError('');
      try {
        const response = await fetch(`/api/sessions/${sessionId}/setup`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'photos' }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error ?? 'Leksevalget kunne ikke lagres.');
        setSetupStep('photos');
        setSetupStatus('');
        appendSetupTurn(
          'Ja, jeg har lekser',
          'Last opp ett eller flere bilder, så finner jeg oppgavene sammen med dere.',
        );
      } catch (caught) {
        setSetupStatus('');
        setTutorError(
          caught instanceof Error
            ? caught.message
            : 'Leksevalget kunne ikke lagres.',
        );
      }
      return;
    }
    void startLiveSession();
  }

  function addSetupFiles(selected: FileList | null) {
    if (!selected) return;
    const valid = Array.from(selected).filter(
      (file) =>
        ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
        file.size > 0 &&
        file.size <= 6 * 1024 * 1024,
    );
    if (valid.length !== selected.length) {
      setTutorError('Bruk JPG, PNG eller WebP under 6 MB.');
    }
    setSetupFiles((current) => {
      const available = MAX_HOMEWORK_IMAGES - current.length;
      if (valid.length > available) {
        setTutorError(`Du kan legge til opptil ${MAX_HOMEWORK_IMAGES} bilder.`);
      }
      return [...current, ...valid.slice(0, available)];
    });
  }

  async function prepareSetupUpload(file: File) {
    const response = await fetch(`/api/sessions/${sessionId}/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mimeType: file.type, byteSize: file.size }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      uploadId?: string;
      signedUrl?: string;
      error?: string;
    };
    if (!response.ok || !result.uploadId || !result.signedUrl) {
      throw new Error(result.error ?? 'Bildet kunne ikke klargjøres.');
    }
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', file);
    const uploadResponse = await fetch(result.signedUrl, {
      method: 'PUT',
      body: form,
    });
    if (!uploadResponse.ok) throw new Error('Bildet kunne ikke lastes opp.');
    return result.uploadId;
  }

  async function parseSetupHomework() {
    if (!setupFiles.length || !sessionId) return;
    setSetupStep('parsing');
    setSetupStatus('Laster opp bildene …');
    setTutorError('');
    try {
      const uploadIds: string[] = [];
      for (const [index, file] of setupFiles.entries()) {
        setSetupStatus(
          `Laster opp bilde ${index + 1} av ${setupFiles.length} …`,
        );
        uploadIds.push(await prepareSetupUpload(file));
      }
      setSetupStatus('Finner oppgavene …');
      const response = await fetch(
        `/api/sessions/${sessionId}/homework/parse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadIds }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        taskCount?: number;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Oppgavene kunne ikke tolkes.');
      setSetupStep('review');
      setSetupStatus('');
      appendSetupTurn(
        `${setupFiles.length} leksebilder`,
        `Jeg fant ${result.taskCount ?? 'flere'} oppgaver. La oss sjekke at alt ser riktig ut før vi starter.`,
      );
    } catch (caught) {
      setSetupStep('photos');
      setSetupStatus('');
      setTutorError(
        caught instanceof Error
          ? caught.message
          : 'Oppgavene kunne ikke tolkes.',
      );
    }
  }

  async function generateTaskSet(
    reason: TaskSetOfferReason,
    announce = true,
    topic = '',
  ) {
    if (!sessionId || isGeneratingTaskSet || hasGeneratedTaskSet) return;
    setOpeningMode(null);
    setTaskSetOffer(null);
    setTaskSetSuggestion(null);
    setTaskSetTopicNeeded(null);
    setIsGeneratingTaskSet(true);
    setSetupStatus('Lager et oppgavesett …');
    setTutorError('');
    if (announce) {
      appendSetupTurn(
        'Ja, lag et oppgavesett',
        'Jeg lager et kort oppgavesett som passer til økten …',
      );
    } else {
      appendTutorTurn('Jeg lager et kort oppgavesett som passer til økten …');
    }
    try {
      const response = await fetchWithSessionRefresh(
        '/api/sessions/' + sessionId + '/task-set',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, topic: topic.trim().slice(0, 240) }),
        },
      );
      const result = (await response
        .json()
        .catch(() => ({}))) as TaskSetApiResult;
      if (!response.ok || !result.tasks?.length) {
        throw new Error(
          result.error ?? 'Oppgavesettet kunne ikke lages akkurat nå.',
        );
      }
      setTasks((current) => [
        ...current,
        ...result.tasks!.map((task) => ({
          ...task,
          taskType: task.taskType ?? 'open_response',
        })),
      ]);
      setHasGeneratedTaskSet(true);
      setSetupStatus('');
      appendTutorTurn(
        result.message ??
          'Jeg har laget ' +
            result.tasks.length +
            ' oppgaver. Vi tar én om gangen.',
      );
    } catch (caught) {
      setSetupStatus('');
      setTutorError(
        caught instanceof Error
          ? caught.message
          : 'Oppgavesettet kunne ikke lages.',
      );
    } finally {
      setIsGeneratingTaskSet(false);
    }
  }

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
  }, [messages, isTutorReplying]);

  async function endSessionEarly() {
    if (visualTest || !sessionId || isEndingSession) return;

    setIsEndingSession(true);
    setTutorError('');
    try {
      const response = await fetchWithSessionRefresh(
        `/api/sessions/${sessionId}/finish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Økten kunne ikke avsluttes.');
      router.push(`/session/${sessionId}/summary`);
      router.refresh();
    } catch (error) {
      setIsEndingSession(false);
      setTutorError(
        error instanceof Error ? error.message : 'Økten kunne ikke avsluttes.',
      );
    }
  }

  const send = async (retryMessage?: ChatMessage, overrideText?: string) => {
    const attachedImage = chatImage;
    const studentText =
      retryMessage?.text ??
      (overrideText?.trim() ||
        draft.trim() ||
        (attachedImage ? 'Jeg har sendt et bilde av utregningen min.' : ''));
    const wantsToEndSession = requestsSessionEnd(studentText);
    if (
      !studentText ||
      (!sessionId && !visualTest) ||
      isTutorReplying ||
      isEndingSession ||
      sessionEnded ||
      (!retryMessage && Boolean(failedMessage))
    )
      return;

    const clientMessageId =
      retryMessage?.clientMessageId ?? crypto.randomUUID();
    const studentMessage: ChatMessage = retryMessage
      ? { ...retryMessage, status: 'sending' }
      : {
          id: clientMessageId,
          role: 'student',
          text: studentText,
          clientMessageId,
          hasAttachment: Boolean(attachedImage),
          status: 'sending',
        };

    setMessages((items) =>
      retryMessage
        ? items.map((message) =>
            message.id === retryMessage.id ? studentMessage : message,
          )
        : [...items, studentMessage],
    );
    if (!retryMessage) setDraft('');
    setTutorError('');
    setIsTutorReplying(true);

    try {
      if (
        !wantsToEndSession &&
        !attachedImage &&
        requestsSchedule(studentText)
      ) {
        setMessages((items) => [
          ...items.map((message) =>
            message.id === studentMessage.id
              ? { ...message, status: 'sent' as const }
              : message,
          ),
          {
            id: `schedule-tutor-${clientMessageId}`,
            role: 'tutor',
            text: 'Klart. Når passer det å jobbe sammen neste gang? Velg et tidspunkt her, så lagrer vi avtalen.',
            status: 'sent',
          },
        ]);
        setShowScheduleWidget(true);
        return;
      }
      if (
        !wantsToEndSession &&
        !activeTask &&
        !attachedImage &&
        taskSetTopicNeeded
      ) {
        setMessages((items) =>
          items.map((message) =>
            message.id === studentMessage.id
              ? { ...message, status: 'sent' as const }
              : message,
          ),
        );
        const reason = taskSetTopicNeeded;
        const suggestedTopic =
          taskSetSuggestion &&
          /^(ja|gjerne|ok|okei|det gjør vi|la oss gjøre det)\b/i.test(
            studentText,
          )
            ? taskSetSuggestion.topic
            : studentText;
        await generateTaskSet(reason, false, suggestedTopic);
        return;
      }

      if (
        !wantsToEndSession &&
        !activeTask &&
        !attachedImage &&
        requestsTaskSet(studentText)
      ) {
        setMessages((items) =>
          items.map((message) =>
            message.id === studentMessage.id
              ? { ...message, status: 'sent' as const }
              : message,
          ),
        );
        askForTaskSetTopic('more_practice');
        return;
      }

      if (visualTest) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        setMessages((items) => [
          ...items.map((message) =>
            message.id === studentMessage.id
              ? { ...message, status: 'sent' as const }
              : message,
          ),
          {
            id: `visual-tutor-${clientMessageId}`,
            role: 'tutor',
            text: 'Bra at du spør. Hvilket lite steg ville du prøvd først?',
            status: 'sent',
          },
        ]);
        return;
      }

      let response: Response;
      if (attachedImage) {
        const compressedImage = await compressChatImage(attachedImage);
        const form = new FormData();
        form.append('sessionId', sessionId!);
        form.append('clientMessageId', clientMessageId);
        if (activeTask) form.append('taskId', activeTask.id);
        form.append('message', studentText);
        form.append('image', compressedImage, 'utregning.jpg');
        response = await fetchWithSessionRefresh('/api/tutor/image', {
          method: 'POST',
          body: form,
        });
      } else {
        response = await fetchWithSessionRefresh('/api/tutor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            clientMessageId,
            ...(activeTask
              ? {
                  task: {
                    id: activeTask.id,
                    text: activeTask.text,
                    topic: activeTask.conceptKeys[0],
                  },
                }
              : {}),
            messages: [{ role: 'student', content: studentText }],
          }),
        });
      }
      const result = (await response
        .json()
        .catch(() => ({}))) as TutorApiResult;

      if (!response.ok || !result.reply?.trim()) {
        throw new Error(
          result.error ?? 'Mattis klarte ikke å svare akkurat nå.',
        );
      }

      setMessages((items) => [
        ...items.map((message) =>
          message.id === studentMessage.id
            ? { ...message, status: 'sent' as const }
            : message,
        ),
        {
          id: `tutor-${clientMessageId}`,
          role: 'tutor',
          text: result.reply!.trim(),
          status: 'sent',
        },
      ]);
      if (result.safetyLevel) setSafetyLevel(result.safetyLevel);
      if (result.safetyCode) setSafetyCode(result.safetyCode);
      if (result.safetyEventId) setSafetyEventId(result.safetyEventId);
      setSafetyChildConsentRequired(result.safetyChildConsentRequired === true);
      setSafetyTrustedAdultOnly(result.safetyTrustedAdultOnly === true);
      if (attachedImage) setChatImage(null);
      if (
        wantsToEndSession ||
        result.suggestedActions?.includes('end_session')
      ) {
        await endSessionEarly();
        return;
      }
      if (!activeTask && result.suggestedActions?.includes('create_task_set')) {
        offerTaskSet(tasks.length ? 'more_practice' : 'no_homework', false);
      }
      if (result.sessionProgress?.activeSegmentId) {
        setSessionPlan((current) =>
          current
            ? {
                ...current,
                activeSegmentId: result.sessionProgress!.activeSegmentId,
              }
            : current,
        );
        if (result.sessionProgress.activePhase) {
          setCurrentPhase(result.sessionProgress.activePhase);
        }
      }
      if (activeTask && result.taskState === 'completed') {
        setJustCompletedTaskId(activeTask.id);
        setTasks((current) =>
          current.map((task) =>
            task.id === activeTask.id ? { ...task, status: 'completed' } : task,
          ),
        );
        const hasRemainingTasks = tasks.some(
          (task) =>
            task.id !== activeTask.id &&
            !['completed', 'skipped'].includes(task.status),
        );
        if (!hasRemainingTasks) offerTaskSet('more_practice');
      } else if (activeTask && result.taskState) {
        setTasks((current) =>
          current.map((task) =>
            task.id === activeTask.id
              ? {
                  ...task,
                  status: [
                    'checking',
                    'ready_to_complete',
                    'needs_human_review',
                  ].includes(result.taskState!)
                    ? 'checking'
                    : 'in_progress',
                }
              : task,
          ),
        );
      }
    } catch (error) {
      setMessages((items) =>
        items.map((message) =>
          message.id === studentMessage.id
            ? { ...message, status: 'failed' }
            : message,
        ),
      );
      setTutorError(
        error instanceof Error
          ? error.message
          : 'Mattis klarte ikke å svare akkurat nå.',
      );
    } finally {
      setIsTutorReplying(false);
    }
  };

  const introConfidenceComplete = confidenceTopics.every(({ key }) =>
    Boolean(introConfidence[key]),
  );

  function submitIntroConfidence() {
    if (!introConfidenceComplete || isTutorReplying) return;
    const summary = confidenceTopics
      .map(({ key, label }) => {
        const selected = INTRO_CONFIDENCE_LEVELS.find(
          (level) => level.key === introConfidence[key],
        );
        return `${label}: ${selected?.label.toLowerCase() ?? 'ikke vurdert'}`;
      })
      .join('; ');
    void saveIntroAnswer(
      'Vi har vurdert tryggheten slik: ' + summary + '.',
      'Bra utgangspunkt! La oss jobbe for at du skal bli enda tryggere på alle sammen! Hvordan liker du best å lære ting?',
      'learning_style',
      {
        confidence: Object.fromEntries(
          confidenceTopics.map(({ key }) => [key, introConfidence[key]]),
        ),
      },
    );
  }

  function submitIntroText() {
    const value = introDraft.trim();
    if (!value || isTutorReplying) return;
    if (introTextMode === 'goal_other') {
      setIntroTextMode(null);
      void saveIntroAnswer(
        `Annet mål: ${value}`,
        'Kult, det skal vi få til sammen! Hvordan føler du at du ligger an nå, i følgende temaer?',
        'confidence',
        { goal: 'other', goalOther: value },
      );
    } else if (introTextMode === 'frequency_other') {
      setIntroTextMode(null);
      void saveIntroAnswer(
        `Annet ønsket antall ganger: ${value}`,
        'Det høres bra ut. Hvor lange liker du at øktene er?',
        'duration',
        { sessionsPerWeek: 'other', sessionsPerWeekOther: value },
      );
    } else if (introTextMode === 'schedule') {
      setIntroTextMode(null);
      void saveIntroAnswer(
        value,
        'Herlig! Da er vi snart i mål. Det jeg lurer på til sist, er hva du jobber med på skolen for tiden? Og har du noen prøver eller vurderinger dere jobber mot?',
        'school',
        { schedule: value },
      );
    } else if (introTextMode === 'school') {
      setIntroTextMode(null);
      void saveIntroAnswer(
        value,
        'Supert! Da føler jeg at vi har ganske god kontroll her, dette kommer til å bli bra! Har dere noen lekser dere vil jobbe med?',
        'homework',
        { schoolWork: value },
      );
    } else if (introTextMode === 'homework') {
      setIntroTextMode(null);
      void finishIntro(
        value,
        'Supert! Da kjører vi en kort mini-økt med dette først. Lim gjerne inn eller forklar den første oppgaven i chatten.',
        { homework: value },
      );
    }
    setIntroDraft('');
  }

  const toggleGeometry = () => {
    setGeometry(true);
    setTutorError('');
    setMessages([
      {
        id: 'visual-tutor-geometry-1',
        role: 'tutor',
        text: 'Hva vet du om sidene i en rettvinklet trekant?',
        status: 'sent',
      },
      {
        id: 'visual-student-geometry-1',
        role: 'student',
        text: 'Er det a² + b² = c²?',
        status: 'sent',
      },
      {
        id: 'visual-tutor-geometry-2',
        role: 'tutor',
        text: 'Nettopp. Hvilke tall setter du inn?',
        status: 'sent',
      },
    ]);
  };
  return (
    <div className="app-shell session-shell">
      <TopBar
        back
        backHref="/home"
        title={
          usesConversationFixture
            ? geometry
              ? 'Geometri'
              : 'Likninger'
            : 'Matteøkt'
        }
        timerLabel={
          <SessionTimer
            ended={sessionEnded}
            initialSeconds={
              usesConversationFixture ? 18 * 60 + 42 : sessionDuration * 60
            }
            running={!visualTest && isSessionLive}
            startedAt={sessionStartedAt}
          />
        }
      />
      <main className="page-wrap session-page">
        <div className="session-top">
          <SessionTimeline
            plan={sessionPlan}
            activePhase={activePhase}
            activeTask={activeTask ?? null}
          />
          <div
            className={`task-prompt-stage${taskCardTask || incomingTaskCard ? ' has-task-card' : ''}`}
          >
            {taskCardTask || incomingTaskCard ? (
              <>
                {taskCardTask ? (
                  <TaskCard
                    key={taskCardTask.id}
                    task={taskCardTask}
                    tasks={tasks}
                    className={incomingTaskCard ? 'is-exiting' : ''}
                    showGeometry={usesConversationFixture && geometry}
                    showCompletion={completedTask?.id === taskCardTask.id}
                  />
                ) : null}
                {incomingTaskCard ? (
                  <TaskCard
                    key={incomingTaskCard.id}
                    task={incomingTaskCard}
                    tasks={tasks}
                    className="is-entering"
                    showGeometry={usesConversationFixture && geometry}
                  />
                ) : null}
              </>
            ) : tasks.length ? (
              <section className="task-complete" aria-live="polite">
                <Icon name="check" /> Alle oppgavene er ferdige
              </section>
            ) : null}
          </div>
        </div>
        <div className="chat-log" aria-live="polite" ref={chatLogRef}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <span className="mattis-glyph" aria-label="Mattis">
                <i />
                <i />
                <i />
                <i />
              </span>
              <div>
                <strong>Hva vil du jobbe med?</strong>
                <span>Skriv en oppgave eller still et mattespørsmål.</span>
              </div>
            </div>
          ) : null}
          {messages.map((message) => (
            <div
              className={`message-row ${message.role === 'student' ? 'student' : ''} ${message.status === 'failed' ? 'failed' : ''}`}
              key={message.id}
            >
              {message.role === 'tutor' ? (
                <>
                  <span className="mattis-glyph" aria-label="Mattis">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <div className="message-stack">
                    <p className="bubble">
                      <MathText text={message.text} />
                    </p>
                    {message.kind === 'session_opening' &&
                    planReviewPending &&
                    sessionPlan ? (
                      <InlinePlanProposal
                        plan={sessionPlan}
                        onAccept={() => void savePlanReview()}
                        onApplyChange={(change) => void savePlanReview(change)}
                      />
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="bubble">
                  {message.hasAttachment ? (
                    <span className="attachment-chip">
                      <Icon name="camera" size={16} /> Utregning sendt
                    </span>
                  ) : null}
                  {message.text ? <MathText text={message.text} /> : null}
                </p>
              )}
            </div>
          ))}
          {isTutorReplying ? (
            <div
              className="message-row tutor-pending"
              aria-label="Mattis tenker"
            >
              <span className="mattis-glyph" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <p className="bubble typing-bubble">
                <span />
                <span />
                <span />
              </p>
            </div>
          ) : null}
          {safetyLevel ? (
            <aside
              className={`safety-chat-card ${safetyLevel}${safetyTrustedAdultOnly ? ' trusted-adult-only' : ''}`}
              role="alert"
            >
              <strong>
                {safetyChildConsentRequired
                  ? 'Vil du at en forelder skal få en beskjed?'
                  : safetyTrustedAdultOnly
                    ? 'Snakk med en annen trygg voksen'
                    : safetyLevel === 'urgent'
                      ? 'Få hjelp med en gang'
                      : 'Snakk med en trygg voksen'}
              </strong>
              <p>
                {safetyChildConsentRequired
                  ? 'Dette gjelder noe som kan være viktig å følge opp. Du bestemmer om jeg skal sende foreldrene en nøytral beskjed.'
                  : safetyTrustedAdultOnly
                    ? 'Hvis en forelder ikke føles trygg å gå til, kontakt en annen voksen du stoler på. Ved vold eller fare akkurat nå: ring 112.'
                    : safetyLevel === 'urgent'
                      ? 'Hvis du er i fare akkurat nå, ring 113. Du kan også ringe Alarmtelefonen for barn og unge på 116 111.'
                      : 'Det kan være godt å si fra til en voksen du stoler på. Mattis er her for matte, men du skal ikke stå alene med dette.'}
              </p>
              {safetyChildConsentRequired ? (
                <div className="safety-chat-links">
                  <button
                    type="button"
                    onClick={() => void respondToSafetyConsent(true)}
                  >
                    Ja, fortell foreldrene
                  </button>
                  <button
                    type="button"
                    onClick={() => void respondToSafetyConsent(false)}
                  >
                    Nei, jeg vil snakke med en annen voksen
                  </button>
                </div>
              ) : safetyTrustedAdultOnly ? (
                <div className="safety-chat-links">
                  <a href="tel:112">Ring 112</a>
                  <a href="tel:116111">Alarmtelefonen 116 111</a>
                  <a
                    href="https://alarmtelefonen.no/"
                    rel="noreferrer"
                    target="_blank"
                  >
                    Alarmtelefonen.no
                  </a>
                </div>
              ) : safetyLevel === 'urgent' ? (
                <div className="safety-chat-links">
                  <a href="tel:113">Ring 113</a>
                  <a href="tel:116111">Alarmtelefonen 116 111</a>
                </div>
              ) : null}
            </aside>
          ) : null}
          {showScheduleWidget ? (
            <ScheduleWidget durationMinutes={sessionDuration} embedded />
          ) : null}
          {setupStep === 'duration' ? (
            <div
              className="chat-options duration-options"
              aria-label="Velg hvor lenge økten skal vare"
            >
              {[25, 45, 60].map((minutes) => (
                <button
                  className="setup-option duration-option"
                  disabled={Boolean(setupStatus)}
                  key={minutes}
                  onClick={() => void chooseDuration(minutes)}
                  type="button"
                >
                  <strong>{minutes}</strong>
                  <span>min</span>
                </button>
              ))}
            </div>
          ) : null}
          {setupStep === 'homework' ? (
            <div className="chat-options" aria-label="Velg om du har lekser">
              <button
                className="setup-option"
                onClick={() => chooseHomework(true)}
                type="button"
              >
                Ja, jeg har lekser
              </button>
              <button
                className="setup-option secondary"
                onClick={() => chooseHomework(false)}
                type="button"
              >
                Nei, bare repetisjon
              </button>
            </div>
          ) : null}
          {setupStep === 'photos' ? (
            <div className="setup-upload-card">
              <div className="setup-upload-list" aria-live="polite">
                {setupFiles.map((file, index) => (
                  <span
                    className="setup-file"
                    key={`${file.name}-${file.lastModified}`}
                  >
                    Side {index + 1}
                    <button
                      aria-label={`Fjern bilde ${index + 1}`}
                      onClick={() =>
                        setSetupFiles((current) =>
                          current.filter((item) => item !== file),
                        )
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <label
                className="button secondary setup-upload-button"
                htmlFor="session-homework-photo"
              >
                <Icon name="camera" size={19} />
                {setupFiles.length
                  ? 'Legg til flere bilder'
                  : 'Ta bilde av leksene'}
              </label>
              <input
                className="file-input"
                id="session-homework-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                multiple
                disabled={setupFiles.length >= MAX_HOMEWORK_IMAGES}
                onChange={(event) => addSetupFiles(event.target.files)}
              />
              <button
                className="button primary"
                disabled={!setupFiles.length || Boolean(setupStatus)}
                onClick={() => void parseSetupHomework()}
                type="button"
              >
                Finn oppgavene <Icon name="arrow" />
              </button>
              <button
                className="text-button"
                onClick={() => void startLiveSession()}
                type="button"
              >
                Jeg har ingen lekser likevel
              </button>
            </div>
          ) : null}
          {setupStep === 'parsing' ? (
            <p className="setup-status" aria-live="polite">
              {setupStatus || 'Analyserer leksebildene …'}
            </p>
          ) : null}
          {setupStep === 'review' ? (
            <div className="chat-options">
              <button
                className="button primary"
                onClick={() => router.push(`/session/${sessionId}/review`)}
                type="button"
              >
                Se gjennom oppgavene <Icon name="arrow" />
              </button>
            </div>
          ) : null}
          {activePhase === 'intro' && !isTutorReplying && !isEndingSession ? (
            <div
              className="chat-options intro-options"
              aria-label="Bli litt kjent med Mattis"
            >
              {introStep === 'goal' ? (
                <>
                  <p className="chat-widget-label">
                    Hva er målet ditt i matte?
                  </p>
                  {[
                    ['Forsikre meg om at jeg består.', 'pass'],
                    ['Bli mindre stressa for prøver.', 'less_stress'],
                    [
                      'Heve karakterene mine fra middels til høye.',
                      'raise_grades',
                    ],
                  ].map(([label, value]) => (
                    <button
                      className="setup-option"
                      key={value}
                      onClick={() =>
                        void saveIntroAnswer(
                          label,
                          'Kult, det skal vi få til sammen! Hvordan føler du at du ligger an nå, i følgende temaer?',
                          'confidence',
                          { goal: value },
                        )
                      }
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    className="setup-option secondary"
                    onClick={() => setIntroTextMode('goal_other')}
                    type="button"
                  >
                    Annet (skriv selv)
                  </button>
                  {introTextMode === 'goal_other' ? (
                    <form
                      className="guided-text-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submitIntroText();
                      }}
                    >
                      <input
                        className="input"
                        value={introDraft}
                        onChange={(event) => setIntroDraft(event.target.value)}
                        placeholder="Hva ønsker du å få til?"
                        autoFocus
                      />
                      <button
                        className="button primary"
                        disabled={!introDraft.trim()}
                        type="submit"
                      >
                        Fortsett <Icon name="arrow" />
                      </button>
                    </form>
                  ) : null}
                </>
              ) : null}
              {introStep === 'confidence' ? (
                <fieldset className="intro-confidence-card">
                  <legend className="chat-widget-label">
                    Hvordan føler du at du ligger an i temaene?
                  </legend>
                  <p className="intro-confidence-help">
                    Velg ett nivå for hvert tema.
                  </p>
                  <div className="confidence-table-wrap">
                    <table className="confidence-table">
                      <thead>
                        <tr>
                          <th scope="col">Tema</th>
                          {INTRO_CONFIDENCE_LEVELS.map((level) => (
                            <th key={level.key} scope="col">
                              {level.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {confidenceTopics.map((topic) => (
                          <tr key={topic.key}>
                            <th scope="row">{topic.label}</th>
                            {INTRO_CONFIDENCE_LEVELS.map((level) => {
                              const inputId = `intro-confidence-${topic.key}-${level.key}`;
                              const selected =
                                introConfidence[topic.key] === level.key;
                              return (
                                <td key={level.key}>
                                  <label
                                    className={`confidence-choice${selected ? ' selected' : ''}`}
                                    htmlFor={inputId}
                                  >
                                    <input
                                      checked={selected}
                                      id={inputId}
                                      name={`intro-confidence-${topic.key}`}
                                      onChange={() =>
                                        setIntroConfidence((current) => ({
                                          ...current,
                                          [topic.key]: level.key,
                                        }))
                                      }
                                      type="radio"
                                    />
                                    <span>{level.label}</span>
                                  </label>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    className="button primary confidence-submit"
                    disabled={!introConfidenceComplete || isTutorReplying}
                    onClick={submitIntroConfidence}
                    type="button"
                  >
                    Fortsett <Icon name="arrow" />
                  </button>
                </fieldset>
              ) : null}
              {introStep === 'learning_style' ? (
                <>
                  <p className="chat-widget-label">
                    Hvordan liker du best å lære ting?
                  </p>
                  {[
                    ['Gi meg et eksempel først.', 'examples_first'],
                    [
                      'La meg prøve en gang selv, og hjelp meg om jeg trenger det.',
                      'try_first',
                    ],
                    [
                      'Jeg liker å utfordre meg selv med vanskelige oppgaver.',
                      'challenge',
                    ],
                    ['Jeg forstår best med praktiske eksempler.', 'practical'],
                  ].map(([label, value]) => (
                    <button
                      className="setup-option"
                      key={value}
                      onClick={() =>
                        void saveIntroAnswer(
                          label,
                          'Fint! Jeg skal huske det når vi jobber sammen videre. Når vi jobber sammen videre, vil du helst se på lekser sammen med meg, eller har du lyst til at vi skal utforske nye temaer sammen?',
                          'work_mode',
                          { learningStyle: value },
                        )
                      }
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </>
              ) : null}
              {introStep === 'work_mode' ? (
                <>
                  <p className="chat-widget-label">Lekser eller nye temaer?</p>
                  {[
                    ['Jeg vil helst se mest på lekser.', 'homework'],
                    [
                      'Jeg fikser lekser selv, la oss se på nye temaer.',
                      'new_topics',
                    ],
                    ['En god blanding høres bra ut.', 'mixed'],
                  ].map(([label, value]) => (
                    <button
                      className="setup-option"
                      key={value}
                      onClick={() =>
                        void saveIntroAnswer(
                          label,
                          'Supert! Hvor mange ganger i uka vil du at vi skal jobbe sammen?',
                          'frequency',
                          { workMode: value },
                        )
                      }
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </>
              ) : null}
              {introStep === 'frequency' ? (
                <>
                  <p className="chat-widget-label">
                    Hvor mange ganger i uka vil du at vi skal jobbe sammen?
                  </p>
                  {[
                    ['Én gang holder.', 1],
                    ['To ganger', 2],
                    ['Tre ganger.', 3],
                    ['Hver dag!', 7],
                  ].map(([label, value]) => (
                    <button
                      className="setup-option"
                      key={value}
                      onClick={() =>
                        void saveIntroAnswer(
                          String(label),
                          'Det høres bra ut. Hvor lange liker du at øktene er?',
                          'duration',
                          { sessionsPerWeek: value },
                        )
                      }
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    className="setup-option secondary"
                    onClick={() => setIntroTextMode('frequency_other')}
                    type="button"
                  >
                    Annet
                  </button>
                  {introTextMode === 'frequency_other' ? (
                    <form
                      className="guided-text-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submitIntroText();
                      }}
                    >
                      <input
                        className="input"
                        value={introDraft}
                        onChange={(event) => setIntroDraft(event.target.value)}
                        placeholder="Hvor ofte passer det?"
                        autoFocus
                      />
                      <button
                        className="button primary"
                        disabled={!introDraft.trim()}
                        type="submit"
                      >
                        Fortsett <Icon name="arrow" />
                      </button>
                    </form>
                  ) : null}
                </>
              ) : null}
              {introStep === 'duration' ? (
                <>
                  <p className="chat-widget-label">
                    Det høres bra ut. Hvor lange liker du at øktene er?
                  </p>
                  {[30, 60, 90, 120].map((minutes) => (
                    <button
                      className="setup-option"
                      key={minutes}
                      onClick={() =>
                        void saveIntroAnswer(
                          `${minutes === 60 ? 'En time' : `${minutes} minutter`}`,
                          'Vil du helst at vi skal sette faste tider, eller skal vi avtale fra gang til gang? Selv ville jeg anbefalt at vi bestemmer oss for noe fast, så kan vi alltid gjøre om senere!',
                          'schedule_mode',
                          { sessionMinutes: minutes },
                        )
                      }
                      type="button"
                    >
                      {minutes === 60 ? 'En time' : `${minutes} minutter`}
                    </button>
                  ))}
                </>
              ) : null}
              {introStep === 'schedule_mode' ? (
                <>
                  <p className="chat-widget-label">
                    Vil du helst at vi skal sette faste tider, eller skal vi
                    avtale fra gang til gang?
                  </p>
                  <button
                    className="setup-option"
                    onClick={() =>
                      void saveIntroAnswer(
                        'La oss sette noen faste tidspunkter',
                        'Den er god! Hvilke dager og tidspunkter kunne passet bra for deg?',
                        'schedule',
                        { scheduleMode: 'fixed' },
                      )
                    }
                    type="button"
                  >
                    La oss sette noen faste tidspunkter
                  </button>
                  <button
                    className="setup-option secondary"
                    onClick={() =>
                      void saveIntroAnswer(
                        'Jeg vil helst avtale i slutten av hver økt',
                        'Herlig! Da er vi snart i mål. Det jeg lurer på til sist, er hva du jobber med på skolen for tiden? Og har du noen prøver eller vurderinger dere jobber mot?',
                        'school',
                        { scheduleMode: 'flexible' },
                      )
                    }
                    type="button"
                  >
                    Jeg vil helst avtale i slutten av hver økt.
                  </button>
                </>
              ) : null}
              {introStep === 'schedule' ? (
                <>
                  <p className="chat-widget-label">
                    Hvilke dager og tidspunkter kunne passet bra for deg?
                  </p>
                  <button
                    className="setup-option"
                    onClick={() => setIntroTextMode('schedule')}
                    type="button"
                  >
                    Skriv dager og tidspunkter
                  </button>
                  {introTextMode === 'schedule' ? (
                    <form
                      className="guided-text-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submitIntroText();
                      }}
                    >
                      <textarea
                        className="input"
                        value={introDraft}
                        onChange={(event) => setIntroDraft(event.target.value)}
                        placeholder="For eksempel tirsdag kl. 18 og søndag kl. 11"
                        rows={3}
                        autoFocus
                      />
                      <button
                        className="button primary"
                        disabled={!introDraft.trim()}
                        type="submit"
                      >
                        Fortsett <Icon name="arrow" />
                      </button>
                    </form>
                  ) : null}
                </>
              ) : null}
              {introStep === 'school' ? (
                <>
                  <p className="chat-widget-label">
                    Hva jobber du med på skolen for tiden? Har du noen prøver
                    eller vurderinger dere jobber mot?
                  </p>
                  <button
                    className="setup-option"
                    onClick={() => setIntroTextMode('school')}
                    type="button"
                  >
                    Skriv litt om skolen
                  </button>
                  {introTextMode === 'school' ? (
                    <form
                      className="guided-text-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submitIntroText();
                      }}
                    >
                      <textarea
                        className="input"
                        value={introDraft}
                        onChange={(event) => setIntroDraft(event.target.value)}
                        placeholder="Tema, prøve eller vurdering"
                        rows={3}
                        autoFocus
                      />
                      <button
                        className="button primary"
                        disabled={!introDraft.trim()}
                        type="submit"
                      >
                        Fortsett <Icon name="arrow" />
                      </button>
                    </form>
                  ) : null}
                </>
              ) : null}
              {introStep === 'homework' ? (
                <>
                  <p className="chat-widget-label">
                    Har du noen lekser du vil jobbe med?
                  </p>
                  <button
                    className="setup-option"
                    onClick={() => setIntroTextMode('homework')}
                    type="button"
                  >
                    Ja, jeg har lekser
                  </button>
                  <button
                    className="setup-option secondary"
                    onClick={() =>
                      void finishIntro(
                        'Vi har ingen lekser akkurat nå.',
                        'Supert! Da kjører vi en kort mini-økt for å se hvordan dette fungerer. Hva har du lyst til å øve på?',
                        { homework: 'none' },
                      )
                    }
                    type="button"
                  >
                    Nei, vi har ikke lekser
                  </button>
                  {introTextMode === 'homework' ? (
                    <form
                      className="guided-text-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submitIntroText();
                      }}
                    >
                      <textarea
                        className="input"
                        value={introDraft}
                        onChange={(event) => setIntroDraft(event.target.value)}
                        placeholder="Beskriv leksene kort"
                        rows={3}
                        autoFocus
                      />
                      <button
                        className="button primary"
                        disabled={!introDraft.trim()}
                        type="submit"
                      >
                        Start mini-økt <Icon name="arrow" />
                      </button>
                    </form>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          {taskSetOffer ? (
            <div
              className="chat-options task-set-options"
              aria-label="Oppgavesett"
            >
              <button
                className="setup-option"
                disabled={isGeneratingTaskSet}
                onClick={() =>
                  taskSetSuggestion
                    ? void generateTaskSet(
                        taskSetOffer!,
                        true,
                        taskSetSuggestion.topic,
                      )
                    : askForTaskSetTopic(taskSetOffer)
                }
                type="button"
              >
                {taskSetSuggestion
                  ? 'Ja, lag et sett'
                  : 'Ja, hva skal vi øve på?'}
              </button>
              {!taskSetSuggestion && taskSetOffer === 'no_homework' ? (
                <button
                  className="setup-option"
                  disabled={isGeneratingTaskSet}
                  onClick={() =>
                    void generateTaskSet(
                      'no_homework',
                      true,
                      'en enkel oppvarming',
                    )
                  }
                  type="button"
                >
                  Start med en enkel oppvarming
                </button>
              ) : null}
              <button
                className="setup-option secondary"
                disabled={isGeneratingTaskSet}
                onClick={() => {
                  setTaskSetOffer(null);
                  setTaskSetSuggestion(null);
                  appendTutorTurn(
                    'Helt greit. Vi kan avslutte økten når du vil.',
                  );
                }}
                type="button"
              >
                Nei, takk
              </button>
            </div>
          ) : null}
        </div>
        <div
          className={`session-controls${activePhase === 'intro' ? ' guided-intro-controls' : ''}`}
        >
          {tutorError ? (
            <div className="tutor-error" role="alert">
              <span>{tutorError}</span>
              {failedMessage ? (
                <button
                  disabled={isTutorReplying || isEndingSession}
                  onClick={() => void send(failedMessage)}
                  type="button"
                >
                  Prøv igjen
                </button>
              ) : null}
            </div>
          ) : null}
          {setupStatus && setupStep !== 'parsing' ? (
            <p className="setup-status" aria-live="polite">
              {setupStatus}
            </p>
          ) : null}
          {isSessionLive ? (
            <>
              {chatImage ? (
                <div className="composer-attachment">
                  <Icon name="camera" size={17} />
                  <span>Bilde av utregning klart</span>
                  <button
                    type="button"
                    aria-label="Fjern bilde av utregning"
                    onClick={() => setChatImage(null)}
                    disabled={isTutorReplying}
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <div className="composer">
                <label
                  className="composer-attach"
                  htmlFor="session-chat-photo"
                  aria-label="Ta bilde eller legg ved utregning"
                >
                  <Icon name="camera" size={20} />
                </label>
                <input
                  className="file-input"
                  id="session-chat-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.currentTarget.value = '';
                    if (!file) return;
                    if (
                      !['image/jpeg', 'image/png', 'image/webp'].includes(
                        file.type,
                      )
                    ) {
                      setTutorError('Bruk JPG, PNG eller WebP.');
                      return;
                    }
                    if (file.size > 6 * 1024 * 1024) {
                      setTutorError('Bildet må være under 6 MB.');
                      return;
                    }
                    setTutorError('');
                    setChatImage(file);
                  }}
                  disabled={
                    isTutorReplying ||
                    isEndingSession ||
                    isGeneratingTaskSet ||
                    sessionEnded ||
                    Boolean(failedMessage)
                  }
                />
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void send();
                  }}
                  placeholder={
                    isEndingSession
                      ? 'Avslutter økten …'
                      : sessionEnded
                        ? 'Økten er avsluttet'
                        : failedMessage
                          ? 'Prøv den siste meldingen igjen'
                          : 'Skriv eller spør Mattis'
                  }
                  aria-label="Skriv eller spør Mattis"
                  disabled={
                    isTutorReplying ||
                    isEndingSession ||
                    isGeneratingTaskSet ||
                    sessionEnded ||
                    Boolean(failedMessage)
                  }
                />
                <button
                  className="send-button"
                  type="button"
                  aria-label="Send melding"
                  disabled={
                    (!draft.trim() && !chatImage) ||
                    isTutorReplying ||
                    isEndingSession ||
                    isGeneratingTaskSet ||
                    sessionEnded ||
                    Boolean(failedMessage)
                  }
                  onClick={() => void send()}
                >
                  <Icon name="send" size={22} />
                </button>
              </div>
              {usesConversationFixture && !geometry ? (
                <button
                  className="button secondary"
                  disabled={isTutorReplying}
                  type="button"
                  onClick={toggleGeometry}
                >
                  Neste oppgave <Icon name="arrow" />
                </button>
              ) : usesConversationFixture ? (
                <Link
                  className="button primary"
                  href={`/session/${sessionId ?? 'demo'}/summary`}
                >
                  Se oppsummering <Icon name="arrow" />
                </Link>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function defaultScheduleDate() {
  const date = new Date(Date.now() + 86_400_000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function ScheduleWidget({
  durationMinutes = 45,
  embedded = false,
}: {
  durationMinutes?: number;
  embedded?: boolean;
}) {
  const [mode, setMode] = useState<'next' | 'weekly'>('next');
  const [date, setDate] = useState(defaultScheduleDate);
  const [time, setTime] = useState('17:00');
  const [weekday, setWeekday] = useState('2');
  const [duration, setDuration] = useState(String(durationMinutes));
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function saveSchedule() {
    setIsSaving(true);
    setError('');
    setStatus('');
    const body =
      mode === 'next'
        ? {
            mode,
            plannedAt: new Date(`${date}T${time}:00`).toISOString(),
            durationMinutes: Number(duration),
          }
        : {
            mode,
            weekday: Number(weekday),
            localTime: time,
            durationMinutes: Number(duration),
          };
    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        schedule?: { startsAt?: string };
      };
      if (!response.ok || !result.schedule?.startsAt) {
        throw new Error(result.error ?? 'Tidspunktet kunne ikke lagres.');
      }
      const notification = await requestPwaReminder(result.schedule.startsAt);
      const confirmation = `Vår neste økt er planlagt ${formatNextSession(result.schedule.startsAt)}.`;
      setStatus(
        notification === 'push'
          ? `${confirmation} Du får et varsel selv om appen er lukket.`
          : notification === 'granted'
            ? `${confirmation} Denne enheten minner deg på økten.`
            : `${confirmation} Avtalen ligger på hjem-skjermen. Du kan slå på varsler i nettleseren når du vil.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Tidspunktet kunne ikke lagres.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      className={`card schedule-card${embedded ? ' chat-schedule-card' : ''}`}
      aria-labelledby="schedule-title"
    >
      <p className="eyebrow">Neste steg</p>
      <h2 id="schedule-title">Når passer det å jobbe videre?</h2>
      <p className="secondary-text">
        Mattis legger neste økt på hjem-skjermen. Du velger tidspunktet – resten
        av planen kan Mattis justere etter hva dere rekker.
      </p>
      <div className="schedule-mode" role="group" aria-label="Velg type avtale">
        <button
          className={mode === 'next' ? 'active' : ''}
          onClick={() => setMode('next')}
          type="button"
        >
          Neste økt
        </button>
        <button
          className={mode === 'weekly' ? 'active' : ''}
          onClick={() => setMode('weekly')}
          type="button"
        >
          Fast hver uke
        </button>
      </div>
      <div className="schedule-fields">
        {mode === 'weekly' ? (
          <div className="input-group">
            <label htmlFor="schedule-weekday">Ukedag</label>
            <select
              className="select"
              id="schedule-weekday"
              value={weekday}
              onChange={(event) => setWeekday(event.target.value)}
            >
              <option value="1">Mandag</option>
              <option value="2">Tirsdag</option>
              <option value="3">Onsdag</option>
              <option value="4">Torsdag</option>
              <option value="5">Fredag</option>
              <option value="6">Lørdag</option>
              <option value="7">Søndag</option>
            </select>
          </div>
        ) : (
          <div className="input-group">
            <label htmlFor="schedule-date">Dato</label>
            <input
              className="input"
              id="schedule-date"
              min={defaultScheduleDate()}
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
          </div>
        )}
        <div className="schedule-field-row">
          <div className="input-group">
            <label htmlFor="schedule-time">Klokkeslett</label>
            <input
              className="input"
              id="schedule-time"
              onChange={(event) => setTime(event.target.value)}
              type="time"
              value={time}
            />
          </div>
          <div className="input-group">
            <label htmlFor="schedule-duration">Varighet</label>
            <select
              className="select"
              id="schedule-duration"
              onChange={(event) => setDuration(event.target.value)}
              value={duration}
            >
              {[25, 45, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {error ? (
        <p className="form-message" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="schedule-success" role="status">
          {status}
        </p>
      ) : null}
      <button
        className="button primary"
        disabled={isSaving}
        onClick={() => void saveSchedule()}
        type="button"
      >
        {isSaving
          ? 'Lagrer tidspunkt …'
          : status
            ? 'Avtal en ny økt'
            : 'Avtal økt'}
        {!isSaving && !status ? <Icon name="calendar" /> : null}
      </button>
    </section>
  );
}

function SummaryScreen({
  initialSummary,
  sessionId = 'demo',
}: {
  initialSummary?: SummaryScreenData;
  sessionId?: string;
}) {
  const [summary, setSummary] = useState(initialSummary?.summary ?? '');
  const [completedTasks, setCompletedTasks] = useState(
    initialSummary?.completedTasks ?? 0,
  );
  const [totalTasks, setTotalTasks] = useState(initialSummary?.totalTasks ?? 0);
  const [isFinished, setIsFinished] = useState(
    initialSummary?.status === 'completed',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  async function finishSession() {
    setIsSaving(true);
    setError('');
    const response = await fetch(`/api/sessions/${sessionId}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      summary?: string | null;
      completedTasks?: number;
      totalTasks?: number;
    };
    if (!response.ok) {
      setError(result.error ?? 'Økten kunne ikke avsluttes.');
      setIsSaving(false);
      return;
    }
    setSummary(result.summary ?? 'Økten er lagret.');
    setCompletedTasks(result.completedTasks ?? 0);
    setTotalTasks(result.totalTasks ?? 0);
    setIsFinished(true);
    setIsSaving(false);
  }

  return (
    <div className="app-shell has-bottom-nav">
      <TopBar />
      <main className="page-wrap narrow app-content">
        <section className="summary-hero">
          <p className="eyebrow">
            {isFinished ? 'Økten er ferdig' : 'Rund av økten'}
          </p>
          <h1>{isFinished ? 'Godt jobba.' : 'Før vi avslutter.'}</h1>
          <p>
            {isFinished
              ? summary || 'Økten og fremgangen din er lagret.'
              : 'Jeg lagrer læringssignalene fra økten og bruker dem til å planlegge et godt neste steg.'}
          </p>
        </section>
        {isFinished ? (
          <>
            <section className="card progress-card">
              <span className="summary-check">
                <Icon name="check" size={28} />
              </span>
              <h2>Fremgangen er lagret</h2>
              <p className="secondary-text" style={{ marginBottom: 0 }}>
                {totalTasks
                  ? `${completedTasks} av ${totalTasks} oppgaver ble fullført.`
                  : 'Mattis bruker samtalen når neste økt planlegges.'}
              </p>
            </section>
          </>
        ) : null}
        <div className="sticky-cta">
          {error ? (
            <p className="form-message" role="alert">
              {error}
            </p>
          ) : null}
          {isFinished ? (
            <Link className="button primary" href="/home">
              Tilbake til hjem <Icon name="arrow" />
            </Link>
          ) : (
            <button
              className="button primary"
              disabled={isSaving}
              onClick={() => void finishSession()}
              type="button"
            >
              {isSaving ? 'Lagrer …' : 'Avslutt og lagre'}
              {!isSaving ? <Icon name="arrow" /> : null}
            </button>
          )}
        </div>
      </main>
      <BottomNav active="progress" />
    </div>
  );
}

function BillingScreen({
  initialBilling,
}: {
  initialBilling: BillingScreenData;
}) {
  const router = useRouter();
  const onboarding = initialBilling.onboarding === true;
  const [billing, setBilling] = useState(initialBilling.billing);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function openCheckout() {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/billing/checkout${onboarding ? '?onboarding=1' : ''}`,
        {
          method: 'POST',
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url)
        throw new Error(result.error ?? 'Betalingen kunne ikke åpnes.');
      window.location.assign(result.url);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Betalingen kunne ikke åpnes.',
      );
      setIsLoading(false);
    }
  }

  async function openPortal() {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const result = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url)
        throw new Error(result.error ?? 'Abonnementssiden kunne ikke åpnes.');
      window.location.assign(result.url);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Abonnementssiden kunne ikke åpnes.',
      );
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!onboarding || !billing.hasAccess) return;
    router.replace('/home');
  }, [billing.hasAccess, onboarding, router]);

  useEffect(() => {
    if (!initialBilling.checkoutStatus) return;
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const refreshBilling = async () => {
      const response = await fetch('/api/billing/status', {
        cache: 'no-store',
      }).catch(() => null);
      if (cancelled) return;
      const result = response
        ? ((await response.json().catch(() => ({}))) as {
            billing?: ClientBillingStatus;
          })
        : {};
      if (result.billing) setBilling(result.billing);
      attempts += 1;
      if (!cancelled && !result.billing?.hasAccess && attempts < 10) {
        timer = window.setTimeout(() => void refreshBilling(), 1200);
      }
    };

    void refreshBilling();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [initialBilling.checkoutStatus]);

  const trialDate = billing.trialEnd
    ? new Intl.DateTimeFormat('nb-NO', { dateStyle: 'long' }).format(
        new Date(billing.trialEnd),
      )
    : null;

  return (
    <div className="app-shell">
      <TopBar
        back
        backHref={onboarding ? '/onboarding' : '/parent'}
        title="Abonnement"
      />
      <main className="page-wrap narrow app-content billing-page">
        <p className="eyebrow">Foreldrekonto</p>
        <h1>
          {onboarding ? 'Aktiver Mattis for familien.' : 'Mattis for familien.'}
        </h1>
        {onboarding ? (
          <p className="secondary-text">
            Start med sju dager gratis. Dere legger inn betalingsmåte nå, men
            blir først belastet etter prøveuken.
          </p>
        ) : null}
        {initialBilling.checkoutStatus === 'success' && !billing.hasAccess ? (
          <p className="form-message" role="status">
            Betalingen er mottatt. Vi aktiverer prøveuken nå – last siden på
            nytt om et øyeblikk hvis tilgangen ikke vises med en gang.
          </p>
        ) : null}
        {initialBilling.checkoutStatus === 'cancelled' ? (
          <p className="secondary-text">
            Ingen betaling ble gjennomført. Du kan starte prøveuken når det
            passer.
          </p>
        ) : null}
        {billing.hasAccess ? (
          <section className="card billing-status-card">
            <p className="eyebrow">
              {billing.status === 'trialing'
                ? 'Prøveuke aktiv'
                : 'Abonnement aktivt'}
            </p>
            <h2>
              {billing.status === 'trialing'
                ? 'Dere prøver Mattis gratis.'
                : 'Dere har tilgang til Mattis.'}
            </h2>
            <p className="secondary-text">
              {billing.status === 'trialing' && trialDate
                ? `Prøveperioden varer til ${trialDate}. Første betaling skjer etter dette. Når som helst kan dere endre eller avslutte abonnementet.`
                : 'Betaling, kvitteringer og oppsigelse håndteres trygt hos Stripe.'}
            </p>
            <button
              className="button secondary"
              disabled={isLoading}
              onClick={() => void openPortal()}
              type="button"
            >
              Administrer abonnement
            </button>
          </section>
        ) : (
          <section className="card billing-offer-card">
            <p className="eyebrow">7 dager gratis</p>
            <h2>Prøv Mattis i en hel uke.</h2>
            <p className="secondary-text">
              Foresatt legger inn betalingsmåte ved oppstart, men blir ikke
              belastet før prøveuken er over. Dere får tilgang til alle økter og
              elevprofiler med én gang.
            </p>
            <div className="billing-price-list">
              <div>
                <strong>249 kr/mnd</strong>
                <span>første elevprofil</span>
              </div>
              {initialBilling.learnerCount > 1 ? (
                <div>
                  <strong>149 kr/mnd</strong>
                  <span>per ekstra elevprofil</span>
                </div>
              ) : null}
            </div>
            <button
              className="button primary"
              disabled={isLoading}
              onClick={() => void openCheckout()}
              type="button"
            >
              {isLoading ? 'Åpner Stripe …' : 'Start gratis prøveuke'}
              {!isLoading ? <Icon name="arrow" /> : null}
            </button>
          </section>
        )}
        {error ? (
          <p className="form-message" role="alert">
            {error}
          </p>
        ) : null}
        <Link
          className="text-button"
          href={onboarding ? '/onboarding' : '/profiles'}
        >
          {onboarding ? 'Tilbake til elevprofil' : 'Tilbake til elevprofiler'}
        </Link>
      </main>
    </div>
  );
}

function ProgressScreen({
  initialProgress,
}: {
  initialProgress?: ProgressScreenData;
}) {
  const progress = initialProgress ?? {
    displayName: 'Nora',
    overview: {
      gradeLevel: 10,
      totalTopics: 0,
      startedTopics: 0,
      groups: [],
    },
  };
  const { overview } = progress;
  const gradeLabel = overview.gradeLevel
    ? `for ${overview.gradeLevel}. trinn`
    : 'for relevante trinn';

  return (
    <div className="app-shell has-bottom-nav">
      <TopBar />
      <main className="page-wrap app-content progress-page">
        <section className="progress-hero">
          <p className="eyebrow">Fremgang</p>
          <h1>Dette har du fått tak på.</h1>
          <p>
            Mattis bygger oversikten gradvis fra det dere faktisk jobber med.
            Den viser ikke en karakter, men hva som virker trygt, hva som er på
            vei, og hva dere ikke har øvd på ennå.
          </p>
        </section>

        <section
          className="card progress-overview-card"
          aria-labelledby="progress-overview-title"
        >
          <div className="progress-overview-heading">
            <div>
              <p className="eyebrow">Læreplanoversikt</p>
              <h2 id="progress-overview-title">Matematikk {gradeLabel}</h2>
            </div>
            <span className="progress-count">
              {overview.startedTopics}/{overview.totalTopics}
            </span>
          </div>
          <p className="secondary-text">
            {overview.startedTopics === 0
              ? 'Når dere begynner å jobbe med et tema, dukker det opp mestringsbevis her.'
              : `${overview.startedTopics} av ${overview.totalTopics} temaer har læringsbevis fra øktene dine.`}
          </p>
        </section>

        <div className="progress-groups">
          {overview.groups.map((group) => (
            <section className="progress-group" key={group.id}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Temaområde</p>
                  <h2>{group.label}</h2>
                </div>
                <span className="secondary-text">
                  {group.topics.length} temaer
                </span>
              </div>
              <div className="progress-topic-list">
                {group.topics.map((topic) => {
                  const percent =
                    topic.mastery === null
                      ? 0
                      : Math.round(topic.mastery * 100);
                  return (
                    <article className="progress-topic" key={topic.conceptKey}>
                      <div className="progress-topic-heading">
                        <div className="progress-topic-copy">
                          <h3>{topic.title}</h3>
                          {topic.description ? (
                            <p>{topic.description}</p>
                          ) : null}
                        </div>
                        <span className={`mastery-status ${topic.status}`}>
                          {topic.statusLabel}
                        </span>
                      </div>
                      <div
                        aria-label={`${topic.title}: ${topic.mastery === null ? 'ikke startet' : `${percent} prosent`}`}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={percent}
                        className={`mastery-bar ${topic.status}`}
                        role="progressbar"
                      >
                        <span style={{ width: `${percent}%` }} />
                      </div>
                      <div className="progress-topic-footer">
                        <span>
                          {topic.mastery === null
                            ? 'Ikke nok øving ennå'
                            : `${percent}% · ${topic.evidenceCount} læringsbevis`}
                        </span>
                        {topic.gradeMin ? (
                          <span>Fra {topic.gradeMin}. trinn</span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {!overview.totalTopics ? (
          <section className="card progress-empty-card">
            <h2>Vi finner læreplantemaene dine snart.</h2>
            <p className="secondary-text">
              Prøv å laste inn siden på nytt om litt.
            </p>
          </section>
        ) : null}
      </main>
      <BottomNav active="progress" />
    </div>
  );
}

function PrivacyScreen() {
  const router = useRouter();
  return (
    <div className="app-shell">
      <TopBar />
      <main className="page-wrap narrow app-content">
        <p className="eyebrow">Innstillinger</p>
        <h1>Data og personvern</h1>
        <p className="secondary-text">
          Dette er en lukket test. Økter og chatmeldinger lagres slik at du kan
          fortsette samtalen senere.
        </p>
        <section className="card section">
          <div className="section-heading">
            <h2>Din demo</h2>
            <Icon name="target" />
          </div>
          <p className="secondary-text">
            Nora · 10. trinn · 120 minutter i uken
          </p>
          <div className="button-row">
            <button className="button secondary" type="button">
              Eksporter data
            </button>
            <button className="button ghost" type="button">
              Slett demo
            </button>
          </div>
        </section>
        <div className="sticky-cta">
          <Link className="button primary" href="/home">
            Tilbake til hjem
          </Link>
          <SignOutButton />
        </div>
      </main>
    </div>
  );
}

export default function MattisApp({
  screen,
  initialGeometry = false,
  initialHome,
  initialProfile,
  initialBilling,
  initialProgress,
  initialProfiles,
  initialReview,
  initialSession,
  initialSummary,
  sessionId,
  visualTest = false,
}: {
  screen: Screen;
  initialGeometry?: boolean;
  initialHome?: HomeScreenData;
  initialProfile?: OnboardingProfileData;
  initialBilling?: BillingScreenData;
  initialProgress?: ProgressScreenData;
  initialProfiles?: ProfileChooserData;
  initialReview?: ReviewScreenData;
  initialSession?: SessionScreenData;
  initialSummary?: SummaryScreenData;
  sessionId?: string;
  visualTest?: boolean;
}) {
  if (screen === 'entry') return <EntryScreen />;
  if (screen === 'profiles')
    return (
      <ProfileChooser initialProfiles={initialProfiles ?? { learners: [] }} />
    );
  if (screen === 'onboarding')
    return <OnboardingScreen initialProfile={initialProfile} />;
  if (screen === 'home') return <HomeScreen initialHome={initialHome} />;
  if (screen === 'billing') {
    return (
      <BillingScreen
        initialBilling={
          initialBilling ?? {
            billing: {
              status: 'inactive',
              hasAccess: false,
              trialEnd: null,
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
            },
            learnerCount: 1,
          }
        }
      />
    );
  }
  if (screen === 'progress')
    return <ProgressScreen initialProgress={initialProgress} />;
  if (screen === 'new') return <NewSessionScreen />;
  if (screen === 'capture') return <CaptureScreen sessionId={sessionId} />;
  if (screen === 'review')
    return <ReviewScreen initialReview={initialReview} sessionId={sessionId} />;
  if (screen === 'session') {
    return (
      <SessionScreen
        initialGeometry={initialGeometry}
        initialSession={initialSession}
        sessionId={sessionId}
        visualTest={visualTest}
      />
    );
  }
  if (screen === 'summary') {
    return (
      <SummaryScreen initialSummary={initialSummary} sessionId={sessionId} />
    );
  }
  return <PrivacyScreen />;
}
