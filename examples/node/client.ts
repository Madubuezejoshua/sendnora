/**
 * Minimal Sendnaro client for YOUR SERVER. Never ship an API key to a browser or a mobile app,
 * never put it in a NEXT_PUBLIC_ variable, and never send it in a query string.
 *
 *   SENDNARO_API_KEY=sn_test_...        (sandbox)  or sn_live_... (live)
 *   SENDNARO_BASE_URL=http://localhost:3000/api/v1   (default; production: https://sendnaro.com/api/v1 once deployed)
 */
export interface SendnaroConfig {
  apiKey: string;
  baseUrl?: string;
}

export class SendnaroError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'SendnaroError';
  }
}

export function configFromEnv(): SendnaroConfig {
  const apiKey = process.env.SENDNARO_API_KEY;
  if (!apiKey) throw new Error('Set SENDNARO_API_KEY in your server environment');
  return { apiKey, baseUrl: process.env.SENDNARO_BASE_URL };
}

export async function sendnaro<T = Record<string, unknown>>(
  config: SendnaroConfig,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  options: { idempotencyKey?: string } = {},
): Promise<{ status: number; body: T }> {
  const base = (config.baseUrl ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: {
      code: string;
      message: string;
      request_id?: string;
      fields?: Record<string, string[]>;
    };
  };
  if (!res.ok) {
    const e = json.error;
    throw new SendnaroError(
      res.status,
      e?.code ?? 'unknown_error',
      e?.message ?? res.statusText,
      e?.request_id,
      e?.fields,
    );
  }
  return { status: res.status, body: json };
}
