import { cookies } from 'next/headers';

import {
  ACCESS_COOKIE,
  ACTIVE_LEARNER_COOKIE,
} from '../../../../lib/auth-cookies';
import {
  getAuthUser,
  SupabaseHttpError,
  type AuthUser,
} from '../../../../lib/supabase-http';
import {
  createTutorDataClient,
  TutorDataError,
  type StudentProfile,
  type TutorDataClient,
  type TutorTask,
  type TutorSession,
} from '../../../../lib/supabase/data';
import {
  generateTutorTurn,
  TutorProviderError,
} from '../../../../lib/ai/provider';
import {
  parseTutorRequest,
  parseTutorTurnResponse,
  type TutorRequest,
  type TutorTaskFigureContext,
  type TutorTurnResponse,
} from '../../../../lib/ai/contracts';
import { normalizeTaskSetTitle } from '../../../../lib/ai/task-set';
import { deriveTutorMessageId } from '../../../../lib/ai/message-id';
import {
  BillingAccessError,
  requireBillingAccess,
} from '../../../../lib/billing';
import {
  ageBandForGrade,
  type LearnerAgeBand,
} from '../../../../lib/learner-profile';
import {
  cleanStoredNextTopic,
  learnerProfileContext,
} from '../../../../lib/learner-context';
import {
  cropHomeworkFigure,
  homeworkFigureAltText,
  normalizeHomeworkFigureSpec,
} from '../../../../lib/homework-figures';
import type { Json } from '../../../../lib/database.types';
import type { SessionPlanTimelineItem } from '../../../../lib/planning/session-plan';
import {
  resolveSessionProgress,
  type SessionProgress,
} from '../../../../lib/planning/session-progress';
import {
  detectSafetySignal,
  recordSafetySignal,
  type SafetySignal,
} from '../../../../lib/safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 100_000;

type TutorRouteDependencies = {
  accessToken?: string | null;
  authenticate?: (accessToken: string) => Promise<AuthUser>;
  generate?: (request: TutorRequest) => ReturnType<typeof generateTutorTurn>;
  responseFormat?: 'contract' | 'api';
  dataClient?: TutorPersistence;
  createDataClient?: (accessToken: string, userId: string) => TutorPersistence;
};

export type TutorPersistence = Pick<
  TutorDataClient,
  | 'getSession'
  | 'updateSession'
  | 'listMessages'
  | 'findMessageByClientMessageId'
  | 'appendMessage'
  | 'getTask'
  | 'getProfile'
  | 'listMastery'
  | 'updateTask'
  | 'recordLearningSignal'
  | 'recordAiGeneration'
> & {
  listTasks?: TutorDataClient['listTasks'];
  listSessions?: TutorDataClient['listSessions'];
  listLearningSignals?: TutorDataClient['listLearningSignals'];
  updateLearnerProfile?: TutorDataClient['updateLearnerProfile'];
  getHomeworkUpload?: TutorDataClient['getHomeworkUpload'];
  downloadHomeworkObject?: TutorDataClient['downloadHomeworkObject'];
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function timelineFromSnapshot(
  snapshot: Record<string, unknown> | null,
): SessionPlanTimelineItem[] {
  if (!snapshot || !Array.isArray(snapshot.timeline)) return [];
  return snapshot.timeline.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const value = item as Record<string, unknown>;
    const phase = value.phase;
    const minutes = value.minutes;
    if (
      typeof value.id !== 'string' ||
      typeof value.label !== 'string' ||
      !['intro', 'homework', 'repetition', 'summary'].includes(String(phase)) ||
      typeof minutes !== 'number' ||
      !Number.isFinite(minutes) ||
      minutes < 0
    ) {
      return [];
    }
    return [
      {
        id: value.id,
        label: value.label,
        phase: phase as SessionPlanTimelineItem['phase'],
        minutes,
        ...(typeof value.conceptKey === 'string'
          ? {
              conceptKey:
                value.conceptKey as SessionPlanTimelineItem['conceptKey'],
            }
          : {}),
      },
    ];
  });
}

async function getAccessToken(dependencies: TutorRouteDependencies) {
  if (dependencies.accessToken !== undefined) return dependencies.accessToken;
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_COOKIE)?.value ?? null;
}

