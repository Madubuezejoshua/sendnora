import { createHmac, timingSafeEqual } from 'node:crypto';
import axios from 'axios';
import type { ApiEnv } from '@invoicetap/config/env';

/**
 * Meta WhatsApp Cloud API adapter — prepared but inactive until
 * META_WHATSAPP_* environment variables are configured (WHATSAPP_PROVIDER
 * must also be set to "meta-cloud-api"). Until then, whatsapp.service.ts
 * falls back to click-to-chat links, which need no credentials at all.
 *
 * Supports sending an approved text/template message, optionally
 * referencing a document (PDF) by URL, and verifying inbound delivery
 * status + webhook verification handshakes.
 */
export function isMetaCloudApiConfigured(env: ApiEnv): boolean {
  return Boolean(
    env.META_WHATSAPP_ACCESS_TOKEN &&
    env.META_WHATSAPP_PHONE_NUMBER_ID &&
    env.META_WHATSAPP_APP_SECRET &&
    env.META_WHATSAPP_VERIFY_TOKEN,
  );
}

export async function sendWhatsAppDocumentMessage(
  env: ApiEnv,
  toE164: string,
  caption: string,
  documentUrl?: string,
): Promise<{ messageId: string }> {
  const url = `https://graph.facebook.com/${env.META_WHATSAPP_API_VERSION}/${env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const body = documentUrl
    ? {
        messaging_product: 'whatsapp',
        to: toE164.replace(/^\+/, ''),
        type: 'document',
        document: { link: documentUrl, caption },
      }
    : {
        messaging_product: 'whatsapp',
        to: toE164.replace(/^\+/, ''),
        type: 'text',
        text: { body: caption },
      };

  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${env.META_WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout: 15_000,
  });

  return { messageId: response.data.messages?.[0]?.id ?? 'unknown' };
}

/** Handshake for Meta's webhook subscription verification (GET request with hub.challenge). */
export function verifyMetaWebhookChallenge(
  env: ApiEnv,
  mode: string | undefined,
  token: string | undefined,
): boolean {
  return mode === 'subscribe' && token === env.META_WHATSAPP_VERIFY_TOKEN;
}

/** Meta signs webhook payloads with the app secret via X-Hub-Signature-256: sha256=<hmac>. */
export function verifyMetaWebhookSignature(
  env: ApiEnv,
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader?.startsWith('sha256=') || !env.META_WHATSAPP_APP_SECRET) return false;
  const expected = createHmac('sha256', env.META_WHATSAPP_APP_SECRET).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);
  const bufA = Buffer.from(expected, 'utf8');
  const bufB = Buffer.from(provided, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
