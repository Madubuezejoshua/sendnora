import 'server-only';
import { getWebEnv } from './env.js';

/** For unauthenticated public-document routes (/i, /q, /r) — no bearer token needed or possible. */
export async function publicApiFetch<T>(path: string): Promise<T | null> {
  const env = getWebEnv();
  const baseUrl = env.API_INTERNAL_URL ?? env.NEXT_PUBLIC_API_URL;
  const res = await fetch(`${baseUrl}/api/v1${path}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Public API request failed: ${res.status}`);
  return res.json();
}
