# Sandbox

The sandbox runs the **real** application: key authentication, strict validation, tenant isolation, invoice
rendering, the outbox and workers, the OTP verifier, the delivery state machine and outgoing webhooks. Only the
provider boundary (WhatsApp/Telegram) is replaced by a deterministic adapter. There is no separate "happy path" API.

## What is different

- Keys are `sn_test_...`; data, document numbers (`SBX-INV-000001`), recipients, OTP challenges, deliveries and webhook
  endpoints are stored per environment.
- Successful simulated sends end as `sandbox_simulated` (`simulated: true`). They are never reported as `delivered` unless a
  scenario simulates a receipt.
- PDFs carry the watermark **SANDBOX - NOT A REAL TRANSACTION**.
- Sandbox data is deleted after `SANDBOX_RETENTION_DAYS` (default 7).
- Sandbox needs no payment, no WhatsApp credentials and no Telegram bot, regardless of the billing switch.
- A sandbox key can never send a real message, unlock live billing entitlement, or expose a live document.
- Live keys cannot use sandbox helpers: they receive `403 sandbox_only`.

## Sandbox-only helpers

| Endpoint                        | Purpose                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET /sandbox/otp-inbox?phone=` | The code a simulated phone received (the only place a code is ever readable)                                          |
| `POST /sandbox/telegram/start`  | Simulate the customer pressing Start (`token` from the link, optional `chat_id`); only tokens issued to your business |
| `POST /sandbox/process-queue`   | Run your queued sandbox jobs now; `{ "fast_forward": true }` pulls retries and delayed receipts forward               |
| `scenario` field                | Force a provider outcome on invoices, notifications and OTPs                                                          |

## Scenarios

| Scenario                 | Behaviour                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `success`                | Accepted                                                                                                            |
| `invalid_recipient`      | Permanent failure, no retry                                                                                         |
| `permanent_failure`      | Permanent provider rejection                                                                                        |
| `temporary_failure`      | Transient failure on attempts 1 and 2, then accepted                                                                |
| `throttled`              | Throttled on attempt 1 (honours retry-after), then accepted                                                         |
| `delayed_callback`       | Accepted; the delivered receipt arrives later                                                                       |
| `duplicate_callback`     | Accepted; the delivered receipt arrives twice (only one transition and one webhook)                                 |
| `ambiguous_timeout`      | First call "times out" after maybe accepting; **not resent**; a late receipt confirms delivery                      |
| `ambiguous_timeout_lost` | As above but no receipt: ends as `failed` / `provider_timeout_unconfirmed` after the grace window, still not resent |
| `expired_otp`            | OTP only: the challenge is created already expired and is never sent                                                |

## Playground

Console, Integration, with the Sandbox selector: create a sandbox key, then submit a sample paid purchase (inspect the PDF
and deliveries), send and verify a code from the test inbox, create a Telegram link and simulate Start (or skip it to see
`telegram_not_connected`), run failure scenarios, and register a webhook endpoint under Settings. The playground calls the real
`/api/v1` through a relay that accepts `sn_test_` keys only and requires a signed-in session. For a local webhook receiver see
[`examples/node/verify-webhook.ts`](../examples/node/verify-webhook.ts); sandbox endpoints may use `http://localhost` only when the API
runs with `ALLOW_LOCAL_WEBHOOK_TARGETS=true` (never in production).

## What the sandbox does not prove

It does not prove a real WhatsApp or Telegram delivery, Meta template approval, provider limits, or a live payment. See
[TEST_REPORT.md](../TEST_REPORT.md) for the real-provider checks that were not run.
