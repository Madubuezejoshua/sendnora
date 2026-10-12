# Integrating a merchant backend

Sendnaro does not discover purchases by itself. **Your server calls the API** (or you connect a verified event
source) when something happens. This guide shows the three flows. The code is in [`examples/`](../examples) and is
executed against the real API by `apps/api/tests/integration/sn-examples.test.ts`.

Base URL: `http://localhost:3000/api/v1` locally. The intended production base URL is `https://sendnaro.com/api/v1`;
that is only true once the domain is deployed and configured.

## 1. Keys

Create keys in the console (**API keys**). A key is `sn_test_...` (sandbox) or `sn_live_...` (live), shown once, stored only
as a SHA-256 digest, and has scopes: `invoices:create`, `invoices:read`, `otp:create`, `otp:verify`, `notifications:send`,
`deliveries:read`, `telegram:link`. Give each integration only what it needs, and a per-minute request limit.

Keys are **server-side secrets**. Keep them in your backend environment (`SENDNARO_API_KEY`); never in browser code, mobile
apps, source control, query strings or `NEXT_PUBLIC_` variables. Rotate or revoke in the console; the old key stops working
immediately, and queued messages it created are not sent.

Sandbox and live are separate: separate keys, data, document numbers, recipients and webhook secrets. A sandbox key never
reaches a real provider.

## 2. Automatic invoice or receipt after payment

Call this **after your backend has verified the payment** with your payment provider (a verified webhook or a server-side
verify call). A browser redirect or button click is not proof of payment.

```ts
import { createReceiptForPaidOrder } from './examples/node/create-invoice';

await createReceiptForPaidOrder(
  { apiKey: process.env.SENDNARO_API_KEY! },
  {
    id: 'order_1042',
    paymentReference: 'pay_abc',
    customerId: 'customer_42',
    customerName: 'Ada',
    whatsappPhone: '+2348012345678',
    currency: 'NGN',
    items: [{ description: 'Sample purchase', quantity: 1, unitAmountMinor: 500000 }],
  },
);
```

- Amounts are integer minor units (`500000` = NGN 5,000.00). Totals are computed by Sendnaro; a total you send is rejected.
- `document_type: "receipt"` requires `payment.status: "paid"` and a `payment.reference`. An unpaid `invoice` never says paid.
- Use `Idempotency-Key` (for example `shop-order-1042-invoice`). The same key and body return the original response
  (`Idempotent-Replayed: true`); the same key with a different body returns `409 idempotency_conflict`. Keys are kept 24 hours.
- Set `consent.whatsapp_transactional: true` only if the customer agreed to transactional WhatsApp messages.
- Response `202` means _accepted for processing_. Track delivery with `GET /deliveries/{id}` or webhooks.
- The PDF is stored privately; `GET /invoices/{id}` returns a short-lived signed link once it exists.
- Issued documents keep a snapshot of the business profile; later profile edits only affect new documents.

## 3. WhatsApp verification codes

```ts
const { challengeId } = await startPhoneVerification(config, phone, 'user_1'); // POST /otp/challenges
const result = await confirmPhoneVerification(config, challengeId, phone, code); // POST /otp/challenges/{id}/verify
```

Codes are never returned by the API and never stored. They expire in 10 minutes, allow 5 attempts, work once, and a resend
invalidates earlier codes. Verification is bound to this business, environment, challenge, **recipient and purpose**.
Limits apply per key, per business, per recipient (cooldown and hourly cap) and per calling address, from a shared store.
This proves access to the WhatsApp number; it does not prove identity or verify an email address (verify email by email).

## 4. Telegram

A bot cannot start a conversation and cannot find someone by phone number. Request a one-time link and show it to the customer:

```ts
const { url } = await createTelegramLink(config, 'customer_42', 'Ada'); // https://t.me/<bot>?start=<opaque token>
```

When they open it and press Start, that customer is connected; later `channels: ["telegram"]` requests deliver there. Until
then a Telegram delivery is recorded as `failed` with `telegram_not_connected`. `DELETE /telegram/links/{customer}` disconnects;
customers can also send `/stop` to the bot. Links are single use, expire in 15 minutes, and can only be consumed by the business
that issued them. The bot is the shared Sendnaro bot, so customers see that sender.

## 5. Notifications

`POST /notifications` with a fixed `type` (`order_confirmation`, `payment_confirmation`, `shipping_update`, `general_update`),
optional short fields and a link. Free text is capped at 300 characters and any link must be on the business's allowed link
origins (console, Settings, Business). This is intentionally not a general messaging relay.

## 6. Webhooks

Register an https endpoint (console, Settings, Webhooks). Events: `invoice.generated`, `invoice.failed`, `delivery.sent`,
`delivery.delivered`, `delivery.failed`, `otp.verified` (ids and outcome only). Verify `Sendnaro-Signature` over the raw body
([`examples/node/verify-webhook.ts`](../examples/node/verify-webhook.ts)), reject old timestamps, and de-duplicate on the event id.
Failed callbacks retry with backoff (up to 8 attempts) and never cause the customer message to be sent again.

## 7. Statuses and errors

`queued`, `processing`, `provider_accepted`, `sent`, `delivered`, `read`, `retrying`, `failed`, `expired`, `blocked`,
`sandbox_simulated`. Errors are `{ "error": { "code", "message", "request_id" } }`; the code table is on the website at `/docs`
and in `openapi.yaml`. Notable: `activation_required` (live billing is on and the business is not activated; nothing was created),
`setup_required` (a live channel is not connected; nothing is simulated), `consent_required`, `otp_invalid|expired|locked`,
`rate_limited` (see `Retry-After`).

## 8. Going live checklist

1. Connect your own WhatsApp Business sender in the console (see [CHANNELS.md](CHANNELS.md)); Meta may charge your account.
2. Create a `sn_live_` key with the scopes you need and put it in your server environment.
3. If the owner has enabled billing, activate the business (see [BILLING.md](BILLING.md)); otherwise live access is free of a Sendnaro fee.
4. Send to real, consenting numbers only. Sandbox placeholders such as `+2348000000000` are not for live use.
5. Register a webhook endpoint and monitor Deliveries in the console.

## Pattern B: automatic receipts from your Paystack payments (no code on your side)

If you already take payments with Paystack, Sendnaro can issue and send the receipt by itself.

1. In the console, `PUT /api/console/payment-sources` (Settings) with your Paystack **secret key** (stored encrypted, never shown again) and the
   environment. The response contains a `webhook_url` of the form `/api/v1/webhooks/merchant/paystack/<sourceId>`.
2. Paste that URL as a webhook URL in your Paystack dashboard.
3. When you initialise a transaction, include in its `metadata`:
   `{"sendnaro": {"whatsapp_phone": "+2348012345678", "consent_whatsapp": true, "customer_name": "Ada Obi", "items": [{"description": "Plan", "quantity": 1, "unit_amount_minor": 250000}]}}`

Each `charge.success` is verified (`x-paystack-signature`, HMAC-SHA512 over the raw body with your secret) and becomes a receipt through the same
pipeline as the API (entitlement gate, consent, numbering, PDF, delivery, outgoing webhooks). Redelivered events are deduplicated by the Paystack
transaction id. Events without a phone number and recorded consent, or whose items do not add up to the amount charged, are acknowledged and ignored.
This is separate from Sendnaro's own activation payment: your customers' payments can never activate your licence.
