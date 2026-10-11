import { renderToStaticMarkup } from 'react-dom/server';
import { prisma } from '@sendnaro/database';
import { parseApiEnv } from '@sendnaro/config/env';
import { logger } from '../../config/logger.js';
import type { EmailProvider } from './provider.interface.js';
import { ResendEmailProvider } from './resend.provider.js';
import { DevEmailProvider } from './dev.provider.js';
import type { EmailTemplateResult } from './templates/index.js';

let cachedProvider: EmailProvider | undefined;

function getProvider(): EmailProvider {
  if (cachedProvider) return cachedProvider;
  const env = parseApiEnv();
  if (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY && env.EMAIL_FROM) {
    cachedProvider = new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
  } else {
    cachedProvider = new DevEmailProvider();
  }
  return cachedProvider;
}

export interface SendTemplatedEmailOptions {
  /** Omit for platform-level emails not tied to a workspace (e.g. public contact form acknowledgements) — these are still sent but not logged as a MessageDelivery row. */
  workspaceId?: string;
  to: string;
  templateKey: string;
  template: EmailTemplateResult;
  invoiceId?: string;
  quoteId?: string;
  receiptId?: string;
}

/**
 * Renders a React email template to HTML, sends it via the configured
 * provider, and (when workspaceId is given) logs a MessageDelivery row
 * regardless of outcome — this is what powers the admin panel's "Email
 * delivery logs" view. Never throws for delivery failures reachable from
 * user-triggered actions; callers that need to know about failure should
 * check the returned status.
 */
export async function sendTemplatedEmail(
  options: SendTemplatedEmailOptions,
): Promise<{ delivered: boolean }> {
  const env = parseApiEnv();
  const html = `<!DOCTYPE html>${renderToStaticMarkup(options.template.react)}`;

  const delivery = options.workspaceId
    ? await prisma.messageDelivery.create({
        data: {
          workspaceId: options.workspaceId,
          channel: 'EMAIL',
          status: 'QUEUED',
          toAddress: options.to,
          subject: options.template.subject,
          templateKey: options.templateKey,
          invoiceId: options.invoiceId,
          quoteId: options.quoteId,
          receiptId: options.receiptId,
        },
      })
    : null;

  try {
    const result = await getProvider().send({
      to: options.to,
      subject: options.template.subject,
      html,
      text: options.template.text,
      replyTo: env.EMAIL_REPLY_TO,
    });
    if (delivery) {
      await prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENT', sentAt: new Date(), providerMessageId: result.providerMessageId },
      });
    }
    return { delivered: true };
  } catch (err) {
    logger.error(
      { err, to: options.to, templateKey: options.templateKey },
      'Email delivery failed',
    );
    if (delivery) {
      await prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        },
      });
    }
    return { delivered: false };
  }
}

export * from './templates/index.js';
