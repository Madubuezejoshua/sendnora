import { createHmac, timingSafeEqual } from 'node:crypto';
import axios from 'axios';
import type {
  InitializeTransactionParams,
  InitializeTransactionResult,
  PaymentGatewayProvider,
  VerifyTransactionResult,
} from './provider.interface.js';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Paystack adapter. Amounts are sent/received in the smallest currency
 * unit (kobo for NGN), matching our own minor-units representation
 * exactly, so no conversion is needed. Webhook signature verification uses
 * HMAC-SHA512 of the raw request body against the secret key, per
 * Paystack's documented scheme — this MUST run on the raw (unparsed) body,
 * so the webhook route mounts a raw-body parser for this path only.
 */
export class PaystackProvider implements PaymentGatewayProvider {
  readonly key = 'PAYSTACK' as const;

  constructor(private readonly secretKey: string) {}

  async initializeTransaction(
    params: InitializeTransactionParams,
  ): Promise<InitializeTransactionResult> {
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        reference: params.reference,
        amount: params.amountMinorUnits,
        currency: params.currency,
        email: params.customerEmail,
        callback_url: params.redirectUrl,
        metadata: params.metadata,
      },
      { headers: this.authHeaders(), timeout: 15_000 },
    );

    return {
      authorizationUrl: response.data.data.authorization_url,
      providerReference: response.data.data.reference,
      raw: response.data,
    };
  }

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: this.authHeaders(),
        timeout: 15_000,
      },
    );

    const data = response.data.data;
    return {
      successful: data.status === 'success',
      amountMinorUnits: data.amount,
      currency: data.currency,
      reference: data.reference,
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
      raw: response.data,
    };
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;
    const expected = createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    return safeCompare(expected, signatureHeader);
  }

  extractEventId(payload: Record<string, unknown>): string | undefined {
    const data = payload.data as Record<string, unknown> | undefined;
    const id = data?.id;
    return id !== undefined ? String(id) : undefined;
  }

  private authHeaders() {
    return { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json' };
  }
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