export async function handleTutorRequest(
  request: Request,
  dependencies: TutorRouteDependencies = {},
) {
  const accessToken = await getAccessToken(dependencies);
  if (!accessToken)
    return jsonResponse({ error: 'Du må være innlogget.' }, 401);

  let user: AuthUser;
  try {
    const authenticate = dependencies.authenticate ?? getAuthUser;
    user = await authenticate(accessToken);
    if (!user.id)
      return jsonResponse({ error: 'Innloggingen mangler bruker-ID.' }, 503);
  } catch (error) {
    if (error instanceof SupabaseHttpError && error.status === 401) {
      return jsonResponse({ error: 'Innloggingen er utløpt.' }, 401);
    }
    return jsonResponse({ error: 'Innlogging kunne ikke bekreftes.' }, 503);
  }

  if (!dependencies.dataClient && !dependencies.createDataClient) {
    try {
      await requireBillingAccess(accessToken, user.id);
    } catch (error) {
      if (error instanceof BillingAccessError)
        return jsonResponse({ error: error.message }, 402);
      return jsonResponse(
        { error: 'Betalingsstatus kunne ikke bekreftes.' },
        503,
      );
    }
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Forespørselen er for stor.' }, 413);
  }
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    return jsonResponse(
      { error: 'Content-Type må være application/json.' },
      415,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { error: 'Forespørselen må inneholde gyldig JSON.' },
      400,
    );
  }
  const parsed = parseTutorRequest(body);
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);

  if (!parsed.value.sessionId) {
    return jsonResponse(
      { error: 'sessionId er påkrevd for å lagre tutorøkten.' },
      400,
    );
  }

  let activeLearnerId = user.id;
  if (!dependencies.dataClient && !dependencies.createDataClient) {
    activeLearnerId =
      (await cookies()).get(ACTIVE_LEARNER_COOKIE)?.value ?? user.id;
  }
  const data =
    dependencies.dataClient ??
    (
      dependencies.createDataClient ??
      ((access, id) =>
        createTutorDataClient({
          accessToken: access,
          userId: id,
          learnerId: activeLearnerId,
        }))
    )(accessToken, user.id);
  const clientMessageId = parsed.value.clientMessageId ?? crypto.randomUUID();
  const tutorMessageId = deriveTutorMessageId(clientMessageId);
  let tutorRequest = parsed.value;
  let activeTask: TutorTask | null = null;
  let profile: StudentProfile | null = null;
  let currentSession: TutorSession | null = null;
  let currentPlanForProgress: Record<string, unknown> | null = null;
  let currentProgress: SessionProgress | null = null;
  let activeTaskSetHasRemaining = false;
  let activeTaskWasPending = false;
  let taskFigure: TutorRequest['taskFigure'];
  try {
    const session = await data.getSession(parsed.value.sessionId);
    if (!session) return jsonResponse({ error: 'Økten finnes ikke.' }, 404);
    currentSession = session;

    if (parsed.value.taskId) {
      activeTask = await data.getTask(parsed.value.taskId);
      if (!activeTask || activeTask.session_id !== session.id) {
        return jsonResponse(
          { error: 'Oppgaven finnes ikke i denne økten.' },
          404,
        );
      }
    }

    const existingStudent =
      await data.findMessageByClientMessageId(clientMessageId);
    if (existingStudent) {
      if (
        existingStudent.session_id !== session.id ||
        existingStudent.role !== 'student'
      ) {
        return jsonResponse(
          { error: 'Meldings-ID-en er allerede brukt i en annen økt.' },
          409,
        );
      }
      if ((existingStudent.task_id ?? null) !== (activeTask?.id ?? null)) {
        return jsonResponse(
          { error: 'Meldings-ID-en er allerede brukt på en annen oppgave.' },
          409,
        );
      }
      const existingTutorMessage =
        await data.findMessageByClientMessageId(tutorMessageId);
      if (existingTutorMessage) {
        if (
          existingTutorMessage.session_id !== session.id ||
          existingTutorMessage.role !== 'tutor'
        ) {
          return jsonResponse(
            { error: 'Meldings-ID-en er allerede brukt i en annen økt.' },
            409,
          );
        }
        const storedTurn = storedTutorTurn(existingTutorMessage.metadata);
        if (storedTurn) {
          await persistTutorOutcome(
            data,
            session.id,
            activeTask,
            existingTutorMessage.id,
            storedTurn,
            isSessionEndRequest(
              existingStudent?.content_nb ?? parsed.value.message,
            ),
          );
        }
        return responseForStoredTutorMessage(
          existingTutorMessage.content_nb,
          storedTurn,
          dependencies.responseFormat,
        );
      }
    }

    if (session.status === 'completed' || session.status === 'cancelled') {
      return jsonResponse({ error: 'Økten er avsluttet.' }, 409);
    }

    const studentContent = existingStudent?.content_nb ?? parsed.value.message;
    if (!existingStudent) {
      await data.appendMessage(parsed.value.sessionId, {
        role: 'student',
        contentNb: studentContent,
        clientMessageId,
        taskId: parsed.value.taskId ?? null,
      });
    }

    const [
      storedMessages,
      fetchedProfile,
      mastery,
      recentSessions,
      sessionTasks,
    ] = await Promise.all([
      data.listMessages(parsed.value.sessionId, 100),
      data.getProfile(),
      data.listMastery(100),
      data.listSessions ? data.listSessions(8) : Promise.resolve([]),
      data.listTasks
        ? data.listTasks(parsed.value.sessionId, 100)
        : Promise.resolve(activeTask ? [activeTask] : []),
    ]);
    profile = fetchedProfile;
    const completedSessions = recentSessions.filter(
      (item) => item.id !== session.id && item.status === 'completed',
    );
    const previousLearningSignals = data.listLearningSignals
      ? (
          await Promise.all(
            completedSessions
              .slice(0, 4)
              .map((item) => data.listLearningSignals!(item.id, 8)),
          )
        )
          .flat()
          .slice(-8)
          .map((signal) => signal.note_nb?.trim())
          .filter((note): note is string => Boolean(note))
          .slice(-6)
      : [];
    const excludedIds = new Set([
      clientMessageId.toLowerCase(),
      tutorMessageId.toLowerCase(),
    ]);
    const history = storedMessages
      .filter(
        (message) => message.role === 'student' || message.role === 'tutor',
      )
      .filter(
        (message) =>
          !message.client_message_id ||
          !excludedIds.has(message.client_message_id.toLowerCase()),
      )
      .slice(-11)
      .map((message) => ({
        role: message.role as 'student' | 'tutor',
        content: message.content_nb,
      }));

    const currentPlan =
      session.plan_snapshot &&
      typeof session.plan_snapshot === 'object' &&
      !Array.isArray(session.plan_snapshot)
        ? (session.plan_snapshot as Record<string, unknown>)
        : null;
    currentPlanForProgress = currentPlan;
    const timeline = timelineFromSnapshot(currentPlan);
    activeTaskWasPending = Boolean(
      activeTask && !['completed', 'skipped'].includes(activeTask.status),
    );
    currentProgress = resolveSessionProgress({
      startedAt: session.started_at,
      durationMinutes: session.duration_minutes,
      timeline,
      activeSegmentId:
        typeof currentPlan?.activeSegmentId === 'string'
          ? currentPlan.activeSegmentId
          : null,
      activeTaskPending: activeTaskWasPending,
    });
    const previousTopics = recentSessions
      .filter(
        (item) =>
          item.id !== session.id &&
          item.status === 'completed' &&
          typeof item.next_topic_nb === 'string',
      )
      .map((item) => cleanStoredNextTopic(item.next_topic_nb))
      .filter((topic): topic is string => Boolean(topic))
      .slice(0, 3);
    const recentSummaries = recentSessions
      .filter(
        (item) =>
          item.id !== session.id &&
          item.status === 'completed' &&
          typeof item.summary_nb === 'string',
      )
      .map((item) => item.summary_nb!.trim())
      .filter(Boolean)
      .slice(0, 3);
    // Profile setup can be complete before Mattis has actually met the learner.
    // Use completed learning sessions as the first-session signal instead.
    const isFirstSession = !recentSessions.some(
      (item) => item.id !== session.id && item.status === 'completed',
    );
    const currentPlanReason =
      typeof currentPlan?.reasonNb === 'string' ? currentPlan.reasonNb : null;
    const currentPlanFocusConcepts = Array.isArray(currentPlan?.focusConcepts)
      ? currentPlan.focusConcepts.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const internalNotes = storedMessages
      .flatMap((message) => internalNoteFromMetadata(message.metadata) ?? [])
      .slice(-4);
    const taskSetLabel = activeTask?.source_label?.trim() ?? '';
    const taskSetTasks =
      activeTask && taskSetLabel
        ? sessionTasks.filter(
            (task) => task.source_label?.trim() === taskSetLabel,
          )
        : [];
    const activeTaskSet =
      activeTask && taskSetTasks.length > 1 ? taskSetTasks : [];
    const activeTaskSetIndex = activeTaskSet.findIndex(
      (task) => task.id === activeTask?.id,
    );
    const taskSetContext =
      activeTask && activeTaskSet.length > 1 && activeTaskSetIndex >= 0
        ? {
            title: normalizeTaskSetTitle(taskSetLabel),
            activeTaskNumber: activeTaskSetIndex + 1,
            taskCount: activeTaskSet.length,
            completedTaskCount: activeTaskSet.filter((task) =>
              ['completed', 'skipped'].includes(task.status),
            ).length,
            remainingTaskCount: activeTaskSet.filter(
              (task) => !['completed', 'skipped'].includes(task.status),
            ).length,
            isLastTask: activeTaskSetIndex === activeTaskSet.length - 1,
            isFinished: activeTaskSet.every((task) =>
              ['completed', 'skipped'].includes(task.status),
            ),
          }
        : undefined;
    activeTaskSetHasRemaining = Boolean(
      taskSetContext && taskSetContext.remainingTaskCount > 1,
    );

    if (
      activeTask?.upload_id &&
      data.getHomeworkUpload &&
      data.downloadHomeworkObject
    ) {
      const figure = normalizeHomeworkFigureSpec(activeTask.figure_spec);
      if (figure) {
        try {
          const upload = await data.getHomeworkUpload(activeTask.upload_id);
          if (upload && upload.session_id === session.id) {
            const source = await data.downloadHomeworkObject(
              upload.storage_path,
            );
            const mimeType: TutorTaskFigureContext['mimeType'] = [
              'image/jpeg',
              'image/png',
              'image/webp',
            ].includes(upload.mime_type)
              ? (upload.mime_type as TutorTaskFigureContext['mimeType'])
              : 'image/jpeg';
            taskFigure = {
              bytes: figure.crop
                ? await cropHomeworkFigure(source, figure.crop)
                : source,
              mimeType,
              altNb: homeworkFigureAltText(activeTask.figure_spec),
            };
          }
        } catch (error) {
          console.error('Homework figure unavailable to tutor', {
            reason:
              error instanceof Error ? error.message.slice(0, 120) : 'unknown',
          });
        }
      }
    }

    tutorRequest = {
      ...parsed.value,
      message: studentContent,
      history,
      clientMessageId,
      ...(activeTask
        ? {
            taskId: activeTask.id,
            taskText: activeTask.normalized_text,
            taskTopic:
              activeTask.concept_keys.join(', ') || activeTask.task_type,
          }
        : { taskId: undefined, taskText: undefined, taskTopic: undefined }),
      ...(taskSetContext ? { taskSetContext } : {}),
      ...(taskFigure ? { taskFigure } : {}),
      learnerContext: {
        gradeLevel: profile?.grade_level ?? null,
        courseCode: profile?.course_code ?? null,
        mastery: mastery.map((item) => ({
          conceptKey: item.concept_key,
          estimate: item.estimate,
          confidence: item.confidence,
          evidenceCount: item.evidence_count,
        })),
        ...(profile ? { learnerProfile: learnerProfileContext(profile) } : {}),
        sessionMemory: {
          previousTopics,
          recentSummaries,
          currentPlanReason,
          currentPlanFocusConcepts,
          internalNotes,
          previousLearningNotes: previousLearningSignals,
          ...(currentProgress
            ? {
                sessionProgress: {
                  activeSegment: currentProgress.activeSegment.label,
                  nextSegment: currentProgress.nextSegment?.label ?? null,
                  segmentRemainingMinutes:
                    currentProgress.segmentRemainingMinutes,
                  remainingMinutes: currentProgress.remainingMinutes,
                  transitionDue: currentProgress.transitionDue,
                  isFinished: currentProgress.isFinished,
                },
              }
            : {}),
          isFirstSession,
        },
      },
    };
  } catch (error) {
    return storageErrorResponse(error, 'Elevmeldingen kunne ikke lagres.');
  }

  const generate = dependencies.generate ?? generateTutorTurn;
  const startedAt = Date.now();
  let result: Awaited<ReturnType<typeof generateTutorTurn>>;
  try {
    result = await generate(tutorRequest);
  } catch (error) {
    if (error instanceof Error) {
      console.error('Tutor response unavailable', {
        code:
          'code' in error && typeof error.code === 'string'
            ? error.code
            : 'unknown',
      });
    }
    const message =
      error instanceof TutorProviderError &&
      error.code === 'bad_response' &&
      error.details?.statusCode === 429
        ? 'AI-tjenesten er midlertidig full. Vent noen sekunder og prøv igjen.'
        : 'Det skjedde en teknisk feil mens Mattis laget svaret. Ingen melding ble lagret som tutorsvar. Prøv igjen om et øyeblikk.';
    return jsonResponse({ error: message }, 503);
  }
  const safetyAgeBand =
    (profile?.age_band as LearnerAgeBand | null) ??
    ageBandForGrade(profile?.grade_level);
  const safetySignal = detectSafetySignal(
    tutorRequest.message,
    result.response,
    safetyAgeBand,
  );
  let safetyNotification:
    | {
        eventId?: string;
        childConsentRequired?: boolean;
        trustedAdultOnly?: boolean;
      }
    | undefined;
  let updatedSessionProgress = currentProgress;
  try {
    const internalNextSessionNoteNb = buildInternalNote(
      result.response,
      activeTask,
    );
    const tutorMessage = await data.appendMessage(parsed.value.sessionId, {
      role: 'tutor',
      contentNb: result.response.assistantMessageNb,
      clientMessageId: tutorMessageId,
      taskId: activeTask?.id ?? null,
      intent: result.response.intent,
      metadata: {
        tutorTurn: result.response,
        ...(internalNextSessionNoteNb ? { internalNextSessionNoteNb } : {}),
      },
    });
    await persistTutorOutcome(
      data,
      parsed.value.sessionId,
      activeTask,
      tutorMessage.id,
      result.response,
      isSessionEndRequest(tutorRequest.message),
    );
    if (
      currentSession &&
      currentPlanForProgress &&
      currentProgress?.transitionDue &&
      !activeTaskSetHasRemaining &&
      (!activeTask || result.response.taskState === 'completed')
    ) {
      const targetSegment = activeTaskWasPending
        ? currentProgress.nextSegment
        : currentProgress.activeSegment;
      if (targetSegment) {
        const updatedPlan = {
          ...currentPlanForProgress,
          activeSegmentId: targetSegment.id,
        };
        await data.updateSession(parsed.value.sessionId, {
          currentPhase: targetSegment.phase,
          planSnapshot: updatedPlan as unknown as Json,
        });
        updatedSessionProgress = resolveSessionProgress({
          startedAt: currentSession.started_at,
          durationMinutes: currentSession.duration_minutes,
          timeline: timelineFromSnapshot(updatedPlan),
          activeSegmentId: targetSegment.id,
          activeTaskPending: false,
        });
      }
    }
    await persistLearnerProfile(data, profile, result.response);
    await data
      .recordAiGeneration({
        capability: 'tutor',
        provider: result.provider,
        model: result.model,
        requestSchemaVersion: parsed.value.schemaVersion,
        responseSchemaVersion: result.response.schemaVersion,
        status: 'succeeded',
        sessionId: parsed.value.sessionId,
        taskId: activeTask?.id ?? null,
        latencyMs: Date.now() - startedAt,
        inputUnits: result.usage?.inputTokens ?? null,
        outputUnits: result.usage?.outputTokens ?? null,
        safetyFlags: result.response.safetyFlags,
      })
      .catch(() => undefined);
    if (
      safetySignal &&
      !dependencies.dataClient &&
      !dependencies.createDataClient
    ) {
      safetyNotification = await recordSafetySignal({
        userId: user.id,
        learnerId: activeLearnerId,
        sessionId: parsed.value.sessionId,
        parentEmail: user.email,
        ageBand: safetyAgeBand,
        signal: safetySignal,
      }).catch((error) => {
        console.error('Safety signal could not be recorded', {
          code: error instanceof Error ? error.message : 'unknown',
        });
        return undefined;
      });
    }
  } catch (error) {
    return storageErrorResponse(
      error,
      'Tutor-svaret ble laget, men kunne ikke lagres.',
    );
  }
  return responseForTutorResult(
    result,
    dependencies.responseFormat,
    safetySignal,
    safetyNotification,
    updatedSessionProgress,
  );
}

