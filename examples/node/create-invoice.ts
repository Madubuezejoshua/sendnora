import { sendnaro, type SendnaroConfig } from './client';

export interface PaidOrder {
  id: string; // your order id
  paymentReference: string; // the reference from YOUR payment provider
  customerId: string;
  customerName: string;
  whatsappPhone: string; // international format, e.g. +2348000000000
  currency: string; // e.g. NGN
  items: { description: string; quantity: number; unitAmountMinor: number }[]; // integer minor units: 500000 = NGN 5,000.00
}

/**
 * Call this ONLY after your backend has verified the payment with your payment provider
 * (a verified webhook or a server-side verify call). A browser redirect or a button click
 * is not proof of payment.
 *
 * The Idempotency-Key makes a retried webhook safe: the same key returns the same invoice.
 */
export async function createReceiptForPaidOrder(config: SendnaroConfig, order: PaidOrder) {
  const { status, body } = await sendnaro<{ id: string; number: string; deliveries: { id: string; channel: string; status: string }[] }>(
    config,
    'POST',
    '/invoices',
    {
      external_order_id: order.id,
      document_type: 'receipt',
      payment: { status: 'paid', reference: order.paymentReference },
      customer: {
        external_customer_id: order.customerId,
        name: order.customerName,
        whatsapp_phone: order.whatsappPhone,
      },
      currency: order.currency,
      items: order.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit_amount_minor: i.unitAmountMinor,
      })),
      channels: ['whatsapp'],
      // Record this only if the customer agreed to receive transactional WhatsApp messages.
      consent: { whatsapp_transactional: true },
    },
    { idempotencyKey: `shop-order-${order.id}-invoice` },
  );
  // 202 means "accepted for processing", not "delivered". Track delivery with GET /deliveries/{id} or a webhook.
  return { httpStatus: status, invoiceId: body.id, number: body.number, deliveries: body.deliveries };
}
