import { sendnaro, type SendnaroConfig } from './client';

/** Order or payment confirmation over WhatsApp and/or Telegram. Free text is capped and links must be on your allow-list. */
export async function sendOrderConfirmation(
  config: SendnaroConfig,
  customerId: string,
  name: string,
  phone: string,
  orderRef: string,
) {
  const { body } = await sendnaro<{
    deliveries: { id: string; channel: string; status: string }[];
  }>(
    config,
    'POST',
    '/notifications',
    {
      type: 'order_confirmation',
      customer: { external_customer_id: customerId, name, whatsapp_phone: phone },
      channels: ['whatsapp'],
      fields: { order_reference: orderRef },
      consent: { whatsapp_transactional: true },
    },
    { idempotencyKey: `order-${orderRef}-confirmation` },
  );
  return body.deliveries;
}

export type DeliveryStatus =
  | 'queued'
  | 'processing'
  | 'provider_accepted'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'retrying'
  | 'failed'
  | 'expired'
  | 'blocked'
  | 'sandbox_simulated';

/** Poll (or, better, use webhooks). `provider_accepted` means the provider took the message, not that it arrived. */
export async function getDelivery(config: SendnaroConfig, deliveryId: string) {
  const { body } = await sendnaro<{
    id: string;
    status: DeliveryStatus;
    channel: string;
    error?: { code: string; message?: string };
  }>(config, 'GET', `/deliveries/${deliveryId}`);
  return body;
}
