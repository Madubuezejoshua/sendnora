import { buildWhatsAppClickToChatUrl, normalizePhoneNumber } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';
import { prisma } from '@sendnaro/database';
import {
  sendWhatsAppDocumentMessage,
  isMetaCloudApiConfigured,
} from './meta-cloud-api.provider.js';

export interface BuildWhatsAppShareParams {
  customerPhone: string;
  message: string;
}

/**
 * Level 1 (always available, no credentials required): builds a wa.me
 * click-to-chat link with a pre-filled message. The frontend renders this
 * as a share button / QR code — nothing is sent automatically.
 */
export function buildClickToChatLink(params: BuildWhatsAppShareParams): {
  url: string;
  phoneValid: boolean;
} {
  try {
    const phone = normalizePhoneNumber(params.customerPhone);
    return { url: buildWhatsAppClickToChatUrl(phone.e164, params.message), phoneValid: true };
  } catch {
    return { url: '', phoneValid: false };
  }
}

export interface SendAutomaticWhatsAppParams {
  workspaceId: string;
  customerPhone: string;
  message: string;
  documentUrl?: string;
  invoiceId?: string;
  quoteId?: string;
  receiptId?: string;
}

/**
 * Level 2 (prepared, inactive without Meta credentials): attempts to send
 * via the Meta WhatsApp Cloud API. Returns `{ sent: false, reason: 'not_configured' }`
 * when META_WHATSAPP_* env vars are absent — callers should fall back to
 * showing the click-to-chat link rather than treating this as a hard error.
 */
export async function sendAutomaticWhatsApp(
  params: SendAutomaticWhatsAppParams,
): Promise<{ sent: boolean; reason?: string }> {
  const env = parseApiEnv();
  if (env.WHATSAPP_PROVIDER !== 'meta-cloud-api' || !isMetaCloudApiConfigured(env)) {
    return { sent: false, reason: 'not_configured' };
  }

  const phone = normalizePhoneNumber(params.customerPhone);
  const delivery = await prisma.messageDelivery.create({
    data: {
      workspaceId: params.workspaceId,
      channel: 'WHATSAPP',
      status: 'QUEUED',
      toAddress: phone.e164,
      templateKey: params.documentUrl ? 'document_share' : 'text_message',
      invoiceId: params.invoiceId,
      quoteId: params.quoteId,
      receiptId: params.receiptId,
    },
  });

  try {
    const result = await sendWhatsAppDocumentMessage(
      env,
      phone.e164,
      params.message,
      params.documentUrl,
    );
    await prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: { status: 'SENT', sentAt: new Date(), providerMessageId: result.messageId },
    });
    return { sent: true };
  } catch (err) {
    await prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      },
    });
    return { sent: false, reason: 'send_failed' };
  }
}
