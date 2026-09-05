import { describe, expect, it, vi } from 'vitest';
import {
  executeLessonActions,
  type LessonData,
} from '../../apps/web/lib/ai/lesson-actions';
import {
  parseTutorTurnResponse,
  type TutorRequest,
  type TutorTurnResponse,
} from '../../apps/web/lib/ai/contracts';
import type { TutorSession, TutorTask } from '../../apps/web/lib/supabase/data';
import {
  handleTutorRequest,
  type TutorPersistence,
  isSessionEndRequest,
} from '../../apps/web/app/api/tutor/respond/route';

const session = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'active',
  duration_minutes: 20,
  started_at: new Date().toISOString(),
  plan_snapshot: {},
} as TutorSession;
const request: TutorRequest = {
  schemaVersion: 'tutor-request.v0.1',
  clientMessageId: '22222222-2222-4222-8222-222222222222',
  sessionId: session.id,
  message: 'La oss heller ta brøk.',
  history: [],
  locale: 'nb-NO',
};
const turn: TutorTurnResponse = {
  schemaVersion: 'tutor-turn.v0.1',
  assistantMessageNb: 'Vi tar brøk.',
  intent: 'orient',
  taskState: 'in_progress',
  expectedStudentAction: 'answer',
  hintLevel: 0,
  confidence: 0.9,
  learningEvidence: [],
  safetyFlags: ['none'],
  directive: {
    type: 'replace_task_set',
    topicNb: 'Deling av brøk',
    timing: 'now',
  },
};
const task = {
  id: '33333333-3333-4333-8333-333333333333',
  session_id: session.id,
  status: 'in_progress',
  phase: 'homework',
  normalized_text: 'Løs x + 1 = 2',
  concept_keys: ['algebra.equations'],
} as TutorTask;
function memory(initial: TutorTask[] = []) {
  const tasks = initial.map((item) => ({ ...item }));
  const data = {
    listTasks: vi.fn(async () => tasks.map((item) => ({ ...item }))),
    createTasks: vi.fn(async (_id, inputs) => {
      const created = inputs.map(
        (input) =>
          ({
            id: input.id,
            normalized_text: input.normalizedText,
            status: input.status,
            phase: input.phase,
            concept_keys: input.conceptKeys,
          }) as TutorTask,
      );
      tasks.push(...created);
      return created;
    }),
    updateTask: vi.fn(async (id, patch) => {
      const item = tasks.find((task) => task.id === id)!;
      Object.assign(item, {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.normalizedText
          ? { normalized_text: patch.normalizedText }
          : {}),
      });
      return item;
    }),
    updateSession: vi.fn(async () => session),
    createSchedule: vi.fn(async (input) => ({
      id: input.id!,
      starts_at: input.startsAt,
      duration_minutes: input.durationMinutes,
      recurrence_rule: input.recurrenceRule,
    })),
    createSession: vi.fn(async () => session),
    listSchedules: vi.fn(async () => []),
  } as unknown as LessonData;
  return { data, tasks };
}
const generateTasks = vi.fn(async () => ({
  titleNb: 'Deling av brøk',
  introNb: 'Prøv selv.',
  provider: 'gateway' as const,
  model: 'test',
  tasks: [
    {
      text: 'Regn ut 2 : 1/2.',
      taskType: 'calculation',
      conceptKeys: ['numbers.fractions' as const],
      estimatedMinutes: 3,
    },
  ],
}));

