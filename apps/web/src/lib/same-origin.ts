import type { NextRequest } from 'next/server';

/** CSRF guard for cookie-authenticated mutations: a browser always sends Origin on cross-site writes. */
export function isCrossSiteWrite(req: NextRequest): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return false;
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') === 'cross-site';
  try {
    return (
      new URL(origin).host !== (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))
    );
  } catch {
    return true;
  }
}
