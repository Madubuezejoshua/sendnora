import { prisma } from '@sendnaro/database';
import { MAX_REMINDERS_PER_INVOICE, getCurrency } from '@sendnaro/shared';
import { parseApiEnv } from '@sendnaro/config/env';
import { logger } from '../../config/logger.js';
import { sendTemplatedEmail, invoiceReminderTemplate } from '../../services/email/email.service.js';
import { buildClickToChatLink } from '../../services/whatsapp/whatsapp.service.js';
import { sendTelegramToCustomer } from '../../services/telegram/telegram.service.js';
import { createNotification } from '../../services/notification.service.js';

function formatAmount(minorUnits: number, currency: string): string {
  const def = getCurrency(currency);
  return `${currency} ${(minorUnits / 10 ** def.minorUnitDigits).toLocaleString('en-US', { minimumFractionDigits: def.minorUnitDigits })}`;
}

/**
 * Dispatches every ReminderSchedule row that is due. EMAIL reminders send
 * automatically. WHATSAPP reminders only auto-send when the Meta Cloud API
 * is configured; otherwise a Notification is created so staff can send the
 * pre-filled click-to-chat message by hand — never silently dropped.
 */
export async function processPendingReminders(): Promise<{ processed: number; skipped: number }> {
  const env = parseApiEnv();
  const due = await prisma.reminderSchedule.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: new Date() } },
    include: {
      invoice: { include: { customer: true, workspace: { include: { businessProfile: true } } } },
    },
    take: 200,
  });

  let processed = 0;
  let skipped = 0;

  for (const reminder of due) {
    const invoice = reminder.invoice;

    if (!['ISSUED', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)) {
      await prisma.reminderSchedule.update({
        where: { id: reminder.id },
        data: { status: 'CANCELLED' },
      });
      skipped += 1;
      continue;
    }

    const sentCount = await prisma.reminderSchedule.count({
      where: { invoiceId: invoice.id, status: 'SENT' },
    });
    if (sentCount >= MAX_REMINDERS_PER_INVOICE) {
      await prisma.reminderSchedule.update({
        where: { id: reminder.id },
        data: { status: 'CANCELLED' },
      });
      skipped += 1;
      continue;
    }

    try {
      const businessName = invoice.workspace.businessProfile?.displayName ?? invoice.workspace.name;
      const viewUrl = `${env.NEXT_PUBLIC_APP_URL}/i/${invoice.publicToken}`;
      const amount = formatAmount(
        invoice.grandTotalMinorUnits - invoice.amountPaidMinorUnits,
        invoice.currency,
      );
      const dueDateLabel = invoice.dueDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      if (reminder.channel === 'EMAIL' && invoice.customer.email) {
        await sendTemplatedEmail({
          workspaceId: invoice.workspaceId,
          to: invoice.customer.email,
          templateKey: 'invoice_reminder',
          template: invoiceReminderTemplate({
            customerName: invoice.customer.name,
            businessName,
            invoiceNumber: invoice.number,
            amount,
            dueDate: dueDateLabel,
            viewUrl,
          }),
          invoiceId: invoice.id,
        });
      } else if (reminder.channel === 'TELEGRAM') {
        const result = await sendTelegramToCustomer({
          workspaceId: invoice.workspaceId,
          customerId: invoice.customerId,
          text: `Hi ${invoice.customer.name}, this is a reminder that invoice ${invoice.number} for ${amount} from ${businessName} is due ${dueDateLabel}. View & pay: ${viewUrl}`,
          invoiceId: invoice.id,
          templateKey: 'invoice_reminder',
        });
        if (!result.sent) throw new Error(`Telegram reminder not sent: ${result.reason}`);
      } else if (reminder.channel === 'WHATSAPP' && invoice.customer.whatsappPhone) {
        const message = `Hi ${invoice.customer.name}, this is a reminder that invoice ${invoice.number} for ${amount} from ${businessName} is due ${dueDateLabel}. View & pay: ${viewUrl}`;
        const link = buildClickToChatLink({
          customerPhone: invoice.customer.whatsappPhone,
          message,
        });
        const recipientUserId = invoice.createdById ?? invoice.workspace.ownerId;
        await createNotification({
          userId: recipientUserId,
          workspaceId: invoice.workspaceId,
          type: 'INVOICE_OVERDUE',
          title: `WhatsApp reminder ready for ${invoice.number}`,
          body: `Send a payment reminder to ${invoice.customer.name} via WhatsApp.`,
          data: { whatsappUrl: link.url, invoiceId: invoice.id },
          url: `/invoices/${invoice.id}`,
        });
      }

      await prisma.reminderSchedule.update({
        where: { id: reminder.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      processed += 1;
    } catch (err) {
      logger.error({ err, reminderId: reminder.id }, 'Failed to process reminder');
      await prisma.reminderSchedule.update({
        where: { id: reminder.id },
        data: {
          status: 'FAILED',
          failureReason: err instanceof Error ? err.message : 'Unknown error',
        },
      });
    }
  }

  return { processed, skipped };
}
