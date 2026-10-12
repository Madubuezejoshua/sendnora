import { sendnaro, type SendnaroConfig } from './client';

/**
 * A Telegram bot cannot message a customer first, and it cannot look a person up by phone number.
 * The customer must open this link once and press Start. After that, invoices can be delivered there.
 */
export async function createTelegramLink(
  config: SendnaroConfig,
  customerId: string,
  customerName: string,
) {
  const { body } = await sendnaro<{ url: string; expires_at: string }>(
    config,
    'POST',
    '/telegram/link-tokens',
    {
      external_customer_id: customerId,
      name: customerName,
    },
  );
  return { url: body.url, expiresAt: body.expires_at }; // show the link or a QR code on your order page
}

/** Remove a customer's Telegram connection (for example when they ask you to stop). */
export async function unlinkTelegram(config: SendnaroConfig, customerId: string) {
  await sendnaro(config, 'DELETE', `/telegram/links/${encodeURIComponent(customerId)}`);
}

/** Sandbox only: simulate the customer pressing Start in the bot. */
export async function simulateTelegramStart(
  config: SendnaroConfig,
  tokenFromLink: string,
  chatId = 'sandbox_chat_1',
) {
  await sendnaro(config, 'POST', '/sandbox/telegram/start', {
    token: tokenFromLink,
    chat_id: chatId,
  });
}
