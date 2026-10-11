import axios from 'axios';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Paystack Plan + Subscription API — used ONLY for platform billing (a
 * workspace paying for its own InvoiceTap plan), always with the
 * platform's own PAYSTACK_SECRET_KEY, never a workspace's configured
 * credentials (those are for that workspace collecting payment from ITS
 * OWN customers — a completely different merchant relationship). See
 * services/payments/provider-registry.ts for that other path.
 *
 * On successful first charge, Paystack auto-creates a recurring
 * subscription that charges the customer's saved card on the plan's
 * interval going forward, and sends `charge.success` (first + every
 * renewal), `invoice.payment_failed`, and `subscription.disable` webhook
 * events — handled in subscription-billing.service.ts.
 */

function paystackPlanName(planCode: string, interval: 'MONTHLY' | 'YEARLY'): string {
  return `invoicetap_${planCode.toLowerCase()}_${interval.toLowerCase()}`;
}

export interface EnsurePlanParams {
  secretKey: string;
  planCode: string;
  interval: 'MONTHLY' | 'YEARLY';
  amountMinorUnits: number;
  currency: string;
}

/**
 * Finds or creates the Paystack Plan for a given InvoiceTap plan+interval.
 * Idempotent by name (Paystack has no natural external-id field), so this
 * does one extra list call the first time a given plan/interval is
 * checked out — negligible cost since it's cached implicitly by Paystack
 * already existing on every call after the first.
 */
export async function ensurePaystackPlan(params: EnsurePlanParams): Promise<string> {
  const name = paystackPlanName(params.planCode, params.interval);
  const headers = {
    Authorization: `Bearer ${params.secretKey}`,
    'Content-Type': 'application/json',
  };

  const existing = await axios
    .get(`${PAYSTACK_BASE_URL}/plan`, { headers, params: { name }, timeout: 15_000 })
    .catch(() => null);
  const found = (
    existing?.data?.data as Array<{ name: string; plan_code: string }> | undefined
  )?.find((p) => p.name === name);
  if (found) return found.plan_code;

  const created = await axios.post(
    `${PAYSTACK_BASE_URL}/plan`,
    {
      name,
      amount: params.amountMinorUnits,
      interval: params.interval === 'MONTHLY' ? 'monthly' : 'annually',
      currency: params.currency,
    },
    { headers, timeout: 15_000 },
  );
  return created.data.data.plan_code;
}

export interface SubscriptionCheckoutParams {
  secretKey: string;
  email: string;
  paystackPlanCode: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}

export async function initializeSubscriptionCheckout(
  params: SubscriptionCheckoutParams,
): Promise<{ authorizationUrl: string; reference: string }> {
  const headers = {
    Authorization: `Bearer ${params.secretKey}`,
    'Content-Type': 'application/json',
  };
  const response = await axios.post(
    `${PAYSTACK_BASE_URL}/transaction/initialize`,
    {
      email: params.email,
      plan: params.paystackPlanCode,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    },
    { headers, timeout: 15_000 },
  );
  return {
    authorizationUrl: response.data.data.authorization_url,
    reference: response.data.data.reference,
  };
}
