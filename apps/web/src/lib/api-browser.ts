'use client';

/**
 * Browser-side fetch helper. Always calls the same-origin `/api/proxy/*`
 * route (never apps/api directly) — the browser has no way to mint the
 * trust-boundary token, so the proxy route does that server-side from the
 * visitor's session cookie. See app/api/proxy/[...path]/route.ts.
 */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiBrowserFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? res.statusText,
      body.error?.fieldErrors,
    );
  }

  return body as T;
}
