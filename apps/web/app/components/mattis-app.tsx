'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { fetchWithSessionRefresh } from '../../lib/authenticated-fetch';
import MathText from './math-text';

const MAX_HOMEWORK_IMAGES = 10;

type ApiResult = {
  error?: string;
  destination?: string;
  authenticated?: boolean;
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
};

type SetupStep = 'duration' | 'homework' | 'photos' | 'parsing' | 'review' | 'active';

export type SessionTaskData = {
  id: string;
  text: string;
  label: string | null;
  phase: 'homework' | 'repetition';
  status: string;
  taskType: string;
  conceptKeys: string[];
};

export type SessionScreenData = {
  id: string;
  status: string;
  currentPhase: string;
  durationMinutes: number;
  startedAt: string | null;
  endedAt: string | null;
  messages: ChatMessage[];
  tasks: SessionTaskData[];
};

export type ReviewScreenData = {
  tasks: Array<Pick<SessionTaskData, 'id' | 'text' | 'label'>>;
};

export type SummaryScreenData = {
  status: string;
  summary: string | null;
  nextTopicNb: string | null;
  completedTasks: number;
  totalTasks: number;
};

function taskDisplayLabel(task: Pick<SessionTaskData, 'label'>, fallbackIndex: number) {
  const label = task.label?.trim();
  if (!label) return `Oppgave ${fallbackIndex + 1}`;
  return /^(oppgave|repetisjon)\b/i.test(label) ? label : `Oppgave ${label}`;
}

async function readApiResult(response: Response): Promise<ApiResult> {
  return (await response.json().catch(() => ({}))) as ApiResult;
}

type Screen =
  | 'entry'
  | 'onboarding'
  | 'home'
  | 'new'
  | 'capture'
  | 'review'
  | 'session'
  | 'summary'
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
      {title ? (
        <h1 className="display" style={{ fontSize: 30, margin: 0 }}>
          {title}
        </h1>
      ) : null}
      {back ? (
        <span className="timer">{timerLabel ?? ''}</span>
      ) : (
        <Link className="icon-button" href="/settings/privacy" aria-label="Åpne personvern">
          <Icon name="target" />
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
      <Link className={active === 'progress' ? 'active' : ''} href="/home">
        <Icon name="target" />
        <span>Fremgang</span>
      </Link>
    </nav>
  );
}

