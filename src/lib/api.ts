// Sendnaro API Client — holds session Bearer token strictly in memory (never localStorage)

let inMemorySessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  inMemorySessionToken = token;
}

export function getSessionToken(): string | null {
  return inMemorySessionToken;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  workspaceId: string;
  workspaceName: string;
}

export interface ApiErrorShape {
  code?: string;
  message?: string;
  request_id?: string;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<{ ok: boolean; status: number; data?: T; error?: ApiErrorShape }> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(inMemorySessionToken ? { Authorization: `Bearer ${inMemorySessionToken}` } : {}),
    ...options.headers,
  };

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: json?.error ?? { code: 'REQUEST_FAILED', message: `Request failed (${res.status})` },
    };
  }
  return {
    ok: true,
    status: res.status,
    data: (json?.data !== undefined ? json.data : json) as T,
  };
}

export async function sandboxRelayCall<T = Record<string, unknown>>(
  sandboxKey: string,
  method: string,
  endpointPath: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<{ ok: boolean; status: number; body: T }> {
  const headers: Record<string, string> = {
    'X-Sandbox-Key': sandboxKey,
    ...(inMemorySessionToken ? { Authorization: `Bearer ${inMemorySessionToken}` } : {}),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };

  const res = await fetch(`/api/sandbox${endpointPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const parsed = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, body: parsed };
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  GBP: '£',
  EUR: '€',
  KES: 'KSh ',
  GHS: 'GH₵',
};

export function formatMoney(minorUnits: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const major = minorUnits / 100;
  return `${symbol}${major.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatTimestamp(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