export function isSessionEndRequest(text: string) {
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

function storedTutorTurn(metadata: unknown): TutorTurnResponse | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return null;
  const candidate = (metadata as Record<string, unknown>).tutorTurn;
  const parsed = parseTutorTurnResponse(candidate);
  return parsed.ok ? parsed.value : null;
}

function internalNoteFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return [];
  const source = metadata as Record<string, unknown>;
  const direct =
    typeof source.internalNextSessionNoteNb === 'string'
      ? source.internalNextSessionNoteNb.trim()
      : '';
  if (direct) return [direct.slice(0, 500)];
  const turn = storedTutorTurn(metadata);
  return (
    turn?.learningEvidence
      .map((evidence) => evidence.noteNb?.trim())
      .filter((note): note is string => Boolean(note))
      .slice(0, 2) ?? []
  );
}

export async function persistLearnerProfile(
  data: TutorPersistence,
  profile: StudentProfile | null,
  response: TutorTurnResponse,
) {
  const update = response.learnerProfileUpdate;
  if (!update || !data.updateLearnerProfile) return;
  if (response.safetyFlags.some((flag) => flag !== 'none')) return;

  const currentStatus =
    profile?.learner_profile_status === 'complete'
      ? 'complete'
      : profile?.learner_profile_status === 'in_progress'
        ? 'in_progress'
        : 'not_started';
  const mergeConcepts = (
    current: string[] | undefined,
    next: string[] | undefined,
  ) => Array.from(new Set([...(current ?? []), ...(next ?? [])])).slice(0, 8);
  const fields: Parameters<
    NonNullable<TutorPersistence['updateLearnerProfile']>
  >[0] = {
    status:
      update.complete === true
        ? 'complete'
        : currentStatus === 'complete'
          ? 'complete'
          : 'in_progress',
  };
  if (update.preferredSessionMinutes !== undefined) {
    fields.preferredSessionMinutes = update.preferredSessionMinutes;
  }
  if (update.preferredWeeklySessions !== undefined) {
    fields.preferredWeeklySessions = update.preferredWeeklySessions;
  }
  if (update.learningStyle !== undefined)
    fields.learningStyle = update.learningStyle;
  if (update.strengthConceptKeys !== undefined) {
    fields.strengthConceptKeys = mergeConcepts(
      profile?.strength_concept_keys,
      update.strengthConceptKeys,
    );
  }
  if (update.focusConceptKeys !== undefined) {
    fields.focusConceptKeys = mergeConcepts(
      profile?.focus_concept_keys,
      update.focusConceptKeys,
    );
  }

  try {
    await data.updateLearnerProfile(fields);
  } catch (error) {
    console.error('Learner profile update unavailable', {
      code: error instanceof TutorDataError ? error.code : 'unknown',
    });
  }
}

