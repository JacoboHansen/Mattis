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

    expect(result.crops.get('task-1')).toEqual({
      x: 0.08,
      y: 0.12,
      width: 0.68,
      height: 0.3,
    });
    expect(result.usage).toEqual({ inputTokens: 220, outputTokens: 55 });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe('google/gemini-3-flash');
    expect(body.messages[0].content[1].image_url.detail).toBe('high');
    expect(body.messages[0].content[0].text).toContain('box_2d');
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

    expect(result.crops.size).toBe(0);
  });
});
