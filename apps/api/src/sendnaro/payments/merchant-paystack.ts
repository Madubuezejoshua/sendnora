import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { prisma } from '@sendnaro/database';
import { decryptSecret } from '@sendnaro/database/encryption';
import { AppError } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';
import { logger } from '../../config/logger.js';
import { writeAuditLog } from '../../services/audit.service.js';
import type { SnContext } from '../context.js';
import { createInvoice } from '../v1/invoices.service.js';
import { createInvoiceSchema } from '../v1/schemas.js';

/**
 * Signed merchant purchase events (integration pattern B).
 *
 * The merchant points THEIR Paystack webhook at /api/v1/webhooks/merchant/paystack/<sourceId>. We verify
 * the signature with THEIR secret key over the raw bytes, then turn a verified `charge.success` into a
 * receipt through the very same pipeline as the authenticated API (so plan gate, consent, idempotency,
 * limits and delivery all apply). It is independent of Sendnaro's own activation payments: a merchant's
 * customer paying a merchant can never activate that merchant's Sendnaro licence.
 *
 * Merchants pass what Sendnaro needs in the Paystack transaction `metadata.sendnaro`:
 *   { customer_name, whatsapp_phone, consent_whatsapp: true, customer_id?, items?: [{description, quantity, unit_amount_minor}] }
 * Without a phone and recorded consent the event is acknowledged and ignored (nothing is sent).
 */
export type MerchantEventOutcome =
  | {
      status: 200;
      body: {
        received: true;
        result: 'created' | 'duplicate' | 'ignored';
        reason?: string;
        invoice_id?: string;
      };
    }
  | { status: 401 | 404; body: null };

function signatureValid(secret: string, raw: Buffer, header: string | undefined): boolean {
  if (!header) return false;
  const expected = createHmac('sha512', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface PaystackEvent {
  event?: string;
  data?: {
    id?: number | string;
    reference?: string;
    amount?: number;
    currency?: string;
    status?: string;
    customer?: {
      email?: string;
      first_name?: string | null;
      last_name?: string | null;
      customer_code?: string;
    };
    metadata?: { sendnaro?: Record<string, unknown> } | null;
  };
}

export async function handleMerchantPaystackEvent(
  sourceId: string,
  raw: Buffer,
  signature: string | undefined,
): Promise<MerchantEventOutcome> {
  const source = await prisma.paymentEventSource.findUnique({ where: { id: sourceId } });
  if (!source) return { status: 404, body: null };
  const secret = decryptSecret(source.secretCiphertext, parseApiEnv().APP_ENCRYPTION_KEY);
  if (!signatureValid(secret, raw, signature)) return { status: 401, body: null };

  let evt: PaystackEvent;
  try {
    evt = JSON.parse(raw.toString('utf8')) as PaystackEvent;
  } catch {
    return { status: 200, body: { received: true, result: 'ignored', reason: 'invalid_json' } };
  }
  const d = evt.data;
  if (evt.event !== 'charge.success' || !d?.reference || d.status !== 'success') {
    return {
      status: 200,
      body: { received: true, result: 'ignored', reason: 'not_a_successful_charge' },
    };
  }

  const meta = (d.metadata?.sendnaro ?? {}) as {
    customer_name?: string;
    whatsapp_phone?: string;
    consent_whatsapp?: boolean;
    customer_id?: string;
    items?: { description: string; quantity: number; unit_amount_minor: number }[];
  };
  const ignore = (reason: string): MerchantEventOutcome => ({
    status: 200,
    body: { received: true, result: 'ignored', reason },
  });

  if (!meta.whatsapp_phone || meta.consent_whatsapp !== true) {
    return ignore('whatsapp_phone_and_consent_required_in_metadata');
  }
  const amount = d.amount ?? 0;
  const items = meta.items?.length
    ? meta.items
    : [{ description: `Payment ${d.reference}`, quantity: 1, unit_amount_minor: amount }];
  const itemsTotal = items.reduce(
    (n, i) => n + Math.round(Number(i.quantity) * i.unit_amount_minor),
    0,
  );
  if (itemsTotal !== amount) return ignore('items_do_not_match_paid_amount'); // never issue a receipt that disagrees with what was charged

  const fullName = [d.customer?.first_name, d.customer?.last_name].filter(Boolean).join(' ');
  let body;
  try {
    body = createInvoiceSchema.parse({
      external_order_id: d.reference,
      document_type: 'receipt',
      payment: { status: 'paid', reference: d.reference },
      customer: {
        external_customer_id:
          meta.customer_id ?? d.customer?.customer_code ?? d.customer?.email ?? d.reference,
        name: meta.customer_name ?? (fullName || d.customer?.email || 'Customer'),
        whatsapp_phone: meta.whatsapp_phone,
        ...(d.customer?.email ? { email: d.customer.email } : {}),
      },
      currency: (d.currency ?? '').toUpperCase(),
      items,
      channels: (source.defaultChannels.length ? source.defaultChannels : ['whatsapp']) as (
        'whatsapp' | 'telegram'
      )[],
      consent: { whatsapp_transactional: true },
    });
  } catch {
    return ignore('event_did_not_pass_validation');
  }

  const ctx: SnContext = {
    workspaceId: source.workspaceId,
    environment: source.environment,
    scopes: [],
    requestId: randomUUID(),
    ip: 'payment-source',
  };
  try {
    // The Paystack transaction id/reference makes redelivered webhooks idempotent.
    const res = await createInvoice(ctx, body, `paystack:${source.id}:${d.id ?? d.reference}`);
    return {
      status: 200,
      body: {
        received: true,
        result: res.replayed ? 'duplicate' : 'created',
        invoice_id: (res.body as { id?: string }).id,
      },
    };
  } catch (err) {
    // Acknowledge so Paystack does not retry forever, but leave a trace the business can act on.
    const code = err instanceof AppError ? err.code.toLowerCase() : 'error';
    logger.warn({ code, sourceId }, 'Merchant payment event not turned into a receipt');
    await writeAuditLog({
      workspaceId: source.workspaceId,
      action: 'payment_event.rejected',
      entityType: 'PaymentEventSource',
      entityId: source.id,
      metadata: { code, reference: d.reference },
    });
    return ignore(code);
  }
}
