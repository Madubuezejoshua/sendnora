import { prisma, type ApiEnvironment } from '@sendnaro/database';
import { decryptSecret } from '@sendnaro/database/encryption';
import { parseApiEnv } from '@sendnaro/config/env';
import type { ChannelProvider, ProviderOutcome, SendRequest } from './provider.js';

/**
 * Official WhatsApp Business Platform (Cloud API), using the BUSINESS'S OWN sender and credentials
 * (stored encrypted in ChannelConnection). Business-initiated messages must be approved templates:
 *
 *   OTP           authentication template: body parameter = code, URL button (index 0) parameter = code
 *   invoice       utility template with a document header (private, short-lived link) + body text
 *   notification  utility template with one body parameter carrying the message text
 *
 * Template names/languages are tenant configuration (ChannelConnection.config.templates). When they are
 * missing the send fails with setup_required rather than pretending.
 * Provider cost: Meta may charge the business directly for template conversations.
 */
export interface WhatsAppConnectionConfig {
  phoneNumberId: string;
  wabaId?: string;
  apiVersion?: string;
  templates?: Partial<Record<'otp' | 'invoice' | 'notification', { name: string; language: string }>>;
}

export interface WhatsAppSecrets {
  accessToken: string;
  appSecret?: string;
  verifyToken?: string;
}

let transport: typeof fetch = (...args) => fetch(...args);
/** Test seam for the HTTP boundary (never used in production code paths). */
export function setWhatsAppTransport(fn: typeof fetch | null): void {
  transport = fn ?? ((...args) => fetch(...args));
}

export async function loadWhatsAppConnection(workspaceId: string, environment: ApiEnvironment) {
  const row = await prisma.channelConnection.findUnique({
    where: { workspaceId_environment_channel: { workspaceId, environment, channel: 'WHATSAPP' } },
  });
  if (!row || row.status !== 'CONNECTED' || !row.secretCiphertext) return null;
  const secrets = JSON.parse(
    decryptSecret(row.secretCiphertext, parseApiEnv().APP_ENCRYPTION_KEY),
  ) as WhatsAppSecrets;
  return { row, config: row.config as unknown as WhatsAppConnectionConfig, secrets };
}

function templateBody(req: SendRequest, tpl: { name: string; language: string }) {
  const base = { name: tpl.name, language: { code: tpl.language } };
  if (req.kind === 'OTP') {
    return {
      ...base,
      components: [
        { type: 'body', parameters: [{ type: 'text', text: req.otpCode }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: req.otpCode }] },
      ],
    };
  }
  if (req.kind === 'INVOICE' && req.document) {
    return {
      ...base,
      components: [
        {
          type: 'header',
          parameters: [{ type: 'document', document: { link: req.document.url, filename: req.document.filename } }],
        },
        { type: 'body', parameters: [{ type: 'text', text: req.document.caption }] },
      ],
    };
  }
  return { ...base, components: [{ type: 'body', parameters: [{ type: 'text', text: req.text ?? '' }] }] };
}

/** Meta error codes we treat specially (see the Cloud API throughput and error documentation). */
const THROTTLE_CODES = new Set([130429, 131056, 80007]);
const INVALID_RECIPIENT_CODES = new Set([131026, 131030, 1013]);
const CREDENTIAL_CODES = new Set([190, 10, 200, 100, 131031]);

export const whatsappProvider: ChannelProvider = {
  name: 'whatsapp-cloud-api',
  async send(req: SendRequest): Promise<ProviderOutcome> {
    const conn = await loadWhatsAppConnection(req.workspaceId, req.environment);
    if (!conn) {
      return { kind: 'permanent', code: 'setup_required', message: 'WhatsApp is not connected for this business' };
    }
    const templateKind = req.kind === 'OTP' ? 'otp' : req.kind === 'INVOICE' ? 'invoice' : 'notification';
    const tpl = conn.config.templates?.[templateKind];
    if (!tpl) {
      return { kind: 'permanent', code: 'setup_required', message: `No approved ${templateKind} template configured` };
    }

    const version = conn.config.apiVersion ?? parseApiEnv().META_WHATSAPP_API_VERSION;
    const url = `https://graph.facebook.com/${version}/${conn.config.phoneNumberId}/messages`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await transport(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${conn.secrets.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: req.toAddress.replace(/^\+/, ''),
          type: 'template',
          template: templateBody(req, tpl),
        }),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { code?: number; message?: string };
      };
      if (res.ok && json.messages?.[0]?.id) {
        return { kind: 'accepted', providerMessageId: json.messages[0].id };
      }
      const code = json.error?.code ?? 0;
      const retryAfter = Number(res.headers.get('retry-after')) || 30;
      if (res.status === 429 || THROTTLE_CODES.has(code)) {
        return { kind: 'throttled', code: 'rate_limited', message: 'Provider throttled the request', retryAfterSeconds: retryAfter };
      }
      if (res.status >= 500) {
        return { kind: 'transient', code: 'provider_unavailable', message: `Provider error ${res.status}` };
      }
      if (INVALID_RECIPIENT_CODES.has(code)) {
        return { kind: 'permanent', code: 'invalid_recipient', message: 'Recipient is not a WhatsApp user' };
      }
      if (CREDENTIAL_CODES.has(code) || res.status === 401) {
        await prisma.channelConnection.update({
          where: { id: conn.row.id },
          data: { status: 'ERROR', lastError: 'credentials_rejected', lastCheckedAt: new Date() },
        });
        return { kind: 'permanent', code: 'credentials_invalid', message: 'WhatsApp credentials were rejected' };
      }
      return { kind: 'permanent', code: 'provider_rejected', message: `Provider rejected the message (${code || res.status})` };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return { kind: 'ambiguous', code: 'provider_timeout', message: 'Request to provider timed out' };
      }
      return { kind: 'transient', code: 'network_error', message: 'Could not reach the provider' };
    } finally {
      clearTimeout(timer);
    }
  },
};
