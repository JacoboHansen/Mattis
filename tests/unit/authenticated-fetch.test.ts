import { describe, expect, it, vi } from 'vitest';

import { fetchWithSessionRefresh } from '../../apps/web/lib/authenticated-fetch';

describe('fetchWithSessionRefresh', () => {
  it('returns successful protected requests without refreshing', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    const response = await fetchWithSessionRefresh('/api/tutor', undefined, fetcher);

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('refreshes an expired session and retries the original request once', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'Innloggingen er utløpt.' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ authenticated: true }))
      .mockResolvedValueOnce(
        Response.json({ reply: 'Hva vil du prøve først?' }),
      ) as unknown as typeof fetch;
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Jeg står fast.' }),
    };

    const response = await fetchWithSessionRefresh('/api/tutor', init, fetcher);

    expect(await response.json()).toEqual({ reply: 'Hva vil du prøve først?' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/tutor', init);
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/auth/session', { cache: 'no-store' });
    expect(fetcher).toHaveBeenNthCalledWith(3, '/api/tutor', init);
  });

  it('keeps the original 401 when the refresh token is invalid', async () => {
    const originalResponse = Response.json({ error: 'Innloggingen er utløpt.' }, { status: 401 });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(originalResponse)
      .mockResolvedValueOnce(Response.json({ authenticated: false })) as unknown as typeof fetch;

    const response = await fetchWithSessionRefresh('/api/tutor', undefined, fetcher);

    expect(response).toBe(originalResponse);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
