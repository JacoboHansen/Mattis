import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTutorDataClient, TutorDataError } from '../../apps/web/lib/supabase/data';

const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLIENT_MESSAGE_ID = '2934d9b3-cfbe-494a-9651-7fe4efdef411';

afterEach(() => {
  vi.restoreAllMocks();
  process.env.SUPABASE_URL = originalUrl;
  process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
});

function client(fetcher: typeof fetch) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
  return createTutorDataClient({
    accessToken: 'student-access-token',
    userId: 'student-1',
    fetcher,
  });
}

describe('TutorDataClient', () => {
  it('creates an owner-bound session with the publishable key and bearer token', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 'session-1',
              user_id: 'student-1',
              status: 'planned',
              current_phase: 'homework',
              duration_minutes: 45,
            },
          ]),
          { status: 201 },
        ),
    ) as typeof fetch;

    const session = await client(fetcher).createSession();
    expect(session.id).toBe('session-1');

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://example.supabase.co/rest/v1/sessions');
    expect(init?.headers).toMatchObject({
      apikey: 'publishable-test-key',
      Authorization: 'Bearer student-access-token',
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      user_id: 'student-1',
      status: 'planned',
      current_phase: 'homework',
      duration_minutes: 45,
    });
  });

  it('starts a new session immediately when requested', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 'session-1',
              user_id: 'student-1',
              status: 'active',
              current_phase: 'homework',
              duration_minutes: 25,
            },
          ]),
          { status: 201 },
        ),
    ) as typeof fetch;

    await client(fetcher).createSession({ durationMinutes: 25, startImmediately: true });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      status: 'active',
      duration_minutes: 25,
    });
    expect(body.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not fall back to a service-role key when publishable config is missing', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
    const fetcher = vi.fn(async () => new Response('[]', { status: 200 })) as typeof fetch;

    await expect(
      createTutorDataClient({
        accessToken: 'student-access-token',
        userId: 'student-1',
        fetcher,
      }).listSessions(),
    ).rejects.toMatchObject({
      code: 'missing_config',
      status: 503,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the owner filter on reads and deletes', async () => {
    const fetcher = vi.fn(async () => new Response('[]', { status: 200 })) as typeof fetch;
    const data = client(fetcher);

    expect(await data.getSession('session-1')).toBeNull();
    await data.deleteSession('session-1');

    expect(fetcher.mock.calls[0][0]).toContain('id=eq.session-1');
    expect(fetcher.mock.calls[0][0]).toContain('user_id=eq.student-1');
    expect(fetcher.mock.calls[1][0]).toContain('id=eq.session-1');
    expect(fetcher.mock.calls[1][0]).toContain('user_id=eq.student-1');
  });

  it('makes message retries idempotent by client message id', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('[]', { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'message-1',
              user_id: 'student-1',
              session_id: 'session-1',
              role: 'student',
              content_nb: 'Hva blir x?',
              client_message_id: CLIENT_MESSAGE_ID,
            },
          ]),
          { status: 200 },
        ),
      ) as unknown as typeof fetch;

    const message = await client(fetcher).appendMessage('session-1', {
      role: 'student',
      contentNb: 'Hva blir x?',
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(message.id).toBe('message-1');
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      Prefer: 'resolution=ignore-duplicates,return=representation',
    });
    expect(fetcher.mock.calls[1][0]).toContain(`client_message_id=eq.${CLIENT_MESSAGE_ID}`);
  });

  it('rejects non-UUID client message ids before making a request', async () => {
    const fetcher = vi.fn(async () => new Response('[]', { status: 200 })) as typeof fetch;

    await expect(
      client(fetcher).appendMessage('session-1', {
        role: 'tutor',
        contentNb: 'Prøv ett steg til.',
        clientMessageId: `${CLIENT_MESSAGE_ID}:tutor`,
      }),
    ).rejects.toMatchObject<TutorDataError>({ code: 'invalid_input', status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects invalid learning signal scores before making a request', async () => {
    const fetcher = vi.fn(async () => new Response('[]', { status: 200 })) as typeof fetch;

    await expect(
      client(fetcher).recordLearningSignal('session-1', {
        conceptKey: 'linear-equations',
        evidenceType: 'correct',
        score: 1.2,
        confidence: 0.8,
      }),
    ).rejects.toMatchObject<TutorDataError>({ code: 'invalid_input', status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('records AI metadata without accepting prompt or response content', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 'generation-1',
              user_id: 'student-1',
              capability: 'tutor',
              provider: 'local',
              model: 'fallback',
              status: 'succeeded',
            },
          ]),
          { status: 201 },
        ),
    ) as typeof fetch;

    const generation = await client(fetcher).recordAiGeneration({
      capability: 'tutor',
      provider: 'local',
      model: 'fallback',
      requestSchemaVersion: 'tutor-request.v0.1',
      responseSchemaVersion: 'tutor-turn.v0.1',
      status: 'succeeded',
      sessionId: 'session-1',
      safetyFlags: ['none'],
    });

    expect(generation.id).toBe('generation-1');
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      user_id: 'student-1',
      session_id: 'session-1',
      capability: 'tutor',
      status: 'succeeded',
    });
    expect(body).not.toHaveProperty('prompt');
    expect(body).not.toHaveProperty('response');
  });
});
