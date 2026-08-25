'use client';

import Link from 'next/link';
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
import type { ProgressOverview } from '../../lib/progress';
import MathText from './math-text';

const MAX_HOMEWORK_IMAGES = 10;

type ApiResult = {
  error?: string;
  destination?: string;
  authenticated?: boolean;
  learner?: { id: string };
};

type TutorApiResult = {
  reply?: string;
  error?: string;
  taskState?:
    | 'in_progress'
    | 'awaiting_answer'
    | 'checking'
    | 'ready_to_complete'
    | 'completed'
    | 'needs_human_review';
  expectedStudentAction?: string;
  suggestedActions?: string[];
};

type TaskSetOfferReason = 'no_homework' | 'more_practice';

type TaskSetSuggestion = {
  topic: string;
  label: string;
};

type SessionOpeningMode = 'suggested' | 'homework' | 'custom' | 'getting_to_know' | 'scheduled';

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
};

type SetupStep = 'duration' | 'homework' | 'photos' | 'parsing' | 'review' | 'active';
type IntroStep = 'focus' | 'style' | 'rhythm' | 'done';

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
  segmentType?: 'intro' | 'homework' | 'review' | 'new_topic' | 'mixed' | 'summary';
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
};

export type BillingScreenData = {
  billing: ClientBillingStatus;
  learnerCount: number;
  checkoutStatus?: 'success' | 'cancelled' | null;
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

export type HomeScreenData = {
  displayName: string;
  isFirstSession: boolean;
  gradeLevel: number | null;
  weeklyGoalMinutes: number;
  minutesThisWeek: number;
  activeSession: HomeSessionData | null;
  recommendation: {
    title: string;
    conceptKey: string;
    estimate: number;
    lastPracticedAt: string | null;
  } | null;
  suggestion: {
    openingNb: string;
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
    /\b(?:kan du|jeg vil)\b[\s\S]*\b(?:øve|trene)\b[\s\S]*\b(?:på|med)\b/i.test(text)
  );
}

function requestsSessionEnd(text: string) {
  if (/\bikke\b[\s\S]{0,20}\b(?:avslutte|avslutt|stoppe|stop)\b/i.test(text)) return false;
  return (
    /\b(?:avslutte|avslutt|runde av|stoppe|stop|bli ferdig med)\b[\s\S]{0,40}\b(?:økt|økta|økten|i dag)\b/i.test(
      text,
    ) ||
    /\b(?:økt|økta|økten)\b[\s\S]{0,30}\b(?:avslutte|avslutt|runde av|stoppe|stop)\b/i.test(text)
  );
}

function taskDisplayLabel(task: Pick<SessionTaskData, 'label'>, fallbackIndex: number) {
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
    return blob ? new File([blob], 'utregning.jpg', { type: 'image/jpeg' }) : file;
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
        <Link className="icon-button" href="/profiles" aria-label="Bytt elevprofil">
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
          Math.ceil((Date.parse(startedAt) + initialSeconds * 1_000 - Date.now()) / 1_000),
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
  }).format(new Date(value));
}

function homeSessionStatus(status: string) {
  if (status === 'active') return 'Pågående økt';
  if (status === 'reviewing') return 'Klar for oppsummering';
  if (status === 'planned') return 'Ikke startet ennå';
  if (status === 'capturing' || status === 'parsing') return 'Gjør økten klar';
  return 'Matteøkt';
}

