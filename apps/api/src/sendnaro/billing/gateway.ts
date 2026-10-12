import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';

/**
 * Gateway used ONLY for Sendnaro's own one-time activation payment, on the platform's Paystack
 * account. It is unrelated to any merchant's customer payments. All access decisions rest on
 * server-to-server `verify`, never on a redirect, a webhook body or a client claim.
 */
export interface GatewayVerification {
  status: 'success' | 'failed' | 'abandoned' | 'pending';
  amountMinor: number;
  currency: string;
  transactionId: string;
  livemode: boolean;
}

export interface ActivationGateway {
  readonly name: string;
  isConfigured(): boolean;
  /** True when the configured credentials are live-mode (sk_live_). */
  isLiveMode(): boolean;
  initialize(input: {
    reference: string;
    amountMinor: number;
    currency: string;
    email: string;
    callbackUrl: string;
  }): Promise<{ checkoutUrl: string }>;
  verify(reference: string): Promise<GatewayVerification>;
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
}

const PAYSTACK = 'https://api.paystack.co';

export const paystackActivationGateway: ActivationGateway = {
  name: 'paystack',
  isConfigured: () => Boolean(parseApiEnv().PAYSTACK_SECRET_KEY),
  isLiveMode: () => Boolean(parseApiEnv().PAYSTACK_SECRET_KEY?.startsWith('sk_live_')),

  async initialize(input) {
    const key = parseApiEnv().PAYSTACK_SECRET_KEY;
    if (!key) throw new AppError('SERVICE_UNAVAILABLE', 'The payment gateway is not configured');
    const res = await fetch(`${PAYSTACK}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: { purpose: 'sendnaro_activation' },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      data?: { authorization_url?: string };
    };
    if (!res.ok || !json.status || !json.data?.authorization_url) {
      throw new AppError('SERVICE_UNAVAILABLE', 'Could not start the checkout. Please try again.');
    }
    return { checkoutUrl: json.data.authorization_url };
  },

  async verify(reference) {
    const key = parseApiEnv().PAYSTACK_SECRET_KEY;
    if (!key) throw new AppError('SERVICE_UNAVAILABLE', 'The payment gateway is not configured');
    const res = await fetch(`${PAYSTACK}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      data?: { status?: string; amount?: number; currency?: string; id?: number; domain?: string };
    };
    if (!res.ok || !json.status || !json.data) {
      throw new AppError('PAYMENT_VERIFICATION_FAILED', 'The payment could not be verified');
    }
    const s = json.data.status;
    return {
      status:
        s === 'success'
          ? 'success'
          : s === 'failed'
            ? 'failed'
            : s === 'abandoned'
              ? 'abandoned'
              : 'pending',
      amountMinor: json.data.amount ?? 0,
      currency: (json.data.currency ?? '').toUpperCase(),
      transactionId: String(json.data.id ?? ''),
      livemode: json.data.domain === 'live',
    };
  },

  verifyWebhookSignature(rawBody, signature) {
    const key = parseApiEnv().PAYSTACK_SECRET_KEY;
    if (!key || !signature) return false;
    const expected = createHmac('sha512', key).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  },
};

let override: ActivationGateway | null = null;
/** Test seam: replaces only the HTTP gateway; all verification and entitlement logic stays real. */
export function setActivationGatewayForTests(g: ActivationGateway | null): void {
  override = g;
}
export function getActivationGateway(): ActivationGateway {
  return override ?? paystackActivationGateway;
}
