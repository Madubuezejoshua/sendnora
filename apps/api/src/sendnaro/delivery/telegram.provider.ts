import { parseApiEnv } from '@sendnaro/config/env';
import type { ChannelProvider, ProviderOutcome, SendRequest } from './provider.js';

/**
 * Shared, clearly branded Sendnaro bot. The recipient's chat id comes from a verified /start link
 * (see telegram-linking.ts), never from a client-supplied value. Telegram offers no delivery
 * receipts, so a successful API call is reported as "sent".
 */
let transport: typeof fetch = (...args) => fetch(...args);
export function setTelegramTransport(fn: typeof fetch | null): void {
  transport = fn ?? ((...args) => fetch(...args));
}

export const telegramProvider: ChannelProvider = {
  name: 'telegram-bot',
  async send(req: SendRequest): Promise<ProviderOutcome> {
    const token = parseApiEnv().TELEGRAM_BOT_TOKEN;
    if (!token) {
      return { kind: 'permanent', code: 'setup_required', message: 'Telegram bot is not configured' };
    }
    const document = req.kind === 'INVOICE' ? req.document : undefined;
    const method = document ? 'sendDocument' : 'sendMessage';
    const body = document
      ? { chat_id: req.toAddress, document: document.url, caption: document.caption }
      : { chat_id: req.toAddress, text: req.text ?? '' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await transport(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: { message_id: number };
        error_code?: number;
        description?: string;
        parameters?: { retry_after?: number };
      };
      if (json.ok && json.result) {
        return { kind: 'accepted', providerMessageId: String(json.result.message_id) };
      }
      if (res.status === 429 || json.error_code === 429) {
        return {
          kind: 'throttled',
          code: 'rate_limited',
          message: 'Telegram throttled the request',
          retryAfterSeconds: json.parameters?.retry_after ?? 5,
        };
      }
      if (res.status >= 500) {
        return { kind: 'transient', code: 'provider_unavailable', message: `Telegram error ${res.status}` };
      }
      if (json.error_code === 403) {
        return { kind: 'permanent', code: 'recipient_blocked_bot', message: 'The recipient blocked or left the bot' };
      }
      return { kind: 'permanent', code: 'provider_rejected', message: 'Telegram rejected the message' };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return { kind: 'ambiguous', code: 'provider_timeout', message: 'Request to Telegram timed out' };
      }
      return { kind: 'transient', code: 'network_error', message: 'Could not reach Telegram' };
    } finally {
      clearTimeout(timer);
    }
  },
};