function getTaskSetSuggestion(plan: SessionPlanData | null): TaskSetSuggestion | null {
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
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const home = initialHome ?? {
    displayName: 'Nora',
    isFirstSession: false,
    gradeLevel: 10,
    weeklyGoalMinutes: 120,
    minutesThisWeek: 0,
    activeSession: null,
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
  const weeklyProgress = Math.min(100, Math.round((home.minutesThisWeek / weeklyGoal) * 100));
  const weekday = new Intl.DateTimeFormat('nb-NO', { weekday: 'long' }).format(new Date());
  const gradeLabel = home.gradeLevel ? ` · ${home.gradeLevel}. trinn` : '';

  async function startSession(initialMessage: string) {
    if (!home.billing.hasAccess) {
      router.push('/billing');
      return;
    }
    setIsStarting(true);
    setError('');
    const openingNb =
      sessionSuggestion?.openingNb ??
      'Jeg foreslår at vi ser på litt lekser hvis du har det, og så finner vi et tema som passer i dag.';
    const message = initialMessage.trim();
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationMinutes: 45,
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
            timeline: sessionSuggestion?.timeline ?? [],
          },
        }),
      });
      const result = (await response.json().catch(() => ({}))) as SessionApiResult;
      if (!response.ok || !result.id) {
        throw new Error(result.error ?? 'Vi klarte ikke å starte økten.');
      }
      if (message) {
        await fetchWithSessionRefresh('/api/tutor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: result.id,
            clientMessageId: crypto.randomUUID(),
            messages: [{ role: 'student', content: message }],
          }),
        }).catch(() => undefined);
      }
      router.push(`/session/${result.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Vi klarte ikke å starte økten.');
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
              {activeSession ? 'Mattis husker hvor dere slapp.' : 'Klar for litt matte?'}
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
                {activeSession
                  ? activeSession.status === 'active'
                    ? 'Fortsett økten'
                    : 'Gjør økten klar'
                  : 'Dagens økt'}
              </strong>
              <span className="dot"> · </span>
              <span>{activeSession?.durationMinutes ?? 45} min</span>
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
                        ? `Planlagt ${formatHomeDate(activeSession.plannedAt)}`
                        : 'Økten venter på deg'}
                  </span>
                </div>
                <span className="timeline-time">{activeSession.durationMinutes} min</span>
              </div>
              <div className="timeline-item">
                <span className="timeline-icon">
                  <Icon name="target" />
                </span>
                <div className="timeline-copy">
                  <strong>{recommendation ? recommendation.title : 'Tilpasset øving'}</strong>
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
              <div className="mattis-plan-message">
                <span className="mattis-glyph" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <p>
                  {sessionSuggestion?.openingNb ??
                    'Jeg foreslår at vi ser på litt lekser hvis du har det, og så finner vi et tema som passer i dag.'}
                </p>
              </div>
              <form
                className="composer home-start-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (draft.trim() && !isStarting) void startSession(draft);
                }}
              >
                <input
                  aria-label="Skriv til Mattis"
                  disabled={isStarting}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={isStarting ? 'Starter økt …' : 'Skriv til Mattis …'}
                  type="text"
                  value={draft}
                />
                <button
                  aria-label="Start økt og send melding"
                  className="send-button"
                  disabled={!draft.trim() || isStarting}
                  type="submit"
                >
                  <Icon name="send" size={21} />
                </button>
              </form>
            </div>
            )
          ) : (
            <div className="billing-inline-prompt">
              <p className="eyebrow">Prøv Mattis gratis i 7 dager</p>
              <h2>Kom i gang med en prøveuke.</h2>
              <p className="secondary-text">
                Foresatt legger inn betalingsmåte i Stripe. Dere blir ikke belastet før prøveuken er
                over, og abonnementet kan avsluttes når som helst.
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
                  : activeSession.status === 'active'
                    ? 'Fortsett økt'
                    : 'Åpne økt'}
                {!isStarting ? <Icon name="arrow" /> : null}
              </button>
              <p className="next-session">
                <Icon name="calendar" />
                {homeSessionStatus(activeSession.status)}
              </p>
            </>
          ) : null}
        </section>

        <section className="card home-progress-card" aria-labelledby="home-progress-title">
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
          <section className="home-history" aria-labelledby="home-history-title">
            <div className="home-card-heading">
              <div>
                <p className="eyebrow">Historikk</p>
                <h2 id="home-history-title">Siste økter</h2>
              </div>
              <span className="secondary-text">{home.recentSessions.length}</span>
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
                    <strong>{formatHomeDate(session.endedAt ?? session.startedAt)}</strong>
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
      if (!response.ok) throw new Error(result.error ?? 'Vi klarte ikke å sende koden.');
      setStage('code');
      setMessage(`Koden er sendt til ${email}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Vi klarte ikke å sende koden.');
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
      if (!response.ok) throw new Error(result.error ?? 'Vi klarte ikke å logge deg inn.');
      router.replace(result.destination ?? '/onboarding');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Vi klarte ikke å logge deg inn.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="app-shell entry-shell">
      <main className="page-wrap narrow entry-page">
        <section className="intro-card">
          <Brand />
          <div className="intro-art" aria-hidden="true" />
          <div className="intro-copy">
            <p className="eyebrow">En roligere mattetime</p>
            <h1>
              Matte, ett steg av gangen<span className="coral-period">.</span>
            </h1>
            <p>Logg inn for å fortsette i Mattis.</p>
          </div>
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
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
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
            <button className="button primary" disabled={isLoading} type="submit">
              {isLoading ? 'Et øyeblikk …' : stage === 'email' ? 'Send kode' : 'Logg inn'}
              {!isLoading ? <Icon name="arrow" /> : null}
            </button>
          </form>
          <p className="helper-text">Lukket test · Bare invitert e-post</p>
        </section>
      </main>
    </div>
  );
}

