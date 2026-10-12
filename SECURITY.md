# Security

Report a vulnerability through the support form on the website, marked **Security**, with the `request_id` if you have one. Do not
include secrets or real customer data. There is no bug-bounty programme.

## Controls implemented (and where they are tested)

| Concern            | Control                                                                                                                                                                              | Test                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| API authentication | 256-bit keys, SHA-256 at rest, prefix is not authentication, scopes decided before side effects, per-key limits from a shared store                                                  | `sn-auth-console`                                                       |
| Tenant isolation   | Tenant and environment from the key only; every query scoped; foreign ids are "not found"; no body field can override                                                                | `sn-invoices`, `sn-otp`, `sn-auth-console`, `admin-isolation` (browser) |
| Live gate          | One entitlement check on API, queued jobs, retries; suspension and revocation re-checked at send time                                                                                | `sn-billing`                                                            |
| OTP                | CSPRNG seed, code = HMAC with a server key, never stored/logged/returned, attempt cap, cooldown, hourly cap, single use under concurrency, versioned resend, purpose/recipient bound | `sn-otp`                                                                |
| Idempotency        | Scoped, durable, concurrent-safe, atomic with the resource                                                                                                                           | `sn-invoices`                                                           |
| Provider callbacks | HMAC over raw bytes with that business's secret; correlated by sender; duplicates and out-of-order handled                                                                           | `sn-reliability`                                                        |
| Outgoing webhooks  | Signed with timestamp, replay window, SSRF-safe (private ranges, DNS rebinding at connect time, no redirects)                                                                        | `sn-reliability`                                                        |
| Telegram           | Opaque single-use tokens (digest stored), webhook secret fail-closed, sandbox/live token separation, tenant-bound simulator                                                          | `sn-telegram`                                                           |
| Payments           | Server-to-server verification only; quote/amount/currency/mode binding; atomic grant; refunds/disputes; test mode never unlocks production                                           | `sn-billing`                                                            |
| Secrets at rest    | AES-256-GCM for provider credentials and webhook secrets; never returned by any endpoint                                                                                             | `sn-auth-console`                                                       |
| Notifications      | Fixed types, 300-char cap, link allow-list: not an arbitrary spam or phishing relay                                                                                                  | `sn-invoices`, examples                                                 |
| Files              | Private bucket, short-lived signed links, owner-scoped download; logos are server-side fetched from our own storage only                                                             | `sn-pdf`, `automation` (browser)                                        |
| Sessions / console | Database-tracked sessions, owner/admin roles enforced on the server, platform admin from the verified token                                                                          | `admin-isolation`                                                       |
| Browser relay      | Sandbox keys only, signed-in session required, allow-listed endpoints                                                                                                                | `admin-isolation`                                                       |
| Errors / logs      | Consistent safe errors with `request_id`; Authorization redacted; no OTP or secret in logs                                                                                           | `sn-otp`, `sn-auth-console`                                             |

## Known limits and residual risks

- Provider delivery is never guaranteed; ambiguous outcomes are not resent and may be reported as unconfirmed.
- Rate limits are fixed-window counters; a burst at a window edge can briefly exceed the nominal rate.
- Sandbox PDFs are served from local storage in development (unsigned URL with a non-guessable key); production uses private signed B2 links.
- The legacy manual-invoicing endpoints (`/api/legacy/v1`) predate this design and use the web session token model.
- No third-party security review or penetration test has been performed. Legal pages are unreviewed templates.

## Operational guidance

Rotate any secret that appeared in chat, tickets or screenshots. Keep `APP_ENCRYPTION_KEY` and `OTP_HMAC_KEY` in a secret manager: rotating the
former invalidates stored provider credentials and webhook secrets (businesses must re-enter them); rotating the latter invalidates pending codes.
