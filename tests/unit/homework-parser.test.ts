import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomeworkParserError, parseHomeworkImages } from '../../apps/web/lib/ai/homework-parser';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MATTIS_HOMEWORK_API_KEY;
  delete process.env.MATTIS_HOMEWORK_ENDPOINT;
});

describe('homework image parsing', () => {
  it('turns a vision response into validated, curriculum-tagged tasks', async () => {
    process.env.MATTIS_HOMEWORK_API_KEY = 'test-key';
    process.env.MATTIS_HOMEWORK_ENDPOINT = 'https://example.invalid/v1/chat/completions';
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                schemaVersion: 'homework-parser-response.v0.1',
                tasks: [
                  {
                    pageNumber: 1,
                    sourceLabel: '4a',
                    sourceText: 'Løs 2x + 4 = 10',
                    normalizedText: 'Løs 2x + 4 = 10',
                    taskType: 'equation',
                    conceptKeys: ['algebra.equations', 'invented.concept'],
                    figureSpec: null,
                    confidence: 0.93,
                    estimatedMinutes: 6,
                  },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 80 },
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    const parsed = await parseHomeworkImages(
      [{ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg', pageNumber: 1 }],
      { gradeLevel: 10, courseCode: null },
    );

    expect(parsed.tasks).toEqual([
      expect.objectContaining({
        sourceLabel: '4a',
        normalizedText: 'Løs 2x + 4 = 10',
        conceptKeys: ['algebra.equations'],
      }),
    ]);
    const requestBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(requestBody.providerOptions.gateway.zeroDataRetention).toBe(true);
    expect(requestBody.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('fails closed when no validated task can be read', async () => {
    process.env.MATTIS_HOMEWORK_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  schemaVersion: 'homework-parser-response.v0.1',
                  tasks: [],
                }),
              },
            },
          ],
        }),
      ),
    );

    await expect(
      parseHomeworkImages([{ bytes: new Uint8Array([1]), mimeType: 'image/png', pageNumber: 1 }], {
        gradeLevel: null,
        courseCode: null,
      }),
    ).rejects.toMatchObject<HomeworkParserError>({ code: 'invalid_output' });
  });
});
