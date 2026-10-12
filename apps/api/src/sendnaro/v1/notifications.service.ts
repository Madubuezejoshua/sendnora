import { prisma } from '@sendnaro/database';
import { AppError, getCurrency, isSupportedCurrency } from '@sendnaro/shared';
import type { SnContext } from '../context.js';
import { assertCanSend } from '../entitlement.js';
import { withIdempotency } from '../idempotency.js';
import { enqueue } from '../outbox.js';
import {
  assertChannelsReady,
  assertRecipientCanUse,
  assertScenarioAllowed,
  createChannelDeliveries,
  publicDelivery,
  upsertRecipient,
} from '../recipients.js';
import { publicId } from '../ids.js';

/**
 * Anti-abuse: the notification API composes messages from a fixed set of types, caps free text at
 * 300 characters, and refuses links (explicit or inside the free text) unless the host is on the
 * business's allowlist. It is deliberately not a general-purpose messaging relay.
 */
const LINK_LIKE =
  /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|app|co|ng|me|ly|link|xyz|info|biz|click|top)\b/gi;

function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((a) => h === a.toLowerCase() || h.endsWith(`.${a.toLowerCase()}`));
}

export function assertLinksAllowed(
  texts: (string | undefined)[],
  link: string | undefined,
  allowed: string[],
): void {
  const hosts: string[] = [];
  if (link) {
    try {
      const u = new URL(link);
      if (u.protocol !== 'https:') throw new Error('not https');
      hosts.push(u.hostname);
    } catch {
      throw new AppError('LINK_NOT_ALLOWED', 'link.url must be a valid https URL');
    }
  }
  for (const text of texts) {
    for (const m of text?.match(LINK_LIKE) ?? []) {
      try {
        hosts.push(new URL(m.startsWith('http') ? m : `https://${m}`).hostname);
      } catch {
        hosts.push(m);
      }
    }
  }
  for (const host of hosts) {
    if (!hostAllowed(host, allowed)) {
      throw new AppError(
        'LINK_NOT_ALLOWED',
        `The link host "${host}" is not on this business's allowed link origins (Settings > Notifications)`,
      );
    }
  }
}

interface Body {
  type: 'order_confirmation' | 'payment_confirmation' | 'shipping_update' | 'general_update';
  customer: { external_customer_id: string; name: string; whatsapp_phone?: string; email?: string };
  channels: ('whatsapp' | 'telegram')[];
  fields: { order_reference?: string; amount_minor?: number; currency?: string; message?: string };
  link?: { url: string };
  consent?: { whatsapp_transactional?: boolean };
  scenario?: string;
}

export function composeNotification(body: Body, businessName: string): string {
  const { fields } = body;
  const name = body.customer.name;
  const ref = fields.order_reference ? ` ${fields.order_reference}` : '';
  let amount = '';
  if (fields.amount_minor !== undefined) {
    if (!fields.currency || !isSupportedCurrency(fields.currency)) {
      throw new AppError(
        'UNPROCESSABLE',
        'fields.currency is required (and must be supported) with fields.amount_minor',
      );
    }
    const def = getCurrency(fields.currency);
    amount = ` of ${fields.currency} ${(fields.amount_minor / 10 ** def.minorUnitDigits).toLocaleString('en-US', { minimumFractionDigits: def.minorUnitDigits, maximumFractionDigits: def.minorUnitDigits })}`;
  }
  let text: string;
  switch (body.type) {
    case 'order_confirmation':
      text = `Hi ${name}, your order${ref} is confirmed.${fields.message ? ` ${fields.message}` : ''}`;
      break;
    case 'payment_confirmation':
      text = `Hi ${name}, we received your payment${amount}${ref ? ` for order${ref}` : ''}.${fields.message ? ` ${fields.message}` : ''}`;
      break;
    case 'shipping_update':
      if (!fields.message)
        throw new AppError('UNPROCESSABLE', 'fields.message is required for shipping_update');
      text = `Hi ${name}, update on your order${ref}: ${fields.message}`;
      break;
    default:
      if (!fields.message)
        throw new AppError('UNPROCESSABLE', 'fields.message is required for general_update');
      text = `Hi ${name}, ${fields.message}`;
  }
  if (body.link) text += ` ${body.link.url}`;
  return `${text} - ${businessName}`;
}

export async function createNotification(
  ctx: SnContext,
  body: Body,
  idempotencyKey: string | undefined,
) {
  await assertCanSend(ctx.workspaceId, ctx.environment);
  const scenario = assertScenarioAllowed(ctx, body.scenario);
  await assertChannelsReady(ctx, body.channels);

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    include: { businessProfile: true },
  });
  assertLinksAllowed(
    [body.fields.message],
    body.link?.url,
    workspace.businessProfile?.allowedLinkOrigins ?? [],
  );
  const text = composeNotification(body, workspace.businessProfile?.displayName ?? workspace.name);

  return withIdempotency(
    {
      workspaceId: ctx.workspaceId,
      environment: ctx.environment,
      operation: 'notifications.create',
    },
    idempotencyKey,
    body,
    async (tx) => {
      const recipient = await upsertRecipient(
        tx,
        ctx,
        body.customer,
        body.consent?.whatsapp_transactional,
        workspace.countryCode,
      );
      assertRecipientCanUse(recipient, body.channels);
      const deliveries = await createChannelDeliveries(tx, ctx, {
        recipient,
        channels: body.channels,
        kind: 'NOTIFICATION',
        templateKey: body.type,
        payload: { text },
        scenario,
        enqueueNow: true,
      });
      void enqueue;
      return {
        status: 202,
        body: {
          id: publicId('delivery', deliveries[0]!.id),
          object: 'notification',
          status: 'accepted',
          type: body.type,
          deliveries: deliveries.map(publicDelivery),
          request_id: ctx.requestId,
        },
      };
    },
  );
}
