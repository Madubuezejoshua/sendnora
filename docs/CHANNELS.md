# Channels: WhatsApp and Telegram

## WhatsApp (each business connects its own sender)

Sendnaro uses the **official WhatsApp Business Platform (Cloud API)**. It does not use WhatsApp Web, scraping, browser
automation or personal-account sessions. Each business brings its own verified sender; Meta bills that business directly.
Sendnaro credentials and Meta credentials are separate: the Sendnaro API key authenticates your server to us; the Meta access
token authorizes our adapter to send through your sender.

Requirements (check Meta's current documentation, they change):

- A Meta Business portfolio, a Meta app with the WhatsApp product, and a verified phone number (Phone number ID).
- **Approved templates.** Business-initiated messages must be templates:
  - OTP: an _authentication_ template (body variable = code, plus the one-time-password button). Sendnaro sends the code in the
    body parameter and in the URL-button parameter at index 0, as Meta documents.
  - Invoices: a _utility_ template with a **document header** and one body variable.
  - Notifications: a _utility_ template with one body variable.
- Template names and language go in the console. Without them live requests return `setup_required`; nothing is faked.

Console, Settings, Channels: enter the Phone number ID, WABA ID, access token, app secret, a verify token you invent (12+
characters), and template names. The credentials are checked with a read-only Graph call and stored **encrypted**; they are never
returned. Then in the Meta app set the webhook **Callback URL** shown in the console
(`<origin>/api/v1/webhooks/whatsapp/<connection id>`), enter your verify token, and subscribe to `messages`. Callbacks are verified
with `X-Hub-Signature-256` using _that business's_ app secret and are applied only to that business's deliveries.

Behaviour: statuses (`sent`, `delivered`, `read`, `failed`) come from Meta callbacks, not from the HTTP 200; throttling errors
(for example 130429, 131056) are retried honouring `Retry-After`; invalid recipients and revoked credentials are terminal; a
timeout whose outcome is unknown is **not** blindly resent.

Not verified in this repository: a real send, template approval, onboarding of a real sender, Meta pricing (see TEST_REPORT.md).

## Telegram (shared Sendnaro bot)

A bot cannot start a conversation or look up a person by phone number, so customers connect through a one-time link
(`POST /telegram/link-tokens`) and press Start. All businesses use one clearly branded bot; connections are stored per business and
never shared between businesses.

Operator setup (once per deployment):

1. Create the bot with `@BotFather`; set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and a random `TELEGRAM_WEBHOOK_SECRET`.
2. Register the webhook (Telegram echoes the secret in `X-Telegram-Bot-Api-Secret-Token`; anything else is rejected with 401):

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<your-origin>/api/v1/webhooks/telegram" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" -d 'allowed_updates=["message"]'
```

Link tokens are random, single use, expire in 15 minutes, store only a digest, are bound to business, environment and customer, and
the chat id comes from the authenticated update. Re-linking an already connected customer needs the merchant to ask for it
(`force_relink`); the previous chat is told. `/stop` disconnects the customer everywhere. Telegram offers no delivery receipts, so a
successful send is `sent`. Telegram is not used for OTP codes.