function HomeScreen() {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');

  async function startSession() {
    setIsStarting(true);
    setError('');
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes: 45, startImmediately: false }),
      });
      const result = (await response.json().catch(() => ({}))) as SessionApiResult;
      if (!response.ok || !result.id) {
        throw new Error(result.error ?? 'Vi klarte ikke å starte økten.');
      }
      router.push(`/session/${result.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Vi klarte ikke å starte økten.');
      setIsStarting(false);
    }
  }

  return (
    <div className="app-shell has-bottom-nav">
      <TopBar />
      <main className="page-wrap app-content home-page">
        <div className="home-hero">
          <section className="welcome">
            <p className="eyebrow">Tirsdag · 10. trinn</p>
            <h1>
              Hei,
              <br />
              Nora<span className="coral-period">.</span>
            </h1>
            <p className="lead">Klar for litt matte?</p>
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
              <strong id="today-session">Dagens økt</strong>
              <span className="dot"> · </span>
              <span>45 min</span>
            </div>
          </div>
          <div className="timeline">
            <div className="timeline-item">
              <span className="timeline-icon">
                <Icon name="document" />
              </span>
              <div className="timeline-copy">
                <strong>Lekser</strong>
                <span>Likninger med parenteser</span>
              </div>
              <span className="timeline-time">25 min</span>
            </div>
            <div className="timeline-item">
              <span className="timeline-icon">
                <Icon name="repeat" />
              </span>
              <div className="timeline-copy">
                <strong>Repetisjon</strong>
                <span>Negative tall</span>
              </div>
              <span className="timeline-time">15 min</span>
            </div>
            <div className="timeline-item">
              <span className="timeline-icon">
                <Icon name="document" />
              </span>
              <div className="timeline-copy">
                <strong>Kort oppsummering</strong>
              </div>
              <span className="timeline-time">5 min</span>
            </div>
          </div>
          {error ? (
            <p className="form-message" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button primary"
            disabled={isStarting}
            onClick={() => void startSession()}
            style={{ marginTop: 20 }}
            type="button"
          >
            {isStarting ? 'Starter økt …' : 'Start økt'}{' '}
            {!isStarting ? <Icon name="arrow" /> : null}
          </button>
          <p className="next-session">
            <Icon name="calendar" />
            Neste avtale: tirsdag kl. 17.00
          </p>
        </section>
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

function OnboardingScreen() {
  const [displayName, setDisplayName] = useState('Nora');
  const [gradeLevel, setGradeLevel] = useState('10');
  const [goal, setGoal] = useState('120 minutter');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

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
          Vi bruker dette til å gjøre øktene passe korte og relevante.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveProfile();
          }}
        >
          <div className="card" style={{ marginTop: 24 }}>
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
                onChange={(event) => setGradeLevel(event.target.value)}
                value={gradeLevel}
              >
                <option value="10">10. trinn</option>
                <option value="9">9. trinn</option>
                <option value="8">8. trinn</option>
              </select>
            </div>
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
    if (!storedMessages?.length) return [];
    const lastMessage = storedMessages[storedMessages.length - 1];
    if (lastMessage.role === 'student') lastMessage.status = 'failed';
    return storedMessages;
  });
  const [draft, setDraft] = useState('');
  const [isTutorReplying, setIsTutorReplying] = useState(false);
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
  const activePhase = activeTask?.phase ?? initialSession?.currentPhase ?? 'summary';

  function appendSetupTurn(studentText: string, tutorText: string) {
    const turnId = crypto.randomUUID();
    setMessages((items) => [
      ...items,
      { id: `setup-student-${turnId}`, role: 'student', text: studentText, status: 'sent' },
      { id: `setup-tutor-${turnId}`, role: 'tutor', text: tutorText, status: 'sent' },
    ]);
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

  async function startLiveSession() {
    setSetupStatus('Gjør økten klar …');
    setTutorError('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/start`, { method: 'POST' });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
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
      if (result.tasks) {
        setTasks(
          result.tasks.map((task) => ({
            ...task,
            taskType: task.taskType ?? 'open_response',
          })),
        );
      }
      setSetupStep('active');
      setIsSessionLive(true);
      setSetupStatus('');
      appendSetupTurn('Nei, vi starter uten lekser', 'Da begynner vi. Hva vil du starte med?');
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

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
  }, [messages, isTutorReplying]);

  const send = async (retryMessage?: ChatMessage) => {
    const studentText = retryMessage?.text ?? draft.trim();
    if (
      !studentText ||
      (!sessionId && !visualTest) ||
      isTutorReplying ||
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

      const response = await fetchWithSessionRefresh('/api/tutor', {
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
      if (activeTask && result.taskState === 'completed') {
        setTasks((current) =>
          current.map((task) =>
            task.id === activeTask.id ? { ...task, status: 'completed' } : task,
          ),
        );
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
            startedAt={initialSession?.startedAt ?? null}
          />
        }
      />
      <main className="page-wrap session-page">
        <div className="session-top">
          <div className="phase-rail" aria-label={`Fase: ${activePhase}`}>
            <span className={`phase ${activePhase === 'homework' ? 'active' : ''}`}>
              <span>Lekser</span>
              <span className="marker" />
            </span>
            <span className={`phase repetition ${activePhase === 'repetition' ? 'active' : ''}`}>
              <span>Repetisjon</span>
              <span className="marker" />
            </span>
            <span className={`phase summary ${activePhase === 'summary' ? 'active' : ''}`}>
              <span>Oppsummering</span>
              <span className="marker" />
            </span>
          </div>
          {activeTask ? (
            <section className="task-prompt" aria-labelledby="active-task">
              <div className="task-prompt-heading">
                <span>{activeTask.phase === 'homework' ? 'Lekse' : 'Repetisjon'}</span>
                <span>
                  {taskDisplayLabel(activeTask, activeTaskIndex)} · {activeTaskIndex + 1} av{' '}
                  {tasks.length}
                </span>
              </div>
              <div className="math-expression" id="active-task">
                <MathText text={activeTask.text} />
              </div>
              {usesConversationFixture && geometry ? <GeometryFigure /> : null}
            </section>
          ) : tasks.length ? (
            <section className="task-complete" aria-live="polite">
              <Icon name="check" /> Alle oppgavene er ferdige
            </section>
          ) : null}
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
                  <MathText text={message.text} />
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
            <div className="chat-options" aria-label="Velg hvor lenge økten skal vare">
              {[25, 45, 60].map((minutes) => (
                <button
                  className="setup-option"
                  disabled={Boolean(setupStatus)}
                  key={minutes}
                  onClick={() => void chooseDuration(minutes)}
                  type="button"
                >
                  {minutes} minutter
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
        </div>
        <div className="session-controls">
          {tutorError ? (
            <div className="tutor-error" role="alert">
              <span>{tutorError}</span>
              {failedMessage ? (
                <button
                  disabled={isTutorReplying}
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
                disabled={isTutorReplying || sessionEnded || Boolean(failedMessage)}
                type="button"
                onClick={() => setDraft('Jeg står fast på dette steget')}
              >
                <Icon name="help" />
                Jeg står fast
              </button>
              <div className="composer">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void send();
                  }}
                  placeholder={
                    sessionEnded
                      ? 'Økten er avsluttet'
                      : failedMessage
                        ? 'Prøv den siste meldingen igjen'
                        : 'Skriv eller spør Mattis'
                  }
                  aria-label="Skriv eller spør Mattis"
                  disabled={isTutorReplying || sessionEnded || Boolean(failedMessage)}
                />
                <button
                  className="send-button"
                  type="button"
                  aria-label="Send melding"
                  disabled={
                    !draft.trim() || isTutorReplying || sessionEnded || Boolean(failedMessage)
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

function SummaryScreen({
  initialSummary,
  sessionId = 'demo',
}: {
  initialSummary?: SummaryScreenData;
  sessionId?: string;
}) {
  const [nextTopic, setNextTopic] = useState(initialSummary?.nextTopicNb ?? '');
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
      body: JSON.stringify({ nextTopicNb: nextTopic }),
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
              : 'Fortell Mattis hva dere skal jobbe med til neste gang.'}
          </p>
        </section>
        {isFinished ? (
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
        ) : (
          <section className="card section next-topic-card">
            <label htmlFor="next-topic">Hva skal dere jobbe med til neste gang?</label>
            <textarea
              className="textarea"
              id="next-topic"
              maxLength={300}
              onChange={(event) => setNextTopic(event.target.value)}
              placeholder="For eksempel likninger i kapittel 4"
              value={nextTopic}
            />
          </section>
        )}
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
  initialReview,
  initialSession,
  initialSummary,
  sessionId,
  visualTest = false,
}: {
  screen: Screen;
  initialGeometry?: boolean;
  initialReview?: ReviewScreenData;
  initialSession?: SessionScreenData;
  initialSummary?: SummaryScreenData;
  sessionId?: string;
  visualTest?: boolean;
}) {
  if (screen === 'entry') return <EntryScreen />;
  if (screen === 'onboarding') return <OnboardingScreen />;
  if (screen === 'home') return <HomeScreen />;
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
