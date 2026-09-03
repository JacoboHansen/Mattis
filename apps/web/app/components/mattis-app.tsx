'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
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
  hasFigure?: boolean;
  figureAlt?: string | null;
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
  tasks: Array<
    Pick<SessionTaskData, 'id' | 'text' | 'label'> & {
      hasFigure?: boolean;
      figureAlt?: string | null;
    }
  >;
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
    planMessageNb: string | null;
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

function requestsHomework(text: string) {
  const homeworkTerms =
    '(?:lekse(?:r|n|ne)?|leksa|skoleoppgaver?|skolearbeidet|oppgaver fra skolen)';
  if (
    new RegExp(
      `\\b(?:ikke|ingen|uten)\\b[\\s\\S]{0,32}\\b${homeworkTerms}\\b`,
      'i',
    ).test(text)
  ) {
    return false;
  }
  return (
    new RegExp(
      `\\b(?:vil|skal|må|kan vi|har|har lyst til|ønsker å|jobbe med|gjøre|ta|se på|starte med|begynne med|hjelp(?:e)? meg med)\\b[\\s\\S]{0,60}\\b${homeworkTerms}\\b`,
      'i',
    ).test(text) ||
    new RegExp(
      `\\b${homeworkTerms}\\b[\\s\\S]{0,60}\\b(?:jobbe|gjøre|ta|se på|starte|begynne|hjelp|sende|vise)\\b`,
      'i',
    ).test(text)
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
      'Hei! Hyggelig å se deg igjen. Klar for litt matte?';
    const openingMessagesNb = [
      openingNb,
      ...(sessionSuggestion?.planMessageNb
        ? [sessionSuggestion.planMessageNb]
        : []),
    ];
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
          openingMessagesNb,
          planSnapshot: {
            version: 'session-plan.v0.2',
            mode: home.isFirstSession ? 'getting_to_know' : 'suggested',
            openingNb,
            introMinutes: sessionSuggestion?.introMinutes ?? 0,
            reasonNb: sessionSuggestion?.reasonNb ?? null,
            previousNextTopicNb: sessionSuggestion?.previousNextTopicNb ?? null,
            focusConcepts: sessionSuggestion?.focusConcepts ?? [],
            homeworkMinutes: sessionSuggestion?.hom