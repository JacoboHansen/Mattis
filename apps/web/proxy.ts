import { NextRequest, NextResponse } from 'next/server';

import { ACCESS_COOKIE, REFRESH_COOKIE } from './lib/auth-cookies';

const SYNTHETIC_SESSION_TEST_PATH = '/__test/session';

function isSyntheticSessionTestPath(pathname: string) {
  return pathname === SYNTHETIC_SESSION_TEST_PATH;
}

function isPreviewOrDevelopment() {
  return process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';
}

export function proxy(request: NextRequest) {
  if (isSyntheticSessionTestPath(request.nextUrl.pathname) && isPreviewOrDevelopment()) {
    return NextResponse.next();
  }

  const hasSession =
    Boolean(request.cookies.get(ACCESS_COOKIE)?.value) ||
    Boolean(request.cookies.get(REFRESH_COOKIE)?.value);
  const isEntry = request.nextUrl.pathname === '/';

  if (isEntry && hasSession) {
    return NextResponse.redirect(new URL('/api/auth/session?redirect=1', request.url));
  }

  if (!isEntry && !hasSession) return NextResponse.redirect(new URL('/', request.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/home/:path*',
    '/onboarding/:path*',
    '/progress/:path*',
    '/profiles/:path*',
    '/parent/:path*',
    '/session/:path*',
    '/settings/:path*',
    '/__test/session',
    '/visual-test/session',
  ],
};