function ProfileChooser({ initialProfiles }: { initialProfiles: ProfileChooserData }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [courseCode, setCourseCode] = useState('');

  function handleGradeChange(value: string) {
    setGradeLevel(value);
    const stage = CURRICULUM_STAGES.find((item) => item.value === Number(value));
    setCourseCode(stage?.courseCodes[0] ?? '');
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
      if (!response.ok) throw new Error(result.error ?? 'Vi klarte ikke å bytte profil.');
      router.replace(result.destination ?? '/home');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Vi klarte ikke å bytte profil.');
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
        }),
      });
      const result = await readApiResult(response);
      if (!response.ok || !result.learner) {
        throw new Error(result.error ?? 'Vi klarte ikke å legge til eleven.');
      }
      await chooseProfile(result.learner.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Vi klarte ikke å legge til eleven.');
      setIsLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <TopBar />
      <main className="page-wrap narrow app-content profile-chooser">
        <p className="eyebrow">Familiekonto</p>
        <h1>Hvem skal jobbe med Mattis?</h1>
        <p className="secondary-text">Velg en elevprofil for å fortsette der dere slapp.</p>
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
            <button className="button primary" disabled={isLoading} type="submit">
              {isLoading ? 'Lagrer …' : 'Fortsett med profilen'}
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

function OnboardingScreen({ initialProfile }: { initialProfile?: OnboardingProfileData }) {
  const [displayName, setDisplayName] = useState(initialProfile?.displayName || 'Nora');
  const [gradeLevel, setGradeLevel] = useState(
    initialProfile?.gradeLevel ? String(initialProfile.gradeLevel) : '10',
  );
  const [courseCode, setCourseCode] = useState(initialProfile?.courseCode ?? 'MAT01-06');
  const [goal, setGoal] = useState('120 minutter');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const identityComplete = initialProfile?.identityComplete ?? false;

  function handleGradeChange(value: string) {
    setGradeLevel(value);
    const stage = CURRICULUM_STAGES.find((item) => item.value === Number(value));
    setCourseCode(stage?.courseCodes[0] ?? '');
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
        }),
      });
      const result = await readApiResult(response);
      if (!response.ok) throw new Error(result.error ?? 'Vi klarte ikke å lagre profilen.');
      router.replace('/home');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Vi klarte ikke å lagre profilen.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <TopBar />
      <main className="page-wrap narrow app-content">
        <p className="eyebrow">Første steg</p>
        <h1>Bli kjent med Mattis</h1>
        <p className="secondary-text">
          Vi bruker dette til å gjøre øktene passe korte og relevante. Når profilen er klar, kan
          foresatt starte en gratis prøveuke.
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
                  <label htmlFor="name">Hva vil du kalles?</label>
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
                  <label htmlFor="stage">Trinn</label>
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
            <div className="input-group" style={{ marginBottom: 0 }}>
              <span className="input-group label">Ukesmål</span>
              <div className="choice-grid" role="radiogroup" aria-label="Velg ukesmål">
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
                        {item === '120 minutter'
                          ? 'Passe for en god rytme'
                          : 'Du kan endre dette senere'}
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
          <div className="sticky-cta">
            <button className="button primary" disabled={isLoading} type="submit">
              {isLoading ? 'Lagrer …' : 'Lagre og fortsett'}
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
      const result = (await response.json().catch(() => ({}))) as SessionApiResult;
      if (!response.ok || !result.id) {
        throw new Error(result.error ?? 'Vi klarte ikke å starte økten.');
      }
      router.push(`/session/${result.id}/capture`);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Vi klarte ikke å starte økten.');
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
        <div className="choice-grid section" role="radiogroup" aria-label="Velg øktlengde">
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
                <span>{item === '45 minutter' ? 'Lekser + repetisjon' : 'Fokusert mattetid'}</span>
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
        setError(`Du kan legge til opptil ${MAX_HOMEWORK_IMAGES} bilder per økt.`);
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
      const response = await fetch(`/api/sessions/${sessionId}/homework/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadIds }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Oppgavene kunne ikke tolkes.');
      router.push(`/session/${sessionId}/review`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Noe gikk galt. Prøv igjen.');
      setStatus('');
      setIsWorking(false);
    }
  }

  async function startWithoutHomework() {
    setIsWorking(true);
    setError('');
    const response = await fetch(`/api/sessions/${sessionId}/start`, { method: 'POST' });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
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
        <p className="secondary-text">Ta bilde av oppgavene, så lager vi en ryddig liste sammen.</p>
        <section className="capture-box section">
          <span className="upload-icon">
            <Icon name="camera" size={27} />
          </span>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>Ta bilde eller velg fra mobilen</h2>
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
            <div className="upload-item" key={`${file.name}-${file.lastModified}`}>
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
                onClick={() => setFiles((current) => current.filter((item) => item !== file))}
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
        body: JSON.stringify({ tasks: tasks.map((task) => ({ id: task.id, text: task.text })) }),
      });
      const reviewResult = (await reviewResponse.json().catch(() => ({}))) as { error?: string };
      if (!reviewResponse.ok) {
        throw new Error(reviewResult.error ?? 'Oppgavene kunne ikke lagres.');
      }
      const startResponse = await fetch(`/api/sessions/${sessionId}/start`, { method: 'POST' });
      const startResult = (await startResponse.json().catch(() => ({}))) as { error?: string };
      if (!startResponse.ok) throw new Error(startResult.error ?? 'Økten kunne ikke startes.');
      router.push(`/session/${sessionId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Noe gikk galt. Prøv igjen.');
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
          Sjekk oppgavene før vi starter. Du kan skrive om eller fjerne en oppgave.
        </p>
        <div className="review-list section">
          {tasks.map((task, index) => (
            <div className="task-edit" key={task.id}>
              <span className="task-number" title={taskDisplayLabel(task, index)}>
                {task.label?.trim() || index + 1}
              </span>
              <div className="task-edit-body">
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
                        taskIndex === index ? { ...item, text: event.target.value } : item,
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
                  setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index))
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
            {isStarting ? 'Planlegger økten …' : tasks.length ? 'Start økten' : 'Start uten lekser'}
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
      <path d="M70 245H470V65Z" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M438 245v-30h32" fill="none" stroke="currentColor" strokeWidth="3" />
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
  return (
    <section
      className={`task-prompt task-prompt-card ${className}${showCompletion ? ' has-completion' : ''}`}
      aria-labelledby={taskId}
      aria-live={showCompletion ? 'polite' : undefined}
    >
      {showCompletion ? (
        <span className="task-card-completion" role="status" aria-label="Oppgave fullført">
          <Icon name="check" size={30} />
        </span>
      ) : null}
      <div className="task-prompt-heading">
        <span>{task.phase === 'homework' ? 'Lekse' : 'Repetisjon'}</span>
        <span>
          {taskDisplayLabel(task, Math.max(index, 0))} · {Math.max(index + 1, 1)} av{' '}
          {allTasks.length}
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
  const matchingIndex = items.findIndex(
    (item) =>
      item.phase === activePhase &&
      (item.phase !== 'repetition' || !activeConcept || item.conceptKey === activeConcept),
  );
  const activeIndex =
    matchingIndex >= 0 ? matchingIndex : activePhase === 'summary' ? items.length - 1 : 0;
  const progress = items.length <= 1 ? 0 : (activeIndex / (items.length - 1)) * 100;

  return (
    <div className="session-timeline" aria-label="Foreslått plan for økten">
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
          ? 'duration'
          : 'active';
  const [setupStep, setSetupStep] = useState<SetupStep>(initialSetupStep);
  const [sessionDuration, setSessionDuration] = useState(initialSession?.durationMinutes ?? 45);
  const [sessionStartedAt, setSessionStartedAt] = useState(initialSession?.startedAt ?? null);
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
          text: initialGeometry ? 'Hvor lang er hypotenusen?' : 'Løs \\(2(x - 3) = 4x + 6\\)',
          label: initialGeometry ? '7b' : '4a',
          phase: 'homework',
          status: 'in_progress',
          taskType: initialGeometry ? 'geometry' : 'equation',
          conceptKeys: [initialGeometry ? 'geometry.pythagoras' : 'algebra.equations'],
        },
      ];
    }
    return [];
  });
  const [taskCardTask, setTaskCardTask] = useState<SessionTaskData | null>(
    () => tasks.find((task) => !['completed', 'skipped'].includes(task.status)) ?? null,
  );
  const [incomingTaskCard, setIncomingTaskCard] = useState<SessionTaskData | null>(null);
  const taskCardTaskRef = useRef<SessionTaskData | null>(taskCardTask);
  const taskCardTimersRef = useRef<number[]>([]);
  const initialOpeningMode =
    !visualTest && initialSession?.status === 'active' && initialSession.planSnapshot?.mode
      ? initialSession.planSnapshot.mode
      : null;
  const initialTaskSetTopicNeeded: TaskSetOfferReason | null =
    !visualTest &&
    initialSession?.status === 'active' &&
    initialSession.tasks.length === 0 &&
    !initialOpeningMode
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
          text: 'Hvor lenge vil dere jobbe i dag?',
          status: 'sent',
        },
      ];
    }
    if (initialSession?.status === 'capturing') {
      return [
        {
          id: 'setup-tutor-photos',
          role: 'tutor',
          text: 'Har dere lekser dere vil ta bilde av før vi begynner?',
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

    const storedMessages: ChatMessage[] | undefined = initialSession?.messages.map((message) => ({
      ...message,
      status: 'sent',
    }));
    if (!storedMessages?.length) {
      const opening = initialSession?.planSnapshot?.openingNb?.trim();
      const initialMessages: ChatMessage[] = opening
        ? [{ id: 'session-opening', role: 'tutor', text: opening, status: 'sent' }]
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
  const [justCompletedTaskId, setJustCompletedTaskId] = useState<string | null>(null);
  const [sessionPlan, setSessionPlan] = useState<SessionPlanData | null>(
    initialSession?.planSnapshot ?? null,
  );
  const [openingMode, setOpeningMode] = useState<SessionOpeningMode | null>(initialOpeningMode);
  const [currentPhase, setCurrentPhase] = useState(initialSession?.currentPhase ?? 'summary');
  const [introStep, setIntroStep] = useState<IntroStep>('focus');
  const initialTaskSetSuggestion = initialTaskSetTopicNeeded
    ? getTaskSetSuggestion(initialSession?.planSnapshot ?? null)
    : null;
  const [taskSetOffer, setTaskSetOffer] = useState<TaskSetOfferReason | null>(
    initialTaskSetSuggestion ? initialTaskSetTopicNeeded : null,
  );
  const [taskSetSuggestion, setTaskSetSuggestion] = useState<TaskSetSuggestion | null>(
    initialTaskSetSuggestion,
  );
  const [taskSetTopicNeeded, setTaskSetTopicNeeded] = useState<TaskSetOfferReason | null>(
    initialTaskSetSuggestion ? null : initialTaskSetTopicNeeded,
  );
  const [isGeneratingTaskSet, setIsGeneratingTaskSet] = useState(false);
  const [hasGeneratedTaskSet, setHasGeneratedTaskSet] = useState(false);
  const [tutorError, setTutorError] = useState(() =>
    !visualTest && initialSession?.messages.at(-1)?.role === 'student'
      ? 'Mattis mangler et svar på den siste meldingen.'
      : '',
  );
  const failedMessage = messages.findLast((message) => message.status === 'failed');
  const sessionEnded =
    initialSession?.status === 'completed' || initialSession?.status === 'cancelled';
  const activeTask = tasks.find((task) => !['completed', 'skipped'].includes(task.status));
  const activeTaskIndex = activeTask ? tasks.findIndex((task) => task.id === activeTask.id) : -1;
  const activePhase = activeTask?.phase ?? currentPhase;
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
      setIncomingTaskCard(nextTask);

      const swapTimer = window.setTimeout(() => {
        taskCardTaskRef.current = nextTask;
        setTaskCardTask(nextTask);
        setIncomingTaskCard(null);
      }, 520);
      taskCardTimersRef.current.push(swapTimer);
    }, pauseAfterCheck);
    taskCardTimersRef.current.push(startTimer);

    return () => {
      for (const timer of taskCardTimersRef.current) window.clearTimeout(timer);
      taskCardTimersRef.current = [];
    };
  }, [activeTask, justCompletedTaskId]);

  function appendSetupTurn(studentText: string, tutorText: string) {
    const turnId = crypto.randomUUID();
    setMessages((items) => [
      ...items,
      { id: `setup-student-${turnId}`, role: 'student', text: studentText, status: 'sent' },
      { id: `setup-tutor-${turnId}`, role: 'tutor', text: tutorText, status: 'sent' },
    ]);
  }

  function appendTutorTurn(text: string) {
    setMessages((items) => [
      ...items,
      { id: `tutor-local-${crypto.randomUUID()}`, role: 'tutor', text, status: 'sent' },
    ]);
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
        body: JSON.stringify({ durationMinutes }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Økttiden kunne ikke lagres.');
      setSessionDuration(durationMinutes);
      setSetupStep('homework');
      setSetupStatus('');
      appendSetupTurn(
        `${durationMinutes} minutter`,
        'Har dere lekser dere vil ta bilde av før vi begynner?',
      );
    } catch (caught) {
      setSetupStatus('');
      setTutorError(caught instanceof Error ? caught.message : 'Økttiden kunne ikke lagres.');
    }
  }

  async function startLiveSession(hasHomework = false) {
    setSetupStatus('Gjør økten klar …');
    setTutorError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/start`, { method: 'POST' });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        session?: { startedAt?: string | null };
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
      if (!response.ok) throw new Error(result.error ?? 'Økten kunne ikke startes.');
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
                result.previousNextTopicNb ?? returnedPlan?.previousNextTopicNb ?? null,
            }
          : null;
      setSessionPlan(planWithMemory);
      const suggestion = getTaskSetSuggestion(planWithMemory);
      if (suggestion && !startedTasks.length) setTaskSetSuggestion(suggestion);
      setSessionStartedAt(result.session?.startedAt ?? new Date().toISOString());
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
      );
      if (!hasHomework && startedTasks.length === 0) {
        if (suggestion) setTaskSetOffer('no_homework');
        else setTaskSetTopicNeeded('no_homework');
      }
    } catch (caught) {
      setSetupStatus('');
      setTutorError(caught instanceof Error ? caught.message : 'Økten kunne ikke startes.');
    }
  }

  function chooseHomework(hasHomework: boolean) {
    if (hasHomework) {
      setSetupStep('photos');
      appendSetupTurn(
        'Ja, jeg har lekser',
        'Last opp ett eller flere bilder, så finner jeg oppgavene sammen med deg.',
      );
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
    const uploadResponse = await fetch(result.signedUrl, { method: 'PUT', body: form });
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
        setSetupStatus(`Laster opp bilde ${index + 1} av ${setupFiles.length} …`);
        uploadIds.push(await prepareSetupUpload(file));
      }
      setSetupStatus('Finner oppgavene …');
      const response = await fetch(`/api/sessions/${sessionId}/homework/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadIds }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        taskCount?: number;
      };
      if (!response.ok) throw new Error(result.error ?? 'Oppgavene kunne ikke tolkes.');
      setSetupStep('review');
      setSetupStatus('');
      appendSetupTurn(
        `${setupFiles.length} leksebilder`,
        `Jeg fant ${result.taskCount ?? 'flere'} oppgaver. La oss sjekke at alt ser riktig ut før vi starter.`,
      );
    } catch (caught) {
      setSetupStep('photos');
      setSetupStatus('');
      setTutorError(caught instanceof Error ? caught.message : 'Oppgavene kunne ikke tolkes.');
    }
  }

  async function generateTaskSet(reason: TaskSetOfferReason, announce = true, topic = '') {
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
      const response = await fetchWithSessionRefresh('/api/sessions/' + sessionId + '/task-set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, topic: topic.trim().slice(0, 240) }),
      });
      const result = (await response.json().catch(() => ({}))) as TaskSetApiResult;
      if (!response.ok || !result.tasks?.length) {
        throw new Error(result.error ?? 'Oppgavesettet kunne ikke lages akkurat nå.');
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
          'Jeg har laget ' + result.tasks.length + ' oppgaver. Vi tar én om gangen.',
      );
    } catch (caught) {
      setSetupStatus('');
      setTutorError(caught instanceof Error ? caught.message : 'Oppgavesettet kunne ikke lages.');
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
      const response = await fetchWithSessionRefresh(`/api/sessions/${sessionId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Økten kunne ikke avsluttes.');
      router.push(`/session/${sessionId}/summary`);
      router.refresh();
    } catch (error) {
      setIsEndingSession(false);
      setTutorError(error instanceof Error ? error.message : 'Økten kunne ikke avsluttes.');
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

    const clientMessageId = retryMessage?.clientMessageId ?? crypto.randomUUID();
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
        ? items.map((message) => (message.id === retryMessage.id ? studentMessage : message))
        : [...items, studentMessage],
    );
    if (!retryMessage) setDraft('');
    setTutorError('');
    setIsTutorReplying(true);

    try {
      if (!wantsToEndSession && !activeTask && !attachedImage && taskSetTopicNeeded) {
        setMessages((items) =>
          items.map((message) =>
            message.id === studentMessage.id ? { ...message, status: 'sent' as const } : message,
          ),
        );
        const reason = taskSetTopicNeeded;
        const suggestedTopic =
          taskSetSuggestion &&
          /^(ja|gjerne|ok|okei|det gjør vi|la oss gjøre det)\b/i.test(studentText)
            ? taskSetSuggestion.topic
            : studentText;
        await generateTaskSet(reason, false, suggestedTopic);
        return;
      }

      if (!wantsToEndSession && !activeTask && !attachedImage && requestsTaskSet(studentText)) {
        setMessages((items) =>
          items.map((message) =>
            message.id === studentMessage.id ? { ...message, status: 'sent' as const } : message,
          ),
        );
        askForTaskSetTopic('more_practice');
        return;
      }

      if (visualTest) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        setMessages((items) => [
          ...items.map((message) =>
            message.id === studentMessage.id ? { ...message, status: 'sent' as const } : message,
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
      const result = (await response.json().catch(() => ({}))) as TutorApiResult;

      if (!response.ok || !result.reply?.trim()) {
        throw new Error(result.error ?? 'Mattis klarte ikke å svare akkurat nå.');
      }

      setMessages((items) => [
        ...items.map((message) =>
          message.id === studentMessage.id ? { ...message, status: 'sent' as const } : message,
        ),
        {
          id: `tutor-${clientMessageId}`,
          role: 'tutor',
          text: result.reply!.trim(),
          status: 'sent',
        },
      ]);
      if (attachedImage) setChatImage(null);
      if (wantsToEndSession || result.suggestedActions?.includes('end_session')) {
        await endSessionEarly();
        return;
      }
      if (!activeTask && result.suggestedActions?.includes('create_task_set')) {
        offerTaskSet(tasks.length ? 'more_practice' : 'no_homework', false);
      }
      if (activePhase === 'intro' && introStep === 'rhythm') {
        setIntroStep('done');
        setCurrentPhase('homework');
        setOpeningMode(null);
        appendTutorTurn(
          'Da har jeg litt bedre peiling på hvordan vi kan jobbe sammen. Nå kan vi ta leksene dine, eller finne et lite oppgavesett ut fra det du vil øve på.',
        );
        if (!tasks.length) setTaskSetTopicNeeded('no_homework');
      }
      if (activeTask && result.taskState === 'completed') {
        setJustCompletedTaskId(activeTask.id);
        setTasks((current) =>
          current.map((task) =>
            task.id === activeTask.id ? { ...task, status: 'completed' } : task,
          ),
        );
        const hasRemainingTasks = tasks.some(
          (task) => task.id !== activeTask.id && !['completed', 'skipped'].includes(task.status),
        );
        if (!hasRemainingTasks) offerTaskSet('more_practice');
      } else if (activeTask && result.taskState) {
        setTasks((current) =>
          current.map((task) =>
            task.id === activeTask.id
              ? {
                  ...task,
                  status: ['checking', 'ready_to_complete', 'needs_human_review'].includes(
                    result.taskState!,
                  )
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
          message.id === studentMessage.id ? { ...message, status: 'failed' } : message,
        ),
      );
      setTutorError(
        error instanceof Error ? error.message : 'Mattis klarte ikke å svare akkurat nå.',
      );
    } finally {
      setIsTutorReplying(false);
    }
  };
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
        backHref={isSessionLive ? `/session/${sessionId ?? 'demo'}/summary` : '/home'}
        title={usesConversationFixture ? (geometry ? 'Geometri' : 'Likninger') : 'Matteøkt'}
        timerLabel={
          <SessionTimer
            ended={sessionEnded}
            initialSeconds={usesConversationFixture ? 18 * 60 + 42 : sessionDuration * 60}
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
          <div className="task-prompt-stage">
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
                  <p className="bubble">
                    <MathText text={message.text} />
                  </p>
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
            <div className="message-row tutor-pending" aria-label="Mattis tenker">
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
              <button className="setup-option" onClick={() => chooseHomework(true)} type="button">
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
                  <span className="setup-file" key={`${file.name}-${file.lastModified}`}>
                    Side {index + 1}
                    <button
                      aria-label={`Fjern bilde ${index + 1}`}
                      onClick={() =>
                        setSetupFiles((current) => current.filter((item) => item !== file))
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
                {setupFiles.length ? 'Legg til flere bilder' : 'Ta bilde av leksene'}
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
              <button className="text-button" onClick={() => void startLiveSession()} type="button">
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
            <div className="chat-options intro-options" aria-label="Bli litt kjent med Mattis">
              {introStep === 'focus' ? (
                <>
                  <p className="chat-widget-label">Hva har du mest lyst til å bli bedre på?</p>
                  {[
                    ['Brøk og desimaltall', 'Jeg vil gjerne bli bedre på brøk og desimaltall.'],
                    ['Likninger', 'Jeg vil gjerne bli bedre på likninger.'],
                    ['Funksjoner', 'Jeg vil gjerne bli bedre på funksjoner.'],
                    [
                      'Noe annet / vet ikke ennå',
                      'Jeg vet ikke helt ennå – vi kan finne ut av det sammen.',
                    ],
                  ].map(([label, value]) => (
                    <button
                      className="setup-option"
                      key={label}
                      onClick={() => {
                        setIntroStep('style');
                        void send(undefined, value);
                      }}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </>
              ) : null}
              {introStep === 'style' ? (
                <>
                  <p className="chat-widget-label">Hva hjelper deg mest når du lærer?</p>
                  {[
                    ['Et eksempel først', 'Jeg liker å se et eksempel først.'],
                    ['Prøve selv først', 'Jeg liker å prøve selv først.'],
                    ['Steg for steg', 'Jeg liker at vi tar det rolig og steg for steg.'],
                    ['Litt av begge deler', 'Jeg liker litt av begge deler.'],
                  ].map(([label, value]) => (
                    <button
                      className="setup-option"
                      key={label}
                      onClick={() => {
                        setIntroStep('rhythm');
                        void send(undefined, value);
                      }}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </>
              ) : null}
              {introStep === 'rhythm' ? (
                <>
                  <p className="chat-widget-label">
                    Hvor ofte passer det best å jobbe litt med matte?
                  </p>
                  {[
                    ['Én gang i uka', 'Jeg tror én matteøkt i uka passer best.'],
                    ['To ganger i uka', 'Jeg tror to matteøkter i uka passer best.'],
                    [
                      'Tre eller flere',
                      'Jeg vil gjerne jobbe med matte tre eller flere ganger i uka.',
                    ],
                    [
                      'Vet ikke ennå',
                      'Jeg vet ikke hvor ofte ennå – vi kan finne en rytme sammen.',
                    ],
                  ].map(([label, value]) => (
                    <button
                      className="setup-option"
                      key={label}
                      onClick={() => void send(undefined, value)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
          {taskSetOffer ? (
            <div className="chat-options task-set-options" aria-label="Oppgavesett">
              <button
                className="setup-option"
                disabled={isGeneratingTaskSet}
                onClick={() =>
                  taskSetSuggestion
                    ? void generateTaskSet(taskSetOffer!, true, taskSetSuggestion.topic)
                    : askForTaskSetTopic(taskSetOffer)
                }
                type="button"
              >
                {taskSetSuggestion ? 'Ja, lag et sett' : 'Ja, hva skal vi øve på?'}
              </button>
              <button
                className="setup-option secondary"
                disabled={isGeneratingTaskSet}
                onClick={() => {
                  setTaskSetOffer(null);
                  setTaskSetSuggestion(null);
                  appendTutorTurn('Helt greit. Vi kan avslutte økten når du vil.');
                }}
                type="button"
              >
                Nei, takk
              </button>
            </div>
          ) : null}
        </div>
        <div className="session-controls">
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
              <button
                className="stuck-link"
                disabled={
                  isTutorReplying ||
                  isEndingSession ||
                  isGeneratingTaskSet ||
                  sessionEnded ||
                  Boolean(failedMessage)
                }
                type="button"
                onClick={() => setDraft('Jeg står fast på dette steget')}
              >
                <Icon name="help" />
                Jeg står fast
              </button>
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
                    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
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
                <Link className="button primary" href={`/session/${sessionId ?? 'demo'}/summary`}>
                  Se oppsummering <Icon name="arrow" />
                </Link>
              ) : (
                <Link className="session-end-link" href={`/session/${sessionId}/summary`}>
                  Avslutt økten
                </Link>
              )}
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

function ScheduleWidget({ durationMinutes = 45 }: { durationMinutes?: number }) {
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
        : { mode, weekday: Number(weekday), localTime: time, durationMinutes: Number(duration) };
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
      setStatus(
        notification === 'push'
          ? 'Avtalen er lagret. Du får et varsel selv om appen er lukket.'
          : notification === 'granted'
            ? 'Avtalen er lagret. Denne enheten minner deg på økten.'
          : 'Avtalen er lagret på hjem-skjermen. Du kan slå på varsler i nettleseren når du vil.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Tidspunktet kunne ikke lagres.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="card schedule-card" aria-labelledby="schedule-title">
      <p className="eyebrow">Neste steg</p>
      <h2 id="schedule-title">Når passer det å jobbe videre?</h2>
      <p className="secondary-text">
        Mattis legger neste økt på hjem-skjermen. Du velger tidspunktet – resten av planen kan
        Mattis justere etter hva dere rekker.
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
        {isSaving ? 'Lagrer tidspunkt …' : 'Avtal økt'}
        {!isSaving ? <Icon name="calendar" /> : null}
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
  const [completedTasks, setCompletedTasks] = useState(initialSummary?.completedTasks ?? 0);
  const [totalTasks, setTotalTasks] = useState(initialSummary?.totalTasks ?? 0);
  const [isFinished, setIsFinished] = useState(initialSummary?.status === 'completed');
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
          <p className="eyebrow">{isFinished ? 'Økten er ferdig' : 'Rund av økten'}</p>
          <h1>{isFinished ? 'Godt jobbet.' : 'Før vi avslutter.'}</h1>
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
            <ScheduleWidget durationMinutes={initialSummary?.durationMinutes ?? 45} />
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

function BillingScreen({ initialBilling }: { initialBilling: BillingScreenData }) {
  const [billing, setBilling] = useState(initialBilling.billing);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function openCheckout() {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/billing/checkout', { method: 'POST' });
      const result = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? 'Betalingen kunne ikke åpnes.');
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Betalingen kunne ikke åpnes.');
      setIsLoading(false);
    }
  }

  async function openPortal() {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const result = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? 'Abonnementssiden kunne ikke åpnes.');
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Abonnementssiden kunne ikke åpnes.');
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!initialBilling.checkoutStatus) return;
    const timer = window.setTimeout(() => {
      void fetch('/api/billing/status', { cache: 'no-store' })
        .then((response) => response.json())
        .then((result: { billing?: ClientBillingStatus }) => {
          if (result.billing) setBilling(result.billing);
        })
        .catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [initialBilling.checkoutStatus]);

  const trialDate = billing.trialEnd
    ? new Intl.DateTimeFormat('nb-NO', { dateStyle: 'long' }).format(new Date(billing.trialEnd))
    : null;

  return (
    <div className="app-shell">
      <TopBar back backHref="/parent" title="Abonnement" />
      <main className="page-wrap narrow app-content billing-page">
        <p className="eyebrow">Foreldrekonto</p>
        <h1>Mattis for familien.</h1>
        {initialBilling.checkoutStatus === 'success' && !billing.hasAccess ? (
          <p className="form-message" role="status">
            Betalingen er mottatt. Vi aktiverer prøveuken nå – last siden på nytt om et øyeblikk hvis
            tilgangen ikke vises med en gang.
          </p>
        ) : null}
        {initialBilling.checkoutStatus === 'cancelled' ? (
          <p className="secondary-text">Ingen betaling ble gjennomført. Du kan starte prøveuken når det passer.</p>
        ) : null}
        {billing.hasAccess ? (
          <section className="card billing-status-card">
            <p className="eyebrow">{billing.status === 'trialing' ? 'Prøveuke aktiv' : 'Abonnement aktivt'}</p>
            <h2>{billing.status === 'trialing' ? 'Dere prøver Mattis gratis.' : 'Dere har tilgang til Mattis.'}</h2>
            <p className="secondary-text">
              {billing.status === 'trialing' && trialDate
                ? `Prøveperioden varer til ${trialDate}. Første betaling skjer etter dette. Når som helst kan dere endre eller avslutte abonnementet.`
                : 'Betaling, kvitteringer og oppsigelse håndteres trygt hos Stripe.'}
            </p>
            <button className="button secondary" disabled={isLoading} onClick={() => void openPortal()} type="button">
              Administrer abonnement
            </button>
          </section>
        ) : (
          <section className="card billing-offer-card">
            <p className="eyebrow">7 dager gratis</p>
            <h2>Prøv Mattis i en hel uke.</h2>
            <p className="secondary-text">
              Foresatt legger inn betalingsmåte ved oppstart, men blir ikke belastet før prøveuken er over.
              Dere får tilgang til alle økter og elevprofiler med én gang.
            </p>
            <div className="billing-price-list">
              <div><strong>249 kr/mnd</strong><span>første elevprofil</span></div>
              {initialBilling.learnerCount > 1 ? (
                <div><strong>149 kr/mnd</strong><span>per ekstra elevprofil</span></div>
              ) : null}
            </div>
            <button className="button primary" disabled={isLoading} onClick={() => void openCheckout()} type="button">
              {isLoading ? 'Åpner Stripe …' : 'Start gratis prøveuke'}
              {!isLoading ? <Icon name="arrow" /> : null}
            </button>
          </section>
        )}
        {error ? <p className="form-message" role="alert">{error}</p> : null}
        <Link className="text-button" href="/profiles">Tilbake til elevprofiler</Link>
      </main>
    </div>
  );
}

function ProgressScreen({ initialProgress }: { initialProgress?: ProgressScreenData }) {
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
            Mattis bygger oversikten gradvis fra det dere faktisk jobber med. Den viser ikke en
            karakter, men hva som virker trygt, hva som er på vei, og hva dere ikke har øvd på ennå.
          </p>
        </section>

        <section className="card progress-overview-card" aria-labelledby="progress-overview-title">
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
                <span className="secondary-text">{group.topics.length} temaer</span>
              </div>
              <div className="progress-topic-list">
                {group.topics.map((topic) => {
                  const percent = topic.mastery === null ? 0 : Math.round(topic.mastery * 100);
                  return (
                    <article className="progress-topic" key={topic.conceptKey}>
                      <div className="progress-topic-heading">
                        <div className="progress-topic-copy">
                          <h3>{topic.title}</h3>
                          {topic.description ? <p>{topic.description}</p> : null}
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
                        {topic.gradeMin ? <span>Fra {topic.gradeMin}. trinn</span> : null}
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
            <p className="secondary-text">Prøv å laste inn siden på nytt om litt.</p>
          </section>
        ) : null}
      </main>
      <BottomNav active="progress" />
    </div>
  );
}

function PrivacyScreen() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    setIsSigningOut(true);
    await fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => undefined);
    router.replace('/');
    router.refresh();
  }

  return (
    <div className="app-shell">
      <TopBar />
      <main className="page-wrap narrow app-content">
        <p className="eyebrow">Innstillinger</p>
        <h1>Data og personvern</h1>
        <p className="secondary-text">
          Dette er en lukket test. Økter og chatmeldinger lagres slik at du kan fortsette samtalen
          senere.
        </p>
        <section className="card section">
          <div className="section-heading">
            <h2>Din demo</h2>
            <Icon name="target" />
          </div>
          <p className="secondary-text">Nora · 10. trinn · 120 minutter i uken</p>
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
          <button
            className="button ghost sign-out-button"
            disabled={isSigningOut}
            onClick={() => void signOut()}
            type="button"
          >
            {isSigningOut ? 'Logger ut …' : 'Logg ut'}
          </button>
        </div>
      </main>
    </div>
  );
}

export default function MattisApp({
  screen,
  initialGeometry = false,
  initialHome,
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
    return <ProfileChooser initialProfiles={initialProfiles ?? { learners: [] }} />;
  if (screen === 'onboarding') return <OnboardingScreen />;
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
  if (screen === 'progress') return <ProgressScreen initialProgress={initialProgress} />;
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
    return <SummaryScreen initialSummary={initialSummary} sessionId={sessionId} />;
  }
  return <PrivacyScreen />;
}
