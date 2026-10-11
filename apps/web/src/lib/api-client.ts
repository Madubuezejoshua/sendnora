import 'server-only';
import { cookies } from 'next/headers';
import { signApiToken } from '@invoicetap/shared/server/api-token';
import { auth } from '@/auth';
import { getWebEnv } from './env.js';
import { ACTIVE_WORKSPACE_COOKIE_NAME } from './constants.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Mints the short-lived trust-boundary token for the current request — see
 * ARCHITECTURE.md. Only ever called server-side (Server Components, Route
 * Handlers, Server Actions); never exposed to the browser, which is why
 * this file is marked `server-only`.
 */
export async function mintApiToken(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;

  const cookieStore = await cookies();
  const activeWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value;
  const env = getWebEnv();

  return signApiToken(
    { sub: session.user.id, activeWorkspaceId, isPlatformAdmin: session.user.isPlatformAdmin },
    env.API_TOKEN_SECRET,
  );
}

/**
 * Server-side typed fetch against apps/api, for use in Server Components /
 * Server Actions / Route Handlers. Client Components must go through
 * `/api/proxy/*` instead (see app/api/proxy/[...path]/route.ts) — the
 * browser never holds `API_TOKEN_SECRET` and cannot mint this token
 * itself.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await mintApiToken();
  const env = getWebEnv();
  const baseUrl = env.API_INTERNAL_URL ?? env.NEXT_PUBLIC_API_URL;

  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? res.statusText,
      body.error?.fieldErrors,
    );
  }

  return body as T;
}
