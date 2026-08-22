'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

type ApiResult = {
  error?: string;
  destination?: string;
  authenticated?: boolean;
};

type TutorApiResult = {
  reply?: string;
  error?: string;
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

export type SessionScreenData = {
  id: string;
  status: string;
  currentPhase: string;
  durationMinutes: number;
  startedAt: string | null;
  endedAt: string | null;
  messages: ChatMessage[];
};

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
  title,
  timerLabel,
}: {
  back?: boolean;
  title?: string;
  timerLabel?: ReactNode;
}) {
  return (
    <header className="topbar">
      {back ? (
        <Link className="icon-button" href="/home" aria-label="Tilbake til hjem">
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
          <Link className="button primary" href="/session/new" style={{ marginTop: 20 }}>
            Start økt <Icon name="arrow" />
          </Link>
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
          startImmediately: true,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as SessionApiResult;
      if (!response.ok || !result.id) {
        throw new Error(result.error ?? 'Vi klarte ikke å starte økten.');
      }
      router.push(`/session/${result.id}`);
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
  const [files, setFiles] = useState(['side-1.jpg']);
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
          <p>JPG, PNG eller WebP · maks 10 MB per bilde</p>
          <label className="button secondary" htmlFor="homework-photo">
            Legg til bilde <Icon name="image" />
          </label>
          <input
            className="file-input"
            id="homework-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(event) => {
              if (event.target.files?.length)
                setFiles((current) => [...current, `side-${current.length + 1}.jpg`]);
            }}
          />
        </section>
        <div className="upload-list" aria-live="polite">
          {files.map((file, index) => (
            <div className="upload-item" key={file}>
              <span className="thumbnail">2(x−3)</span>
              <div className="upload-meta">
                <strong>
                  Side {index + 1} · {file}
                </strong>
                <span>
                  <Icon name="check" size={14} /> Klar for kontroll
                </span>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={`Fjern side ${index + 1}`}
                onClick={() => setFiles((current) => current.filter((item) => item !== file))}
              >
                <Icon name="trash" size={19} />
              </button>
            </div>
          ))}
        </div>
        <div className="sticky-cta">
          <Link className="button primary" href={`/session/${sessionId}/review`}>
            Ferdig <Icon name="arrow" />
          </Link>
        </div>
      </main>
    </div>
  );
}

function ReviewScreen({ sessionId = 'demo' }: { sessionId?: string }) {
  const [tasks, setTasks] = useState([
    '2(x − 3) = 4x + 6',
    'Finn x og forklar stegene dine.',
    'Hvor lang er hypotenusen?',
  ]);
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
            <div className="task-edit" key={`${index}-${task}`}>
              <span className="task-number">{index + 1}</span>
              <textarea
                className="textarea"
                aria-label={`Oppgave ${index + 1}`}
                value={task}
                onChange={(event) =>
                  setTasks((current) =>
                    current.map((item, taskIndex) =>
                      taskIndex === index ? event.target.value : item,
                    ),
                  )
                }
              />
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
          <Link className="button primary" href={`/session/${sessionId}`}>
            Start med oppgave 1 <Icon name="arrow" />
          </Link>
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
  const chatLogRef = useRef<HTMLDivElement>(null);
  const usesConversationFixture = visualTest && !initialSession;
  const [geometry, setGeometry] = useState(initialGeometry);
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

      const response = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          clientMessageId,
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
        title={usesConversationFixture ? (geometry ? 'Geometri' : 'Likninger') : 'Matteøkt'}
        timerLabel={
          <SessionTimer
            ended={sessionEnded}
            initialSeconds={
              usesConversationFixture ? 18 * 60 + 42 : (initialSession?.durationMinutes ?? 0) * 60
            }
            running={!visualTest && initialSession?.status === 'active'}
            startedAt={initialSession?.startedAt ?? null}
          />
        }
      />
      <main className="page-wrap session-page">
        <div className="session-top">
          <div className="phase-rail" aria-label="Fase: Lekser">
            <span className="phase active">
              <span>Lekser</span>
              <span className="marker" />
            </span>
            <span className="phase repetition">
              <span>Repetisjon</span>
              <span className="marker" />
            </span>
            <span className="phase summary">
              <span>Oppsummering</span>
              <span className="marker" />
            </span>
          </div>
          {usesConversationFixture ? (
            <section className="task-prompt" aria-labelledby="active-task">
              <div className="math-expression" id="active-task">
                {geometry ? 'Hvor lang er hypotenusen?' : '2(x − 3) = 4x + 6'}
              </div>
              {geometry ? <GeometryFigure /> : null}
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
                  <p className="bubble">{message.text}</p>
                </>
              ) : (
                <p className="bubble">{message.text}</p>
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
              disabled={!draft.trim() || isTutorReplying || sessionEnded || Boolean(failedMessage)}
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
          ) : null}
        </div>
      </main>
    </div>
  );
}

function SummaryScreen() {
  return (
    <div className="app-shell has-bottom-nav">
      <TopBar />
      <main className="page-wrap narrow app-content">
        <section className="summary-hero">
          <p className="eyebrow">Økten er ferdig</p>
          <h1>
            Godt jobbet,
            <br />
            Nora<span className="coral-period">.</span>
          </h1>
          <p>Du holdt ut gjennom flere steg og fant fram til riktig idé.</p>
        </section>
        <section className="card progress-card">
          <div className="progress-ring" aria-label="Mestringsanslag 78 prosent" />
          <h2>Du er på god vei</h2>
          <p className="secondary-text" style={{ marginBottom: 0 }}>
            Neste gang øver vi litt mer på fortegn i lineære likninger.
          </p>
        </section>
        <section className="card section">
          <div className="section-heading">
            <h2>Læringssignal</h2>
            <Icon name="spark" />
          </div>
          <div className="signal-list">
            <div className="signal">
              <span className="signal-icon">
                <Icon name="check" size={19} />
              </span>
              <div>
                <strong>Parenteser i likninger</strong>
                <span>Du fant et godt første steg</span>
              </div>
            </div>
            <div className="signal">
              <span className="signal-icon">
                <Icon name="repeat" size={19} />
              </span>
              <div>
                <strong>Fortegn</strong>
                <span>Repeteres i neste økt</span>
              </div>
            </div>
          </div>
        </section>
        <div className="sticky-cta">
          <Link className="button primary" href="/home">
            Tilbake til hjem <Icon name="arrow" />
          </Link>
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
  initialSession,
  sessionId,
  visualTest = false,
}: {
  screen: Screen;
  initialGeometry?: boolean;
  initialSession?: SessionScreenData;
  sessionId?: string;
  visualTest?: boolean;
}) {
  if (screen === 'entry') return <EntryScreen />;
  if (screen === 'onboarding') return <OnboardingScreen />;
  if (screen === 'home') return <HomeScreen />;
  if (screen === 'new') return <NewSessionScreen />;
  if (screen === 'capture') return <CaptureScreen sessionId={sessionId} />;
  if (screen === 'review') return <ReviewScreen sessionId={sessionId} />;
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
  if (screen === 'summary') return <SummaryScreen />;
  return <PrivacyScreen />;
}
