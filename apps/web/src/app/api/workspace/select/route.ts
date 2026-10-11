import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_WORKSPACE_COOKIE_NAME } from '@/lib/constants';

/**
 * Sets the active-workspace cookie and redirects. Server Components can't
 * mutate cookies directly (Next.js only allows it in Route Handlers,
 * Server Actions, and Middleware), so the (app) layout redirects here on
 * first login (no workspace selected yet) instead of setting the cookie
 * itself.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const requested = req.nextUrl.searchParams.get('redirect') ?? '';
  // same-site paths only — never let this become an open redirect
  const redirectTo = /^\/(?![/\\])/.test(requested) ? requested : '/dashboard';

  if (!id) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  const res = NextResponse.redirect(new URL(redirectTo, req.url));
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE_NAME, id, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return res;
}
