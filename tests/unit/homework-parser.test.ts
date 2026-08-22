import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomeworkParserError, parseHomeworkImages } from '../../apps/web/lib/ai/homework-parser';
import { gatewayProviderOptions } from '../../apps/web/lib/ai/privacy';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MATTIS_HOMEWORK_API_KEY;
  delete process.env.MATTIS_HOMEWORK_ENDPOINT;
  delete process.env.MATTIS_AI_ZDR;
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
                schemaVersion: 'homework-parser-response.v0.2',
                items: [
                  {
                    kind: 'example',
                    pageNumber: 1,
                    sourceLabel: 'Eksempel 4',
                    sourceText: 'Eksempel: 2x = 6, derfor x = 3',
                    normalizedText: 'Eksempel: \\(2x = 6\\), derfor \\(x = 3\\)',
                    taskType: null,
                    conceptKeys: [],
                    figureSpec: null,
                    confidence: 0.98,
                    estimatedMinutes: null,
                  },
                  {
                    kind: 'exercise',
                    pageNumber: 1,
                    sourceLabel: '4a',
                    sourceText: 'Løs 2x + 4 = 10',
                    normalizedText: 'Løs \\(2x + 4 = 10\\)',
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
        normalizedText: 'Løs \\(2x + 4 = 10\\)',
        conceptKeys: ['algebra.equations'],
      }),
    ]);
    const requestBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(requestBody).not.toHaveProperty('providerOptions');
    expect(requestBody).not.toHaveProperty('response_format');
    expect(requestBody.messages[0].content[1]).toEqual({ type: 'text', text: 'PAGE 1' });
    expect(requestBody.messages[0].content[2].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(requestBody.messages[0].content[0].text).toContain('example: Et gjennomregnet eksempel');
    expect(requestBody.messages[0].content[0].text).toContain('LaTeX');
  });

  it('only requests gateway ZDR when the deployment explicitly enables it', () => {
    expect(gatewayProviderOptions({})).toBeUndefined();
    expect(gatewayProviderOptions({ MATTIS_AI_ZDR: 'true' })).toEqual({
      gateway: { zeroDataRetention: true },
    });
  });

  it('retains the gateway status without retaining response content', async () => {
    process.env.MATTIS_HOMEWORK_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: 'Your team has restricted access to this model.',
            type: 'no_providers_available',
            statusCode: 403,
          },
          { status: 403 },
        ),
      ),
    );

    await expect(
      parseHomeworkImages([{ bytes: new Uint8Array([1]), mimeType: 'image/png', pageNumber: 1 }], {
        gradeLevel: null,
        courseCode: null,
      }),
    ).rejects.toMatchObject<HomeworkParserError>({
      code: 'bad_response',
      statusCode: 403,
      gatewayCode: 'no_providers_available',
      gatewayMessage: 'Your team has restricted access to this model.',
      message: 'Bildetolkeren svarte med en feil.',
    });
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
                  schemaVersion: 'homework-parser-response.v0.2',
                  items: [],
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

  it('parses up to ten images in ordered batches and combines usage', async () => {
    process.env.MATTIS_HOMEWORK_API_KEY = 'test-key';
    const fetcher = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const requestBody = JSON.parse(String(init.body));
      const pages = requestBody.messages[0].content
        .filter(
          (part: { type: string; text?: string }) =>
            part.type === 'text' && part.text?.startsWith('PAGE '),
        )
        .map((part: { text: string }) => Number(part.text.slice(5)));
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                schemaVersion: 'homework-parser-response.v0.2',
                items: pages.map((pageNumber: number) => ({
                  kind: 'exercise',
                  pageNumber,
                  sourceLabel: `${pageNumber}a`,
                  sourceText: `Regn ut ${pageNumber} + 1`,
                  normalizedText: `Regn ut \\(${pageNumber} + 1\\)`,
                  taskType: 'calculation',
                  conceptKeys: ['numbers.operations'],
                  figureSpec: null,
                  confidence: 0.9,
                  estimatedMinutes: 2,
                })),
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
    });
    vi.stubGlobal('fetch', fetcher);

    const parsed = await parseHomeworkImages(
      Array.from({ length: 10 }, (_, index) => ({
        bytes: new Uint8Array([index]),
        mimeType: 'image/jpeg' as const,
        pageNumber: index + 1,
      })),
      { gradeLevel: 8, courseCode: null },
    );

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(parsed.tasks.map((task) => task.sourceLabel)).toEqual([
      '1a',
      '2a',
      '3a',
      '4a',
      '5a',
      '6a',
      '7a',
      '8a',
      '9a',
      '10a',
    ]);
    expect(parsed.usage).toEqual({ inputTokens: 30, outputTokens: 15 });
  });

  it('accepts content parts and repairs unescaped LaTeX in a vision response', async () => {
    process.env.MATTIS_HOMEWORK_API_KEY = 'test-key';
    const raw = String.raw`{"schemaVersion":"homework-parser-response.v0.2","items":[{"kind":"exercise","pageNumber":1,"sourceLabel":"1a","sourceText":"Regn ut 2 + 2","normalizedText":"Regn ut \(2 + 2\)","taskType":"calculation","conceptKeys":["numbers.operations"],"figureSpec":null,"confidence":0.9,"estimatedMinutes":2}]}`;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [{ message: { content: [{ type: 'text', text: raw }] } }],
        }),
      ),
    );

    const parsed = await parseHomeworkImages(
      [{ bytes: new Uint8Array([1]), mimeType: 'image/png', pageNumber: 1 }],
      { gradeLevel: 8, courseCode: null },
    );

    expect(parsed.tasks[0]?.normalizedText).toContain('\\(');
  });
});