describe('conversation-led lesson actions', () => {
  it('creates the replacement before retiring homework and recovers without a duplicate set', async () => {
    const { data, tasks } = memory([task]);
    const result = await executeLessonActions({
      data,
      session,
      request,
      turn,
      generateTasks,
    });
    expect(tasks[0].status).toBe('skipped');
    expect(tasks[1].status).toBe('confirmed');
    expect(result.results.join()).toContain('2 : 1/2');
    await executeLessonActions({ data, session, request, turn, generateTasks });
    expect(data.createTasks).toHaveBeenCalledTimes(1);
  });
  it('keeps the current task if generating a replacement fails', async () => {
    const { data, tasks } = memory([task]);
    await expect(
      executeLessonActions({
        data,
        session,
        request,
        turn,
        generateTasks: async () => {
          throw new Error('offline');
        },
      }),
    ).rejects.toThrow('offline');
    expect(tasks[0].status).toBe('in_progress');
    expect(data.updateTask).not.toHaveBeenCalled();
  });
  it('does not create tasks until the current task is finished when deferred', async () => {
    const { data } = memory([task]);
    await executeLessonActions({
      data,
      session,
      request: { ...request, taskId: task.id },
      turn: {
        ...turn,
        directive: { ...turn.directive!, timing: 'after_current_task' },
      },
      generateTasks,
    });
    expect(data.createTasks).not.toHaveBeenCalled();
  });
  it('does not mutate the lesson during a safety response', async () => {
    const { data } = memory([task]);
    await executeLessonActions({
      data,
      session,
      request,
      turn: {
        ...turn,
        safetyFlags: ['self_harm'],
        lessonPlan: {
          confirmed: true,
          activeIndex: 0,
          segments: [{ label: 'Brøk', phase: 'repetition', minutes: 10 }],
        },
      },
      generateTasks,
    });
    expect(data.updateSession).not.toHaveBeenCalled();
    expect(data.createTasks).not.toHaveBeenCalled();
  });
  it('corrects homework in chat and only starts after confirmation', async () => {
    const { data, tasks } = memory([{ ...task, status: 'detected' }]);
    const reviewSession = { ...session, status: 'reviewing' } as TutorSession;
    const reviewTurn = {
      ...turn,
      directive: { type: 'none' as const },
      homeworkReview: {
        confirmed: false,
        corrections: [{ taskId: task.id, text: 'Katetene er 6 og 8 cm.' }],
      },
    };
    const corrected = await executeLessonActions({
      data,
      session: reviewSession,
      request,
      turn: reviewTurn,
    });
    expect(tasks[0].normalized_text).toBe('Katetene er 6 og 8 cm.');
    expect(tasks[0].status).toBe('detected');
    expect(corrected.effects.setupStep).toBe('review');
    const confirmed = await executeLessonActions({
      data,
      session: reviewSession,
      request,
      turn: {
        ...reviewTurn,
        homeworkReview: { confirmed: true, corrections: [] },
      },
    });
    expect(tasks[0].status).toBe('confirmed');
    expect(confirmed.effects.setupStep).toBe('active');
  });
  it('rejects corrections referring to an unrelated task before any writes', async () => {
    const { data } = memory([{ ...task, status: 'detected' }]);
    await expect(
      executeLessonActions({
        data,
        session: { ...session, status: 'reviewing' },
        request,
        turn: {
          ...turn,
          homeworkReview: {
            confirmed: true,
            corrections: [
              { taskId: request.clientMessageId!, text: 'Wrong task' },
            ],
          },
        },
      }),
    ).rejects.toThrow();
    expect(data.updateTask).not.toHaveBeenCalled();
  });
  it('does not save a past appointment or claim that it did', async () => {
    const { data } = memory();
    const result = await executeLessonActions({
      data,
      session,
      request,
      turn: {
        ...turn,
        directive: { type: 'none' },
        scheduleRequest: {
          mode: 'next',
          plannedAt: '2020-01-01T17:00:00+01:00',
          durationMinutes: 20,
        },
      },
    });
    expect(data.createSchedule).not.toHaveBeenCalled();
    expect(result.results.join()).toContain('ikke lagret');
  });
  it('reuses an existing appointment without creating duplicates', async () => {
    const { data } = memory();
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    vi.mocked(data.listSchedules).mockResolvedValue([
      {
        id: 'existing',
        enabled: true,
        starts_at: startsAt,
        duration_minutes: 20,
        recurrence_rule: null,
      },
    ] as Awaited<ReturnType<LessonData['listSchedules']>>);
    await executeLessonActions({
      data,
      session,
      request,
      turn: {
        ...turn,
        directive: { type: 'none' },
        scheduleRequest: {
          mode: 'next',
          plannedAt: startsAt,
          durationMinutes: 20,
        },
      },
    });
    expect(data.createSchedule).not.toHaveBeenCalled();
    expect(data.createSession).not.toHaveBeenCalled();
  });
  it('validates bounded plans and rejects ambiguous calendar values', () => {
    expect(
      parseTutorTurnResponse({
        ...turn,
        lessonPlan: {
          confirmed: true,
          activeIndex: 0,
          segments: [{ label: 'Brøk', phase: 'repetition', minutes: 10 }],
        },
        learnerProfileUpdate: {
          goal: 'Bli tryggere',
          workMode: 'Lekser',
          scheduleMode: 'flexible',
        },
      }).ok,
    ).toBe(true);
    expect(
      parseTutorTurnResponse({
        ...turn,
        lessonPlan: {
          confirmed: true,
          activeIndex: 4,
          segments: [{ label: 'Brøk', phase: 'repetition', minutes: 10 }],
        },
      }).ok,
    ).toBe(false);
    expect(
      parseTutorTurnResponse({
        ...turn,
        scheduleRequest: {
          mode: 'next',
          plannedAt: '2026-09-10T17:00',
          durationMinutes: 20,
        },
      }).ok,
    ).toBe(false);
  });
  it('recognizes a tired learner stopping without treating negation as a stop', () => {
    expect(isSessionEndRequest('Kan vi bare stoppe?')).toBe(true);
    expect(isSessionEndRequest('Jeg orker ikke mer')).toBe(true);
    expect(isSessionEndRequest('Jeg vil ikke avslutte økten')).toBe(false);
  });
});

