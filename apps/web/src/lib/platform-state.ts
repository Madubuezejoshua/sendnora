import 'server-only';
import { getWebEnv } from './env.js';

export interface PlatformState {
  /** 'unknown' when the API cannot be reached: the site then makes no claim about live access. */
  state: 'free' | 'billing' | 'unknown';
  price: { amountMinor: number; currency: string } | null;
}

export async function getPlatformState(): Promise<PlatformState> {
  try {
    const env = getWebEnv();
    const base = env.API_INTERNAL_URL ?? env.NEXT_PUBLIC_API_URL;
    const res = await fetch(`${base}/api/v1/public/platform`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { state: 'unknown', price: null };
    const { data } = (await res.json()) as { data: { billingRequired: boolean; activationPrice: { amountMinor: number; currency: string } | null } };
    return { state: data.billingRequired ? 'billing' : 'free', price: data.activationPrice };
  } catch {
    return { state: 'unknown', price: null };
  }
}
