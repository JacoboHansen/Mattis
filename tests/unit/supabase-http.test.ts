import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isAllowedEmail,
  isValidOtp,
  normalizeEmail,
  requestEmailOtp,
  verifyEmailOtp,
} from '../../apps/web/lib/supabase-http';

const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const originalAllowed = process.env.MATTIS_ALLOWED_EMAILS;

afterEach(() => {
  vi.restoreAllMocks();
  process.env.SUPABASE_URL = originalUrl;
  process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  process.env.MATTIS_ALLOWED_EMAILS = originalAllowed;
});

describe('email OTP helpers', () => {
  it('normalizes and restricts the closed-test email', () => {
    process.env.MATTIS_ALLOWED_EMAILS = 'pilot@example.com';

    expect(normalizeEmail('  PILOT@EXAMPLE.COM ')).toBe('pilot@example.com');
    expect(isAllowedEmail('PILOT@EXAMPLE.COM')).toBe(true);
    expect(isAllowedEmail('another@example.com')).toBe(false);
  });

  it('accepts only six numeric OTP characters', () => {
    expect(isValidOtp('123456')).toBe(true);
    expect(isValidOtp('12345')).toBe(false);
    expect(isValidOtp('12345a')).toBe(false);
  });

  it('requests a Supabase email OTP without exposing credentials to the browser', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;

    await requestEmailOtp('pilot@example.com', fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://example.supabase.co/auth/v1/otp');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      email: 'pilot@example.com',
      create_user: true,
    });
  });

  it('parses the verified Supabase session', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            user: { id: 'user-1', email: 'pilot@example.com' },
          }),
          { status: 200 },
        ),
    ) as typeof fetch;

    const session = await verifyEmailOtp('pilot@example.com', '123456', fetcher);

    expect(session.user.id).toBe('user-1');
    expect(session.access_token).toBe('access-token');
  });
});
