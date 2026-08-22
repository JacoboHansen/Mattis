type Fetcher = typeof fetch;

type SessionRefreshResult = {
  authenticated?: boolean;
};

/**
 * Retries a protected same-origin request once after refreshing the HttpOnly
 * Supabase session cookies. The original request must have a reusable body
 * (the browser can safely reuse the JSON and FormData bodies used by Mattis).
 */
export async function fetchWithSessionRefresh(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetcher: Fetcher = fetch,
) {
  const response = await fetcher(input, init);
  if (response.status !== 401) return response;

  const refreshResponse = await fetcher('/api/auth/session', { cache: 'no-store' });
  if (!refreshResponse.ok) return response;

  const refreshResult = (await refreshResponse.json().catch(() => ({}))) as SessionRefreshResult;
  if (!refreshResult.authenticated) return response;

  return fetcher(input, init);
}