it('publishes one final message after saving a schedule and replays it without repeating the action', async () => {
  const { handleTutorRequest } =
    await import('../../apps/web/app/api/tutor/respond/route');
  const { data } = memory();
  const messages: Array<Record<string, unknown>> = [];
  const persistence = {
    ...data,
    getSession: vi.fn(async () => session),
    getProfile: vi.fn(async () => null),
    listMastery: vi.fn(async () => []),
    listMessages: vi.fn(async () => messages),
    findMessageByClientMessageId: vi.fn(
      async (id: string) =>
        messages.find((message) => message.client_message_id === id) ?? null,
    ),
    appendMessage: vi.fn(
      async (
        sessionId: string,
        input: {
          clientMessageId: string;
          contentNb: string;
          role: string;
          metadata?: unknown;
        },
      ) => {
        const message = {
          id: input.clientMessageId,
          client_message_id: input.clientMessageId,
          session_id: sessionId,
          role: input.role,
          content_nb: input.contentNb,
          metadata: input.metadata,
        };
        messages.push(message);
        return message;
      },
    ),
    recordAiGeneration: vi.fn(async () => ({})),
  };
  const generate = vi.fn(async (context: TutorRequest) => ({
    response: context.actionResults
      ? {
          ...turn,
          assistantMessageNb: 'Da sees vi i morgen klokka 17.',
          directive: { type: 'none' as const },
        }
      : {
          ...turn,
          directive: { type: 'none' as const },
          scheduleRequest: {
            mode: 'next' as const,
            plannedAt: new Date(Date.now() + 86400000).toISOString(),
            durationMinutes: 20,
          },
        },
    provider: 'gateway' as const,
    model: 'test',
  }));
  const call = () =>
    handleTutorRequest(
      new Request('http://localhost/api/tutor/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          clientMessageId: request.clientMessageId,
          message: 'I morgen klokka 17, 20 minutter.',
        }),
      }),
      {
        accessToken: 'test',
        authenticate: async () => ({ id: 'test-user' }),
        dataClient:
          persistence as unknown as import('../../apps/web/app/api/tutor/respond/route').TutorPersistence,
        responseFormat: 'api',
        generate,
      },
    );
  const response = await call();
  expect(response.status).toBe(200);
  expect((await response.json()).reply).toBe('Da sees vi i morgen klokka 17.');
  expect(messages.filter((message) => message.role === 'tutor')).toHaveLength(
    1,
  );
  expect(generate).toHaveBeenCalledTimes(2);
  const retry = await call();
  expect(retry.status).toBe(200);
  expect((await retry.json()).reply).toBe('Da sees vi i morgen klokka 17.');
  expect(generate).toHaveBeenCalledTimes(2);
  expect(data.createSchedule).toHaveBeenCalledTimes(1);
  expect(messages).toHaveLength(2);
});

describe('one published reply per operational turn', () => {
  it('saves an appointment before publishing one reply and replays it without another action', async () => {
    const { data: actions } = memory();
    const stored: Array<Record<string, unknown>> = [];
    const appendMessage = vi.fn(async (sessionId, input) => {
      const message = {
        ...input,
        id: input.clientMessageId,
        session_id: sessionId,
        client_message_id: input.clientMessageId,
        content_nb: input.contentNb,
        task_id: input.taskId ?? null,
      };
      stored.push(message);
      return message;
    });
    const data = {
      ...actions,
      getSession: async () => session,
      getProfile: async () => null,
      listMastery: async () => [],
      listMessages: async () => stored,
      appendMessage,
      findMessageByClientMessageId: async (id: string) =>
        stored.find((item) => item.client_message_id === id) ?? null,
      recordAiGeneration: async () => ({}),
    } as unknown as TutorPersistence;
    const plannedAt = new Date(Date.now() + 86400000).toISOString();
    const generate = vi.fn(async (context: TutorRequest) => ({
      provider: 'gateway' as const,
      model: 'test',
      response: context.actionResults
        ? {
            ...turn,
            assistantMessageNb: 'Da er neste time avtalt.',
            directive: { type: 'none' as const },
          }
        : {
            ...turn,
            directive: { type: 'none' as const },
            scheduleRequest: {
              mode: 'next' as const,
              plannedAt,
              durationMinutes: 20,
            },
          },
    }));
    const post = () =>
      handleTutorRequest(
        new Request('http://localhost/api/tutor/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            clientMessageId: request.clientMessageId,
            message: 'I morgen klokka 17 passer.',
          }),
        }),
        {
          accessToken: 'test',
          authenticate: async () => ({ id: 'test-user' }),
          dataClient: data,
          generate,
          responseFormat: 'api',
        },
      );
    const response = await post();
    expect(response.status).toBe(200);
    expect((await response.json()).reply).toBe('Da er neste time avtalt.');
    expect(stored.filter((item) => item.role === 'tutor')).toHaveLength(1);
    expect(actions.createSchedule).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].actionResults).toContain(
      'Avtalen er lagret',
    );
    const replay = await post();
    expect(replay.status).toBe(200);
    expect((await replay.json()).reply).toBe('Da er neste time avtalt.');
    expect(actions.createSchedule).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(stored.filter((item) => item.role === 'tutor')).toHaveLength(1);
  });
});
