import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_COOKIE } from '../../apps/web/lib/auth-cookies';
import { config, proxy } from '../../apps/web/proxy';

function request(path = '/__test/session', cookie?: string) {
  const url = new URL(`http://localhost:3000${path}`);
  const cookies = new Map(
    (cookie ?? '').split(';').flatMap((entry) => {
      const [name, ...value] = entry.trim().split('=');
      return name ? [[name, { value: value.join('=') }]] : [];
    }),
  );
  return {
    url: url.toString(),
    nextUrl: url,
    cookies: { get: (name: string) => cookies.get(name) },
  } as Parameters<typeof proxy>[0];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('synthetic session visual-test route', () => {
  it('is covered by the proxy matcher', () => {
    expect(config.matcher).toContain('/__test/session');
  });

  it('allows the synthetic route without auth in local development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', '');

    expect(proxy(request()).status).toBe(200);
  });

  it('allows the synthetic route without auth in a Vercel preview', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');

    expect(proxy(request()).status).toBe(200);
  });

  it('does not create an auth bypass for production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');

    const response = proxy(request());
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('keeps other unauthenticated paths protected in preview', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');

    const response = proxy(request('/home'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('keeps the internal rewrite destination protected', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');

    const response = proxy(request('/visual-test/session'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('does not alter authenticated requests', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');

    expect(proxy(request('/__test/session', `${ACCESS_COOKIE}=synthetic`)).status).toBe(200);
  });

  it('sends an existing session straight through the session resolver from the entry route', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');

    const response = proxy(request('/', `${ACCESS_COOKIE}=synthetic`));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/api/auth/session?redirect=1',
    );
  });
});
