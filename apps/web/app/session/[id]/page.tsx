import { notFound, redirect } from 'next/navigation';

import MattisApp, {
  type IntakeStep,
  type SessionPlanData,
  type SessionPlanTimelineItem,
} from '../../components/mattis-app';
import {
  getAuthenticatedTutorData,
  RequestAuthError,
} from '../../../lib/request-auth';
import { ageBandForGrade } from '../../../lib/learner-profile';
import {
  homeworkFigureAltText,
  homeworkFigureCrop,
} from '../../../lib/homework-figures';
import { isUuid } from '../../../lib/uuid';

function normalizePlanSnapshot(value: unknown): SessionPlanData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const timeline = Array.isArray(source.timeline)
    ? source.timeline.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const value = item as Record<string, unknown>;
        if (
          typeof value.id !== 'string' ||
          typeof value.label !== 'string' ||
          (value.phase !== 'intro' &&
            value.phase !== 'homework' &&
            value.phase !== 'repetition' &&
            value.phase !== 'summary') ||
          typeof value.minutes !== 'number'
        ) {
          return [];
        }
        const segmentType =
          value.segmentType === 'intro' ||
          value.segmentType === 'homework' ||
          value.segmentType === 'review' ||
          value.segmentType === 'new_topic' ||
          value.segmentType === 'mixed' ||
          value.segmentType === 'summary'
            ? (value.segmentType as SessionPlanTimelineItem['segmentType'])
            : undefined;
        return [
          {
            id: value.id,
            label: value.label,
            phase: value.phase as
              'intro' | 'homework' | 'repetition' | 'summary',
            ...(segmentType ? { segmentType } : {}),
            minutes: value.minutes,
            ...(typeof value.conceptKey === 'string'
              ? { conceptKey: value.conceptKey }
              : {}),
          },
        ];
      })
    : [];
  return {
    version: typeof source.version === 'string' ? source.version : undefined,
    reasonNb: typeof source.reasonNb === 'string' ? source.reasonNb : null,
    previousNextTopicNb:
      typeof source.previousNextTopicNb === 'string'
        ? source.previousNextTopicNb
        : null,
    focusConcepts: Array.isArray(source.focusConcepts)
      ? source.focusConcepts.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    openingNb: typeof source.openingNb === 'string' ? source.openingNb : null,
    mode:
      source.mode === 'suggested' ||
      source.mode === 'homework' ||
      source.mode === 'custom' ||
      source.mode === 'getting_to_know' ||
      source.mode === 'scheduled'
        ? source.mode
        : undefined,
    homeworkMinutes:
      typeof source.homeworkMinutes === 'number'
        ? source.homeworkMinutes
        : undefined,
    repetitionMinutes:
      typeof source.repetitionMinutes === 'number'
        ? source.repetitionMinutes
        : undefined,
    summaryMinutes:
      typeof source.summaryMinutes === 'number'
        ? source.summaryMinutes
        : undefined,
    planConfirmed:
      typeof source.planConfirmed === 'boolean'
        ? source.planConfirmed
        : undefined,
    activeSegmentId:
      typeof source.activeSegmentId === 'string'
        ? source.activeSegmentId
        : null,
    introMinutes:
      typeof source.introMinutes === 'number' ? source.introMinutes : undefined,
    timeline,
  };
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  let data;
  try {
    ({ data } = await getAuthenticatedTutorData({ requireBilling: true }));
  } catch (error) {
    if (error instanceof RequestAuthError && error.status === 402)
      redirect('/billing');
    redirect('/');
  }

  const [session, storedMessages, storedTasks, profile] = await Promise.all([
    data.getSession(id),
    data.listMessages(id, 100),
    data.listTasks(id, 100),
    data.getProfile(),
  ]);
  if (!session) notFound();
  if (session.status === 'reviewing') redirect(`/session/${id}/review`);
  if (session.status === 'completed' || session.status === 'cancelled') {
    redirect(`/session/${id}/summary`);
  }
  const messages = storedMessages
    .filter((message) => message.role === 'student' || message.role === 'tutor')
    .map((message) => ({
      id: message.id,
      role: message.role as 'student' | 'tutor',
      text: message.content_nb,
      clientMessageId: message.client_message_id,
      createdAt: message.created_at,
      ...(message.metadata &&
      typeof message.metadata === 'object' &&
      !Array.isArray(message.metadata) &&
      (message.metadata as Record<string, unknown>).kind === 'session_opening'
        ? { kind: 'session_opening' as const }
        : {}),
    }));
  return (
    <MattisApp
      screen="session"
      sessionId={id}
      initialSession={{
        id: session.id,
        status: session.status,
        currentPhase: session.current_phase,
        durationMinutes: session.duration_minutes,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        planSnapshot: normalizePlanSnapshot(session.plan_snapshot),
        messages,
        gradeLevel: profile?.grade_level ?? null,
        ageBand:
          (profile?.age_band as 'under_12' | '12_16' | '17_plus' | null) ??
          ageBandForGrade(profile?.grade_level),
        intakeStep: profile?.intake_step as IntakeStep | undefined,
        intakeData:
          profile?.intake_data &&
          typeof profile.intake_data === 'object' &&
          !Array.isArray(profile.intake_data)
            ? (profile.intake_data as Record<string, unknown>)
            : {},
        tasks: storedTasks.map((task) => ({
          id: task.id,
          text: task.normalized_text,
          label: task.source_label,
          phase: task.phase === 'repetition' ? 'repetition' : 'homework',
          status: task.status,
          taskType: task.task_type,
          conceptKeys: task.concept_keys,
          hasFigure: Boolean(homeworkFigureCrop(task.figure_spec)),
          figureAlt: homeworkFigureAltText(task.figure_spec),
        })),
      }}
    />
  );
}
