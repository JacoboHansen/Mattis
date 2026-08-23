import { redirect } from 'next/navigation';

import MattisApp, { type HomeScreenData } from '../components/mattis-app';
import { CONCEPT_TITLES_NB } from '../../lib/planning/session-plan';
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
        estimate: weakest.estimate,
        lastPracticedAt: weakest.last_practiced_at,
      }
    : null;

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
      nextTopic: session.next_topic_nb,
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
        nextTopic: activeSession.next_topic_nb,
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
    recentSessions,
  };

  return <MattisApp screen="home" initialHome={homeData} />;
}
