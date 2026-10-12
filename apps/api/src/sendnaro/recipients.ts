import {
  prisma,
  Prisma,
  type Delivery,
  type DeliveryKind,
  type Recipient,
} from '@sendnaro/database';
import { AppError, normalizePhoneNumber } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';
import type { SnContext } from './context.js';
import { enqueue } from './outbox.js';
import { publicId } from './ids.js';
import { loadWhatsAppConnection } from './delivery/whatsapp.provider.js';
import { isSandboxScenario } from './delivery/sandbox.provider.js';
import { emitWebhookEvent } from './webhooks/dispatch.js';

export type ChannelName = 'whatsapp' | 'telegram';

export function toE164(raw: string, defaultCountry?: string): string {
  try {
    return normalizePhoneNumber(raw, defaultCountry as never).e164;
  } catch {
    throw new AppError('INVALID_PHONE', 'The phone number is not a valid international number');
  }
}

/** Scenario controls exist only in the sandbox. A live key that sends one is rejected outright. */
export function assertScenarioAllowed(ctx: SnContext, scenario: string | undefined): string | null {
  if (!scenario) return null;
  if (ctx.environment !== 'SANDBOX') {
    throw new AppError('SANDBOX_ONLY', 'Scenario controls are only available with sandbox keys');
  }
  if (!isSandboxScenario(scenario)) {
    throw new AppError('UNPROCESSABLE', `Unknown sandbox scenario "${scenario}"`);
  }
  return scenario;
}

/** Live sends need a configured channel. A missing setup is reported honestly, never simulated. */
export async function assertChannelsReady(ctx: SnContext, channels: ChannelName[]): Promise<void> {
  if (ctx.environment === 'SANDBOX') return;
  for (const channel of channels) {
    if (channel === 'whatsapp') {
      if (!(await loadWhatsAppConnection(ctx.workspaceId, 'LIVE'))) {
        throw new AppError(
          'SETUP_REQUIRED',
          'setup_required: connect a WhatsApp sender for live sending in the console first',
        );
      }
    } else if (!parseApiEnv().TELEGRAM_BOT_TOKEN) {
      throw new AppError(
        'SETUP_REQUIRED',
        'setup_required: the Telegram bot is not configured on this deployment',
      );
    }
  }
}

export async function upsertRecipient(
  tx: Prisma.TransactionClient,
  ctx: SnContext,
  customer: { external_customer_id: string; name: string; whatsapp_phone?: string },
  consentWhatsapp: boolean | undefined,
  defaultCountry?: string,
): Promise<Recipient> {
  const phone = customer.whatsapp_phone
    ? toE164(customer.whatsapp_phone, defaultCountry)
    : undefined;
  const key = {
    workspaceId_environment_externalCustomerId: {
      workspaceId: ctx.workspaceId,
      environment: ctx.environment,
      externalCustomerId: customer.external_customer_id,
    },
  };
  const existing = await tx.recipient.findUnique({ where: key });
  const consentAt = consentWhatsapp ? (existing?.whatsappConsentAt ?? new Date()) : undefined;
  if (!existing) {
    return tx.recipient.create({
      data: {
        workspaceId: ctx.workspaceId,
        environment: ctx.environment,
        externalCustomerId: customer.external_customer_id,
        name: customer.name,
        whatsappPhone: phone,
        whatsappConsentAt: consentAt,
      },
    });
  }
  return tx.recipient.update({
    where: key,
    data: {
      name: customer.name,
      ...(phone ? { whatsappPhone: phone } : {}),
      ...(consentAt ? { whatsappConsentAt: consentAt } : {}),
    },
  });
}

/** Validates channel prerequisites for a recipient BEFORE any record is created. */
export function assertRecipientCanUse(recipient: Recipient, channels: ChannelName[]): void {
  if (channels.includes('whatsapp')) {
    if (!recipient.whatsappPhone) {
      throw new AppError('UNPROCESSABLE', 'whatsapp_phone is required to deliver over WhatsApp');
    }
    if (!recipient.whatsappConsentAt) {
      throw new AppError(
        'CONSENT_REQUIRED',
        "consent.whatsapp_transactional must be true: record the customer's permission for transactional WhatsApp messages",
      );
    }
  }
}

export interface PlanInput {
  recipient: Recipient;
  channels: ChannelName[];
  kind: DeliveryKind;
  templateKey: string;
  invoiceId?: string;
  payload?: Record<string, unknown>;
  scenario?: string | null;
  /** Enqueue the send job in this transaction (false when a later step, e.g. PDF render, releases it). */
  enqueueNow: boolean;
}

/**
 * One independent Delivery per channel. A failure on one channel never touches the other.
 * A Telegram recipient who has not connected gets an honest FAILED/telegram_not_connected record.
 */
export async function createChannelDeliveries(
  tx: Prisma.TransactionClient,
  ctx: SnContext,
  input: PlanInput,
): Promise<Delivery[]> {
  const out: Delivery[] = [];
  for (const channel of input.channels) {
    const isWa = channel === 'whatsapp';
    const toAddress = isWa
      ? input.recipient.whatsappPhone!
      : (input.recipient.telegramChatId ?? '');
    const notConnected = !isWa && !input.recipient.telegramChatId;

    const delivery = await tx.delivery.create({
      data: {
        workspaceId: ctx.workspaceId,
        environment: ctx.environment,
        kind: input.kind,
        channel: isWa ? 'WHATSAPP' : 'TELEGRAM',
        status: notConnected ? 'FAILED' : 'QUEUED',
        toAddress: notConnected ? 'unlinked' : toAddress,
        templateKey: input.templateKey,
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        invoiceId: input.invoiceId,
        scenario: input.scenario ?? null,
        requestId: ctx.requestId || null,
        apiKeyId: ctx.apiKeyId,
        ...(notConnected
          ? {
              lastErrorCode: 'telegram_not_connected',
              lastErrorMessage: 'The customer has not connected Telegram',
              failedAt: new Date(),
            }
          : {}),
      },
    });
    out.push(delivery);

    if (notConnected) {
      await emitWebhookEvent(tx, {
        workspaceId: ctx.workspaceId,
        environment: ctx.environment,
        type: 'delivery.failed',
        data: {
          delivery_id: publicId('delivery', delivery.id),
          channel: 'telegram',
          kind: input.kind.toLowerCase(),
          status: 'failed',
          error_code: 'telegram_not_connected',
        },
      });
    } else if (input.enqueueNow) {
      await enqueue(tx, {
        type: 'delivery.send',
        payload: { deliveryId: delivery.id },
        workspaceId: ctx.workspaceId,
        environment: ctx.environment,
        dedupeKey: `delivery:${delivery.id}:1`,
      });
    }
  }
  return out;
}

export function publicDelivery(
  d: Pick<Delivery, 'id' | 'channel' | 'status' | 'simulated' | 'lastErrorCode'>,
) {
  return {
    id: publicId('delivery', d.id),
    channel: d.channel.toLowerCase(),
    status: d.status.toLowerCase(),
    simulated: d.simulated,
    ...(d.lastErrorCode ? { error_code: d.lastErrorCode } : {}),
  };
}

export { prisma };
