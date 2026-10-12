import { prisma } from '@sendnaro/database';
import { logger } from '../config/logger.js';
import { getStorageProvider } from '../services/storage/storage.service.js';
import { purgeExpiredIdempotency } from './idempotency.js';
import { purgeExpiredBuckets } from './limits.js';
import { purgeFinishedOutbox } from './outbox.js';

/** Retention, in days. Override with environment variables; defaults are deliberately short for sensitive data. */
export const retentionPolicy = {
  /** OTP challenges are deleted this long after they expire (they hold no code, only metadata). */
  otpAfterExpiryDays: Number(process.env.OTP_RETENTION_DAYS ?? 1),
  /** Sandbox documents, files, deliveries and recipients. */
  sandboxDays: Number(process.env.SANDBOX_RETENTION_DAYS ?? 7),
  /** Live delivery history and attempt logs. */
  liveDeliveryDays: Number(process.env.DELIVERY_RETENTION_DAYS ?? 90),
  webhookEventDays: Number(process.env.WEBHOOK_EVENT_RETENTION_DAYS ?? 30),
};

const days = (n: number) => new Date(Date.now() - n * 86_400_000);

export async function runRetention(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  out.rateLimitBuckets = await purgeExpiredBuckets();
  out.idempotencyRecords = await purgeExpiredIdempotency();
  out.outboxDone = await purgeFinishedOutbox(14);
  out.linkTokens = (
    await prisma.telegramLinkToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: days(1) } }, { consumedAt: { lt: days(1) } }] },
    })
  ).count;
  out.otpChallenges = (
    await prisma.otpChallenge.deleteMany({
      where: {
        expiresAt: { lt: days(retentionPolicy.otpAfterExpiryDays) },
        status: { not: 'PENDING' },
      },
    })
  ).count;

  // Sandbox documents: remove the stored PDF first, then the rows.
  const oldSandbox = await prisma.issuedDocument.findMany({
    where: { environment: 'SANDBOX', createdAt: { lt: days(retentionPolicy.sandboxDays) } },
    select: { id: true, pdfStorageKey: true },
    take: 500,
  });
  for (const doc of oldSandbox) {
    if (doc.pdfStorageKey)
      await getStorageProvider()
        .deleteObject(doc.pdfStorageKey)
        .catch((err) => logger.warn({ err }, 'Sandbox file delete failed'));
  }
  const ids = oldSandbox.map((d) => d.id);
  await prisma.delivery.deleteMany({ where: { invoiceId: { in: ids } } });
  out.sandboxDocuments = (
    await prisma.issuedDocument.deleteMany({ where: { id: { in: ids } } })
  ).count;
  out.sandboxDeliveries = (
    await prisma.delivery.deleteMany({
      where: { environment: 'SANDBOX', createdAt: { lt: days(retentionPolicy.sandboxDays) } },
    })
  ).count;
  out.sandboxRecipients = (
    await prisma.recipient.deleteMany({
      where: { environment: 'SANDBOX', updatedAt: { lt: days(retentionPolicy.sandboxDays) } },
    })
  ).count;
  out.liveDeliveries = (
    await prisma.delivery.deleteMany({
      where: { environment: 'LIVE', createdAt: { lt: days(retentionPolicy.liveDeliveryDays) } },
    })
  ).count;
  out.webhookEvents = (
    await prisma.merchantWebhookEvent.deleteMany({
      where: { createdAt: { lt: days(retentionPolicy.webhookEventDays) } },
    })
  ).count;
  return out;
}
