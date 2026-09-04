import { afterEach, describe, expect, it, vi } from 'vitest';

import { locateHomeworkFigures } from '../../apps/web/lib/ai/homework-figure-locator';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('homework figure locator', () => {
  it('localizes a task figure with Gemini-style normalized boxes', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                matches: [
                  {
                    taskKey: 'task-1',
                    kind: 'graph',
                    altNb: 'En graf',
                    box_2d: [120, 80, 420, 760],
                    confidence: 0.94,
                  },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 220, completion_tokens: 55 },
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    const result = await locateHomeworkFigures(
      [
        {
          bytes: new Uint8Array([1, 2]),
          mimeType: 'image/jpeg',
          pageNumber: 1,
        },
      ],
      [
        {
          taskKey: 'task-1',
          pageNumber: 1,
          sourceLabel: '3b',
          normalizedText: 'Les av grafen.',
          figureSpec: { kind: 'graph', altNb: 'En graf' },
        },
      ],
      {
        model: 'google/gemini-3-flash',
        endpoint: 'https://example.invalid/v1/chat/completions',
        apiKey: 'test-key',
      },
    );

    expect(result.matches.get('task-1')).toEqual({
      crop: { x: 0.08, y: 0.12, width: 0.68, height: 0.3 },
      kind: 'graph',
      altNb: 'En graf',
    });
    expect(result.usage).toEqual({ inputTokens: 220, outputTokens: 55 });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe('google/gemini-3-flash');
    expect(body.max_tokens).toBe(4096);
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe(
      'homework_figure_locations',
    );
    expect(body.messages[0].content[1].image_url.detail).toBe('high');
    expect(body.messages[0].content[0].text).toContain('box_2d');
  });

  it('uses a low-reasoning fallback when the first model returns no final answer', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              finish_reason: 'length',
              message: { content: '', reasoning_details: [{ type: 'text' }] },
            },
          ],
          usage: {
            prompt_tokens: 180,
            completion_tokens: 1000,
            completion_tokens_details: { reasoning_tokens: 1000 },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content:
                  '{"matches":[{"taskKey":"task-1","box_2d":[100,200,500,800]}]}',
              },
            },
          ],
          usage: { prompt_tokens: 160, completion_tokens: 30 },
        }),
      );
    vi.stubGlobal('fetch', fetcher);

    const result = await locateHomeworkFigures(
      [{ bytes: new Uint8Array([1]), mimeType: 'image/jpeg', pageNumber: 1 }],
      [
        {
          taskKey: 'task-1',
          pageNumber: 1,
          sourceLabel: '4a',
          normalizedText: 'Bruk figuren til å finne arealet.',
          figureSpec: { kind: 'diagram', altNb: 'En geometrisk figur' },
        },
      ],
      {
        model: 'google/gemini-3.8-flash',
        fallbackModel: 'google/gemini-3.5-flash-lite',
        endpoint: 'https://example.invalid/v1/chat/completions',
        apiKey: 'test-key',
      },
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    const primaryBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const fallbackBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(primaryBody.model).toBe('google/gemini-3.8-flash');
    expect(primaryBody.reasoning).toEqual({ effort: 'low' });
    expect(primaryBody.max_tokens).toBe(4096);
    expect(fallbackBody.model).toBe('google/gemini-3.5-flash-lite');
    expect(fallbackBody.reasoning).toEqual({ effort: 'minimal' });
    expect(fallbackBody.max_tokens).toBe(4096);
    expect(result.matches.get('task-1')).toEqual({
      crop: { x: 0.2, y: 0.1, width: 0.6, height: 0.4 },
      kind: 'diagram',
      altNb: 'En geometrisk figur',
    });
    expect(result.usage).toEqual({ inputTokens: 340, outputTokens: 1030 });
  });

  it('does not create a crop from malformed or incomplete boxes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                content:
                  '{"matches":[{"taskKey":"task-1","box_2d":[10,20,20]}]}',
              },
            },
          ],
        }),
      ),
    );

    const result = await locateHomeworkFigures(
      [{ bytes: new Uint8Array([1]), mimeType: 'image/png', pageNumber: 1 }],
      [
        {
          taskKey: 'task-1',
          pageNumber: 1,
          sourceLabel: null,
          normalizedText: 'Se på figuren.',
          figureSpec: { kind: 'diagram', altNb: 'En figur' },
        },
      ],
      {
        model: 'google/gemini-3-flash',
        endpoint: 'https://example.invalid/v1/chat/completions',
        apiKey: 'test-key',
      },
    );

    expect(result.matches.size).toBe(0);
  });

  it('accepts alternate response and coordinate formats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  figures: [
                    {
                      task_key: 'task-1',
                      box: {
                        left: '8%',
                        top: '12%',
                        right: '76%',
                        bottom: '42%',
                      },
                    },
                  ],
                }),
              },
            },
          ],
        }),
      ),
    );

    const result = await locateHomeworkFigures(
      [{ bytes: new Uint8Array([1]), mimeType: 'image/png', pageNumber: 1 }],
      [
        {
          taskKey: 'task-1',
          pageNumber: 1,
          sourceLabel: '3b',
          normalizedText: 'Les av grafen.',
          figureSpec: null,
        },
      ],
      {
        model: 'google/gemini-3-flash',
        endpoint: 'https://example.invalid/v1/chat/completions',
        apiKey: 'test-key',
      },
    );

    expect(result.matches.get('task-1')?.crop).toEqual({
      x: 0.08,
      y: 0.12,
      width: 0.68,
      height: 0.3,
    });
  });

  it('accepts a direct JSON array response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                content:
                  '[{"taskKey":"task-1","box_2d":[0.12,0.08,0.42,0.76]}]',
              },
            },
          ],
        }),
      ),
    );

    const result = await locateHomeworkFigures(
      [{ bytes: new Uint8Array([1]), mimeType: 'image/png', pageNumber: 1 }],
      [
        {
          taskKey: 'task-1',
          pageNumber: 1,
          sourceLabel: '3b',
          normalizedText: 'Les av grafen.',
          figureSpec: null,
        },
      ],
      {
        model: 'google/gemini-3-flash',
        endpoint: 'https://example.invalid/v1/chat/completions',
        apiKey: 'test-key',
      },
    );

    expect(result.matches.get('task-1')?.crop).toEqual({
      x: 0.08,
      y: 0.12,
      width: 0.68,
      height: 0.3,
    });
  });

  it('accepts nested parts when the gateway omits message.content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                parts: [
                  {
                    text: JSON.stringify({
                      matches: [
                        {
                          taskKey: 'task-1',
                          box_2d: [120, 80, 420, 760],
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      ),
    );

    const result = await locateHomeworkFigures(
      [{ bytes: new Uint8Array([1]), mimeType: 'image/png', pageNumber: 1 }],
      [
        {
          taskKey: 'task-1',
          pageNumber: 1,
          sourceLabel: '3b',
          normalizedText: 'Les av grafen.',
          figureSpec: null,
        },
      ],
      {
        model: 'google/gemini-3-flash',
        endpoint: 'https://example.invalid/v1/chat/completions',
        apiKey: 'test-key',
      },
    );

    expect(result.matches.get('task-1')?.crop).toEqual({
      x: 0.08,
      y: 0.12,
      width: 0.68,
      height: 0.3,
    });
  });
});