function buildInternalNote(
  response: TutorTurnResponse,
  task: TutorTask | null,
) {
  const modelNote = response.learningEvidence
    .map((evidence) => evidence.noteNb?.trim())
    .find((note): note is string => Boolean(note));
  if (modelNote) return modelNote.slice(0, 500);
  if (!task?.concept_keys.length || response.taskState === 'in_progress')
    return null;
  const topics = task.concept_keys.slice(0, 2).join(', ');
  if (response.taskState === 'completed')
    return 'Eleven fullførte arbeid med ' + topics + '.';
  if (
    response.taskState === 'checking' ||
    response.taskState === 'needs_human_review'
  ) {
    return (
      'Følg opp ' + topics + ' med en roligere forklaring og ett mindre steg.'
    );
  }
  return null;
}

export async function persistTutorOutcome(
  data: TutorPersistence,
  sessionId: string,
  task: TutorTask | null,
  sourceMessageId: string,
  response: TutorTurnResponse,
  suppressTaskOutcome = false,
) {
  if (
    task &&
    (suppressTaskOutcome || response.suggestedActions?.includes('end_session'))
  )
    return;
  if (task) {
    const allowedConcepts = new Set(task.concept_keys);
    await Promise.all(
      response.learningEvidence
        .filter((evidence) => allowedConcepts.has(evidence.conceptKey))
        .map((evidence) =>
          data.recordLearningSignal(sessionId, {
            ...evidence,
            taskId: task.id,
            sourceMessageId,
            misconceptionCode: evidence.misconceptionCode ?? null,
            noteNb: evidence.noteNb ?? null,
          }),
        ),
    );

    const completed = response.taskState === 'completed';
    const checking =
      response.taskState === 'checking' ||
      response.taskState === 'ready_to_complete' ||
      response.taskState === 'needs_human_review';
    await data.updateTask(task.id, {
      status: completed ? 'completed' : checking ? 'checking' : 'in_progress',
      completedAt: completed
        ? (task.completed_at ?? new Date().toISOString())
        : null,
    });
  }
}

