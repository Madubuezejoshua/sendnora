import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

/**
 * Uses the edge-safe config (no Prisma/argon2) rather than the full `@/auth`
 * — Next.js Middleware always runs on the Edge runtime, which can't load
 * either. See auth.config.ts for why this only does a lightweight,
 * JWT-only auth check rather than the full DB-backed session validation.
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/i/',
  '/q/',
  '/r/',
  '/pay/',
  '/api/auth',
  '/api/health',
  // The public product API authenticates with API keys inside apps/api; it must not hit the session redirect.
  '/api/v1',
];

const MARKETING_PATHS = new Set(['/', '/docs', '/pricing', '/contact', '/privacy', '/terms']);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = Boolean(req.auth?.user);

  const isPublic =
    MARKETING_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isPublic) {
    if (isAuthed && (pathname === '/login' || pathname === '/register')) {
      return NextResponse.redirect(new URL('/console', req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/admin')) {
    if (!isAuthed) return NextResponse.redirect(new URL('/login', req.url));
    if (!req.auth?.user.isPlatformAdmin) return NextResponse.redirect(new URL('/console', req.url));
    return NextResponse.next();
  }

  if (!isAuthed) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/|manifest.webmanifest).*)'],
};
