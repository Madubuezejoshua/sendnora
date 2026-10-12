# Billing: one-time activation (owner guide)

Sendnaro can require a **one-time activation payment** per business before it may send live messages. It is a licence
payment, **not a subscription**, and it does not pay for WhatsApp: Meta may charge each business directly for messages, and
hosting/storage costs are yours. Payments are built and tested but **billing ships OFF**.

## Current state

- `billing_required` defaults to **false** and is stored server-side (`ApplicationSetting`). Seeds only insert it if missing,
  so a restart, redeploy or re-seed never resets your choice.
- While off: sandbox works, and a business with a connected live channel and a valid live key can send without a Sendnaro
  payment. No checkout can start and nothing is charged. The home page, pricing page and console say so.
- Authentication, tenant isolation, consent, rate limits and provider readiness still apply. Revoked keys and suspended
  businesses stay blocked in both modes.

## Turning it on (when you decide to)

1. Set `PAYSTACK_SECRET_KEY` (and `PAYSTACK_PUBLIC_KEY`) on the API. Use `sk_test_` first to rehearse; test-mode payments never
   unlock production and never count as revenue. Point Paystack's webhook at `<origin>/api/v1/webhooks/sendnaro-activation`.
2. Open **Admin, Billing and access**. Set the activation price and currency.
3. Check **Payment gateway readiness** (configured, live or test mode).
4. Click **Require activation payments…** and confirm. It refuses (`billing_not_ready`) if the gateway or price is missing.
5. Effects: unpaid businesses are blocked from live sending at the API **and** for already-queued live jobs (they become
   `blocked`, reason `activation_required`); each unpaid business sees a checkout in the console; sandbox stays free.

Turning it off again relaxes the gate immediately and keeps all payment history and entitlements.

## How a payment becomes access

1. The console creates a stored **quote** (amount and currency copied from your settings) and a pending payment bound to that
   business, then asks Paystack for a checkout. Repeated clicks reuse the pending payment.
2. After checkout, access is granted only by `confirmActivationPayment`, called from the Paystack webhook (HMAC-SHA512 over the
   raw bytes) and from the console's verify call. Both **ask Paystack server-to-server** for the transaction; a redirect URL, a
   webhook body or a client claim is never trusted on its own.
3. Amount, currency and live/test mode must match the stored quote for that business. A price change after the quote does not
   break an in-flight payment.
4. The pending-to-succeeded flip is one conditional database update: concurrent confirmations (webhook plus redirect plus retries)
   grant exactly once, and revenue cannot be counted twice.
5. A full refund or a dispute revokes the entitlement; partial refunds reduce revenue only.

Merchant purchases are unrelated: one of your customers paying a business can never activate that business's Sendnaro licence.

## Revenue, entitlements and audit

The admin panel shows revenue **per currency** (never summed across currencies) computed from verified **live-mode** payments net
of refunds; test-mode and pending payments are excluded. Complimentary activation can be granted to a business with a mandatory
note; it is stored as `COMPLIMENTARY` and never counted as revenue. Every billing change, entitlement grant or revocation,
suspension and mismatch is written to the audit history.

## Existing free users

Using the API during the free phase does not grant a paid entitlement. If you want to waive the fee for someone, grant a
complimentary activation (audited).
