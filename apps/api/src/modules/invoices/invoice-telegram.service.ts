import { parseApiEnv } from '@invoicetap/config/env';
import { getCurrency } from '@invoicetap/shared';
import {
  createTelegramLink,
  sendTelegramToCustomer,
  type SendTelegramResult,
} from '../../services/telegram/telegram.service.js';
import * as invoicesService from './invoices.service.js';

/**
 * Sends the invoice link to the customer's linked Telegram chat. When the customer hasn't linked
 * yet, returns the one-time link to share with them instead of failing.
 */
export async function sendInvoiceViaTelegram(
  workspaceId: string,
  invoiceId: string,
): Promise<SendTelegramResult | { sent: false; reason: 'not_linked'; linkUrl: string }> {
  const invoice = await invoicesService.getInvoice(workspaceId, invoiceId);
  const def = getCurrency(invoice.currency);
  const outstanding = invoice.grandTotalMinorUnits - invoice.amountPaidMinorUnits;
  const amount = `${invoice.currency} ${(outstanding / 10 ** def.minorUnitDigits).toLocaleString('en-US', { minimumFractionDigits: def.minorUnitDigits })}`;
  const viewUrl = `${parseApiEnv().NEXT_PUBLIC_APP_URL}/i/${invoice.publicToken}`;

  const result = await sendTelegramToCustomer({
    workspaceId,
    customerId: invoice.customerId,
    text: `Hi ${invoice.customer.name}, invoice ${invoice.number} for ${amount} is ready. View & pay: ${viewUrl}`,
    invoiceId: invoice.id,
    templateKey: 'invoice_share',
  });
  if (!result.sent && result.reason === 'not_linked') {
    const { url } = await createTelegramLink(workspaceId, invoice.customerId);
    return { sent: false, reason: 'not_linked', linkUrl: url };
  }
  return result;
}
