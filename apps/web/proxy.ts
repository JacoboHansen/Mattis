import { NextRequest, NextResponse } from 'next/server';

import { ACCESS_COOKIE, REFRESH_COOKIE } from './lib/auth-cookies';

export function proxy(request: NextRequest) {
  const hasSession =
    Boolean(request.cookies.get(ACCESS_COOKIE)?.value) ||
    Boolean(request.cookies.get(REFRESH_COOKIE)?.value);
  const isEntry = request.nextUrl.pathname === '/';

  if (!isEntry && !hasSession) return NextResponse.redirect(new URL('/', request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/home/:path*', '/onboarding/:path*', '/session/:path*', '/settings/:path*'],
};
