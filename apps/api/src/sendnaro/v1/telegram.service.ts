import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@sendnaro/database';
import { AppError } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';
import type { SnContext } from '../context.js';
import { assertCanSend } from '../entitlement.js';
import { publicId } from '../ids.js';
import { enforce } from '../limits.js';
import { assertChannelsReady } from '../recipients.js';
import { getBotUsername, sendTelegramText } from '../../services/telegram/telegram.service.js';

export const LINK_TOKEN_TTL_SECONDS = 15 * 60;
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

async function botUsername(ctx: SnContext): Promise<string> {
  const configured = parseApiEnv().TELEGRAM_BOT_USERNAME;
  if (configured) return configured;
  if (ctx.environment === 'SANDBOX') return 'sendnaro_sandbox_bot';
  return getBotUsername();
}

/**
 * Issues a short-lived, single-use deep link bound to (tenant, environment, customer). The raw token
 * exists only inside the returned URL; only its SHA-256 is stored. The token is opaque: it contains no
 * customer id and cannot be guessed from one.
 */
export async function createLinkToken(
  ctx: SnContext,
  body: { external_customer_id: string; name?: string; force_relink?: boolean },
) {
  await assertCanSend(ctx.workspaceId, ctx.environment);
  await assertChannelsReady(ctx, ['telegram']);
  await enforce(`tglink:${ctx.workspaceId}:${ctx.environment}`, 120, 3600, 'link requests');

  const recipient = await prisma.recipient.upsert({
    where: {
      workspaceId_environment_externalCustomerId: {
        workspaceId: ctx.workspaceId,
        environment: ctx.environment,
        externalCustomerId: body.external_customer_id,
      },
    },
    create: {
      workspaceId: ctx.workspaceId,
      environment: ctx.environment,
      externalCustomerId: body.external_customer_id,
      name: body.name ?? body.external_customer_id,
    },
    update: body.name ? { name: body.name } : {},
  });

  if (recipient.telegramChatId && !body.force_relink) {
    throw new AppError('ALREADY_LINKED', 'This customer is already connected to Telegram. Pass force_relink to replace it.');
  }

  const raw = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_SECONDS * 1000);
  const record = await prisma.$transaction(async (tx) => {
    await tx.telegramLinkToken.deleteMany({ where: { recipientId: recipient.id, consumedAt: null } });
    return tx.telegramLinkToken.create({
      data: { tokenHash: hashToken(raw), workspaceId: ctx.workspaceId, environment: ctx.environment, recipientId: recipient.id, expiresAt },
    });
  });

  return {
    status: 201,
    body: {
      id: publicId('linkToken', record.id),
      object: 'telegram_link_token',
      external_customer_id: body.external_customer_id,
      url: `https://t.me/${await botUsername(ctx)}?start=${raw}`,
      expires_at: expiresAt.toISOString(),
      sandbox: ctx.environment === 'SANDBOX',
      request_id: ctx.requestId,
    },
  };
}

export type ConsumeResult =
  | { ok: true; recipientName: string; replacedChatId?: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'wrong_environment' };

/**
 * Consumes a link token on a verified /start event. `environment` is the environment the CALLER may
 * consume: the real bot webhook can only consume LIVE tokens; the sandbox simulator only SANDBOX ones.
 * The chat id is taken from the authenticated Telegram update, never from a client claim.
 */
export async function consumeLinkToken(input: {
  token: string;
  chatId: string;
  environment: 'LIVE' | 'SANDBOX';
  /** When set (sandbox simulator), the token must belong to this business. */
  workspaceId?: string;
}): Promise<ConsumeResult> {
  const record = await prisma.telegramLinkToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { recipient: true },
  });
  if (!record) return { ok: false, reason: 'invalid' };
  if (input.workspaceId && record.workspaceId !== input.workspaceId) return { ok: false, reason: 'invalid' };
  if (record.environment !== input.environment) return { ok: false, reason: 'wrong_environment' };
  if (record.consumedAt) return { ok: false, reason: 'used' };
  if (record.expiresAt <= new Date()) return { ok: false, reason: 'expired' };

  // Atomic single use: only one concurrent /start can flip consumedAt.
  const claimed = await prisma.telegramLinkToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, reason: 'used' };

  const previous = record.recipient.telegramChatId;
  await prisma.recipient.update({
    where: { id: record.recipientId },
    data: { telegramChatId: input.chatId, telegramLinkedAt: new Date() },
  });
  return { ok: true, recipientName: record.recipient.name, replacedChatId: previous && previous !== input.chatId ? previous : undefined };
}

export async function unlinkRecipient(ctx: SnContext, externalCustomerId: string) {
  const res = await prisma.recipient.updateMany({
    where: {
      workspaceId: ctx.workspaceId,
      environment: ctx.environment,
      externalCustomerId,
      telegramChatId: { not: null },
    },
    data: { telegramChatId: null, telegramLinkedAt: null },
  });
  if (res.count === 0) throw new AppError('NOT_FOUND', 'No Telegram connection for this customer');
  await prisma.telegramLinkToken.deleteMany({
    where: { workspaceId: ctx.workspaceId, environment: ctx.environment, recipient: { externalCustomerId }, consumedAt: null },
  });
  return { status: 200, body: { external_customer_id: externalCustomerId, connected: false, request_id: ctx.requestId } };
}

/** User-initiated /stop: removes the chat from every business's mapping. */
export async function unlinkChat(chatId: string): Promise<number> {
  const { count } = await prisma.recipient.updateMany({
    where: { telegramChatId: chatId },
    data: { telegramChatId: null, telegramLinkedAt: null },
  });
  return count;
}

/** Handles a Start/Stop event from the real bot (LIVE tokens only). Returns true if it was ours. */
export async function handleBotUpdate(update: {
  message?: { text?: string; chat: { id: number; type: string } };
}): Promise<boolean> {
  const msg = update.message;
  if (!msg?.text || msg.chat.type !== 'private') return true;
  const chatId = String(msg.chat.id);
  const [command = '', arg] = msg.text.trim().split(/\s+/);

  if (command.startsWith('/start') && arg) {
    const r = await consumeLinkToken({ token: arg, chatId, environment: 'LIVE' });
    if (r.ok) {
      await sendTelegramText(chatId, `Hi ${r.recipientName}! You're connected. You'll receive invoices, receipts and order updates here. Send /stop to opt out.`);
      if (r.replacedChatId) {
        await sendTelegramText(r.replacedChatId, 'This chat was disconnected because the connection was moved to another Telegram account.').catch(() => undefined);
      }
      return true;
    }
    if (r.reason === 'invalid') return false; // maybe a legacy token; let the legacy handler try
    await sendTelegramText(chatId, 'This link is no longer valid. Please ask the business for a new link.');
    return true;
  }
  if (command.startsWith('/stop')) {
    await unlinkChat(chatId);
    return false; // let legacy also clear its own table, which sends the farewell message
  }
  return false;
}
