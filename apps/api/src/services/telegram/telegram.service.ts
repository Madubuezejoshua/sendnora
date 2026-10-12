import { randomBytes } from 'node:crypto';
import { prisma } from '@sendnaro/database';
import { AppError } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';

/**
 * Telegram bots cannot message a user first: the customer opens
 * t.me/<bot>?start=<telegramLinkToken> once, the webhook stores their chat id on the
 * Customer, and only then can invoices / receipts / reminders be delivered here.
 */

export function isTelegramConfigured(): boolean {
  return Boolean(parseApiEnv().TELEGRAM_BOT_TOKEN);
}

async function telegramCall<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = parseApiEnv().TELEGRAM_BOT_TOKEN;
  if (!token) throw new AppError('INTERNAL_ERROR', 'Telegram is not configured');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(json.description ?? `Telegram ${method} failed (${res.status})`);
  return json.result as T;
}

let cachedUsername: string | undefined; // ponytail: per-instance cache; the bot username effectively never changes
export async function getBotUsername(): Promise<string> {
  cachedUsername ??= (await telegramCall<{ username: string }>('getMe')).username;
  return cachedUsername;
}

export async function sendTelegramText(
  chatId: string,
  text: string,
): Promise<{ messageId: string }> {
  const msg = await telegramCall<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text,
  });
  return { messageId: String(msg.message_id) };
}

/** Returns the deep link the customer must open once (and whether they are already linked). */
export async function createTelegramLink(
  workspaceId: string,
  customerId: string,
): Promise<{ url: string; linked: boolean }> {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, workspaceId } });
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found');
  if (!isTelegramConfigured()) throw new AppError('VALIDATION_ERROR', 'Telegram is not configured');

  const token =
    customer.telegramLinkToken ??
    (
      await prisma.customer.update({
        where: { id: customer.id },
        data: { telegramLinkToken: randomBytes(16).toString('base64url') },
      })
    ).telegramLinkToken!;
  return {
    url: `https://t.me/${await getBotUsername()}?start=${token}`,
    linked: Boolean(customer.telegramChatId),
  };
}

export interface SendTelegramParams {
  workspaceId: string;
  customerId: string;
  text: string;
  invoiceId?: string;
  quoteId?: string;
  receiptId?: string;
  templateKey?: string;
}

export type SendTelegramResult =
  { sent: true } | { sent: false; reason: 'not_configured' | 'not_linked' | 'send_failed' };

export async function sendTelegramToCustomer(
  params: SendTelegramParams,
): Promise<SendTelegramResult> {
  if (!isTelegramConfigured()) return { sent: false, reason: 'not_configured' };

  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, workspaceId: params.workspaceId },
  });
  if (!customer?.telegramChatId) return { sent: false, reason: 'not_linked' };

  const delivery = await prisma.messageDelivery.create({
    data: {
      workspaceId: params.workspaceId,
      channel: 'TELEGRAM',
      status: 'QUEUED',
      toAddress: customer.telegramChatId,
      templateKey: params.templateKey ?? 'text_message',
      invoiceId: params.invoiceId,
      quoteId: params.quoteId,
      receiptId: params.receiptId,
    },
  });

  try {
    const { messageId } = await sendTelegramText(customer.telegramChatId, params.text);
    await prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: { status: 'SENT', sentAt: new Date(), providerMessageId: messageId },
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

interface TelegramUpdate {
  message?: { text?: string; chat: { id: number; type: string } };
}

/** Handles /start <token> (link) and /stop (unlink). Anything else gets a short hint. */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text || msg.chat.type !== 'private') return;
  const chatId = String(msg.chat.id);
  const [command = '', arg] = msg.text.trim().split(/\s+/);

  if (command.startsWith('/start') && arg) {
    const customer = await prisma.customer.findUnique({ where: { telegramLinkToken: arg } });
    if (!customer) {
      await sendTelegramText(
        chatId,
        'This link is invalid or has expired. Please ask your supplier for a new one.',
      );
      return;
    }
    await prisma.customer.update({
      where: { id: customer.id },
      data: { telegramChatId: chatId, telegramLinkToken: null }, // token is single-use
    });
    await sendTelegramText(
      chatId,
      `Hi ${customer.name}! You'll now receive your invoices, receipts and payment reminders here. Send /stop at any time to opt out.`,
    );
  } else if (command.startsWith('/stop')) {
    await prisma.customer.updateMany({
      where: { telegramChatId: chatId },
      data: { telegramChatId: null },
    });
    await sendTelegramText(
      chatId,
      "You've been unsubscribed. You won't receive further messages here.",
    );
  } else {
    await sendTelegramText(
      chatId,
      'This bot delivers invoices and receipts. Use the link your supplier sent you to get started.',
    );
  }
}
