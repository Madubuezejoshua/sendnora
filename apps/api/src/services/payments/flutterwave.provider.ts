import { timingSafeEqual } from 'node:crypto';
import axios from 'axios';
import type {
  InitializeTransactionParams,
  InitializeTransactionResult,
  PaymentGatewayProvider,
  VerifyTransactionResult,
} from './provider.interface.js';

const FLUTTERWAVE_BASE_URL = 'https://api.flutterwave.com/v3';

/**
 * Flutterwave adapter. Amounts are sent/received in MAJOR units (e.g.
 * naira, not kobo) — Flutterwave's API is major-unit based, unlike
 * Paystack — so this adapter converts at its boundary using the currency's
 * minor-unit digit count, keeping every other layer of the app
 * minor-units-only. Webhook verification compares the static
 * `verif-hash` header against FLUTTERWAVE_WEBHOOK_SECRET_HASH configured
 * in the Flutterwave dashboard (not an HMAC of the body, per Flutterwave's
 * documented scheme).
 */
export class FlutterwaveProvider implements PaymentGatewayProvider {
  readonly key = 'FLUTTERWAVE' as const;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecretHash: string,
    private readonly minorUnitDigitsForCurrency: (currency: string) => number,
  ) {}

  async initializeTransaction(
    params: InitializeTransactionParams,
  ): Promise<InitializeTransactionResult> {
    const digits = this.minorUnitDigitsForCurrency(params.currency);
    const majorAmount = params.amountMinorUnits / 10 ** digits;

    const response = await axios.post(
      `${FLUTTERWAVE_BASE_URL}/payments`,
      {
        tx_ref: params.reference,
        amount: majorAmount,
        currency: params.currency,
        redirect_url: params.redirectUrl,
        customer: { email: params.customerEmail },
        meta: params.metadata,
      },
      { headers: this.authHeaders(), timeout: 15_000 },
    );

    return {
      authorizationUrl: response.data.data.link,
      providerReference: params.reference,
      raw: response.data,
    };
  }

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    const response = await axios.get(`${FLUTTERWAVE_BASE_URL}/transactions/verify_by_reference`, {
      headers: this.authHeaders(),
      params: { tx_ref: reference },
      timeout: 15_000,
    });

    const data = response.data.data;
    const digits = this.minorUnitDigitsForCurrency(data.currency);
    return {
      successful: data.status === 'successful',
      amountMinorUnits: Math.round(data.amount * 10 ** digits),
      currency: data.currency,
      reference: data.tx_ref,
      paidAt: data.created_at ? new Date(data.created_at) : null,
      raw: response.data,
    };
  }

  verifyWebhookSignature(_rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;
    return safeCompare(this.webhookSecretHash, signatureHeader);
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