export function responseForTutorResult(
  result: Awaited<ReturnType<typeof generateTutorTurn>>,
  responseFormat: TutorRouteDependencies['responseFormat'],
  safetySignal: SafetySignal | null = null,
  safetyNotification?: {
    eventId?: string;
    childConsentRequired?: boolean;
    trustedAdultOnly?: boolean;
  },
  sessionProgress?: SessionProgress | null,
) {
  if (responseFormat === 'api') {
    return jsonResponse({
      reply: result.response.assistantMessageNb,
      model: result.model,
      mode: result.provider === 'gateway' ? 'gateway' : 'fallback',
      taskState: result.response.taskState,
      expectedStudentAction: result.response.expectedStudentAction,
      suggestedActions: result.response.suggestedActions ?? [],
      ...(safetySignal ? { safetyLevel: safetySignal.level } : {}),
      ...(safetySignal
        ? {
            safetyCode: safetySignal.code,
            safetyParentPolicy: safetySignal.parentPolicy,
            ...(safetyNotification?.eventId
              ? { safetyEventId: safetyNotification.eventId }
              : {}),
            ...(safetyNotification?.childConsentRequired
              ? { safetyChildConsentRequired: true }
              : {}),
            ...(safetyNotification?.trustedAdultOnly
              ? { safetyTrustedAdultOnly: true }
              : {}),
          }
        : {}),
      ...(result.usage ? { usage: result.usage } : {}),
      ...(sessionProgress
        ? {
            sessionProgress: {
              activeSegmentId: sessionProgress.activeSegmentId,
              activePhase: sessionProgress.activeSegment.phase,
              activeSegment: sessionProgress.activeSegment.label,
              nextSegment: sessionProgress.nextSegment?.label ?? null,
              remainingMinutes: sessionProgress.remainingMinutes,
              transitionDue: sessionProgress.transitionDue,
              isFinished: sessionProgress.isFinished,
            },
          }
        : {}),
    });
  }
  return jsonResponse(result.response);
}

function responseForStoredTutorMessage(
  content: string,
  storedTurn: TutorTurnResponse | null,
  responseFormat: TutorRouteDependencies['responseFormat'],
) {
  if (responseFormat === 'api') {
    return jsonResponse({
      reply: content,
      model: 'stored',
      mode: 'stored',
      taskState: storedTurn?.taskState ?? 'in_progress',
      expectedStudentAction: storedTurn?.expectedStudentAction ?? 'none',
      suggestedActions: storedTurn?.suggestedActions ?? [],
    });
  }
  return jsonResponse(
    storedTurn ?? {
      schemaVersion: 'tutor-turn.v0.1',
      assistantMessageNb: content,
      intent: 'feedback',
      taskState: 'in_progress',
      expectedStudentAction: 'none',
      hintLevel: 0,
      confidence: 0.5,
      learningEvidence: [],
      safetyFlags: ['none'],
    },
  );
}

function storageErrorResponse(error: unknown, fallback: string) {
  if (
    error instanceof TutorDataError &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return jsonResponse({ error: error.message }, error.status);
  }
  return jsonResponse({ error: fallback }, 503);
}

export async function POST(request: Request) {
  return handleTutorRequest(request);
}
