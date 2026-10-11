import type { Metadata } from 'next';
import { CodeBlock } from '@/components/marketing/code-block';
import { readExample } from '@/lib/examples';

export const metadata: Metadata = {
  title: 'API documentation',
  description: 'Create invoices, send WhatsApp verification codes and order updates, link Telegram, and receive signed webhooks.',
  alternates: { canonical: '/docs' },
};

const ERRORS: [string, string, string][] = [
  ['400', 'validation_error / invalid_json', 'The body is malformed or contains an unknown field. `error.fields` lists each problem.'],
  ['401', 'unauthenticated', 'Missing, malformed, revoked or unknown key.'],
  ['403', 'insufficient_scope', 'The key lacks the scope this endpoint needs.'],
  ['403', 'activation_required', 'Live sending requires a one-time activation and this business has not activated. Nothing was created or sent.'],
  ['403', 'business_suspended / sandbox_only', 'Suspended business, or a sandbox-only control was used with a live key.'],
  ['404', 'not_found', 'No such resource for this business and environment.'],
  ['409', 'idempotency_conflict / already_linked', 'The Idempotency-Key was used with a different body, or the customer is already connected.'],
  ['422', 'setup_required', 'A live channel is not connected yet (for example no WhatsApp sender). Nothing is simulated.'],
  ['422', 'consent_required / invalid_phone / link_not_allowed / unprocessable', 'A business rule failed; the message says which.'],
  ['422', 'otp_invalid / otp_expired / otp_locked', 'Verification outcomes. `otp_invalid` reports the attempts remaining.'],
  ['429', 'rate_limited', 'Too many requests. Wait for the number of seconds in the Retry-After header.'],
  ['503', 'service_unavailable', 'A dependency (such as the payment gateway) is unavailable. Retry later.'],
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-border border-t py-10 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="text-muted-foreground mt-3 space-y-3 text-sm [&_strong]:text-foreground [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs">
        {children}
      </div>
    </section>
  );
}

const NAV = [
  ['overview', 'How it works'],
  ['auth', 'Authentication'],
  ['sandbox', 'Sandbox and live'],
  ['invoices', 'Invoices and receipts'],
  ['otp', 'WhatsApp verification'],
  ['notifications', 'Notifications'],
  ['telegram', 'Telegram'],
  ['deliveries', 'Deliveries'],
  ['webhooks', 'Webhooks'],
  ['errors', 'Errors'],
  ['limits', 'Limits and costs'],
];

export default function DocsPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[200px_1fr]">
      <nav aria-label="On this page" className="hidden lg:block">
        <ul className="sticky top-24 space-y-2 text-sm">
          {NAV.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-muted-foreground hover:text-foreground">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight">API documentation</h1>
        <p className="text-muted-foreground mt-2">
          The examples below are the exact files from the repository&apos;s <code>examples/</code> folder. They are run against the real API in
          the test suite. The machine-readable contract is <code>apps/api/openapi.yaml</code>.
        </p>

        <div className="mt-10">
          <Section id="overview" title="How it works">
            <p>
              Business registration, business setup, channel connection, API key, backend integration, then a purchase or sign-in event
              triggers Sendnaro. Sendnaro generates the document or code, delivers it automatically, and reports the delivery status back.
            </p>
            <p>
              Your website must call the API (or you connect a verified event source) once. An API key alone does not discover purchases.
              Base URL for local development: <code>http://localhost:3000/api/v1</code>. The intended production base URL is{' '}
              <code>https://sendnaro.com/api/v1</code>, valid once that deployment is configured.
            </p>
          </Section>

          <Section id="auth" title="Authentication">
            <p>
              Send <code>Authorization: Bearer sn_test_...</code> (sandbox) or <code>sn_live_...</code> (live). Keys are{' '}
              <strong>server-side secrets</strong>: keep them in your backend environment, never in browser code, mobile apps, query
              strings, source control or <code>NEXT_PUBLIC_</code> variables. A key is shown once at creation and can be rotated or revoked.
            </p>
            <p>
              Scopes: <code>invoices:create</code>, <code>invoices:read</code>, <code>otp:create</code>, <code>otp:verify</code>,{' '}
              <code>notifications:send</code>, <code>deliveries:read</code>, <code>telegram:link</code>. Create keys with only the scopes they need.
            </p>
            <CodeBlock label="examples/node/client.ts" code={readExample('node/client.ts')} />
          </Section>

          <Section id="sandbox" title="Sandbox and live">
            <p>
              Sandbox keys use the same endpoints, validation and delivery pipeline, but the provider step is simulated. Simulated deliveries have the
              status <code>sandbox_simulated</code>, PDFs carry the watermark &ldquo;SANDBOX - NOT A REAL TRANSACTION&rdquo;, and data is kept
              separately and deleted after a short retention period. A sandbox key can never reach a real provider.
            </p>
            <p>
              Sandbox-only helpers: <code>GET /sandbox/otp-inbox</code>, <code>POST /sandbox/telegram/start</code> and a <code>scenario</code> field
              (<code>success</code>, <code>invalid_recipient</code>, <code>temporary_failure</code>, <code>permanent_failure</code>,{' '}
              <code>throttled</code>, <code>delayed_callback</code>, <code>duplicate_callback</code>, <code>ambiguous_timeout</code>,{' '}
              <code>expired_otp</code>). Live keys that use them receive <code>403 sandbox_only</code>.
            </p>
            <p>
              A live request for a channel that is not connected returns <code>422 setup_required</code>. When Sendnaro&apos;s one-time activation is
              turned on and a business has not activated, live requests return <code>403 activation_required</code> before anything is created.
            </p>
          </Section>

          <Section id="invoices" title="Invoices and receipts">
            <p>
              Send the purchase from your backend <strong>after you have verified the payment</strong>. Amounts are integer minor units
              (<code>500000</code> is NGN 5,000.00); Sendnaro calculates the totals and ignores any total you might send. The response is{' '}
              <code>202 Accepted</code>: the document is queued, not yet delivered. Repeat requests with the same <code>Idempotency-Key</code> return
              the same invoice.
            </p>
            <CodeBlock label="examples/curl/create-invoice.sh" code={readExample('curl/create-invoice.sh')} />
            <CodeBlock label="examples/node/create-invoice.ts" code={readExample('node/create-invoice.ts')} />
          </Section>

          <Section id="otp" title="WhatsApp verification">
            <p>
              Create a challenge, then verify the code your customer types. The API never returns the code; in the sandbox read it from the test inbox.
              Codes expire after 10 minutes, allow 5 attempts, are single use, and resends invalidate earlier codes. Verification proves access to the
              WhatsApp number only; it does not prove identity or verify an email address.
            </p>
            <CodeBlock label="examples/node/otp.ts" code={readExample('node/otp.ts')} />
          </Section>

          <Section id="notifications" title="Notifications">
            <p>
              Order and payment updates use fixed message types. Free text is limited to 300 characters. Links must be on the business&apos;s allowed link
              origins (set in the console) so the API cannot be used to relay arbitrary links.
            </p>
            <CodeBlock label="examples/node/deliveries-and-notifications.ts" code={readExample('node/deliveries-and-notifications.ts')} />
          </Section>

          <Section id="telegram" title="Telegram">
            <p>
              A Telegram bot cannot message someone first and cannot find a person by phone number. Create a one-time link for the customer; when they
              open it and press Start, that customer is connected. Until then a Telegram delivery is recorded as <code>failed</code> with{' '}
              <code>telegram_not_connected</code>. Telegram does not provide delivery receipts, so a successful send is reported as <code>sent</code>.
            </p>
            <CodeBlock label="examples/node/telegram.ts" code={readExample('node/telegram.ts')} />
          </Section>

          <Section id="deliveries" title="Deliveries">
            <p>
              Each channel has its own delivery with a status: <code>queued</code>, <code>processing</code>, <code>provider_accepted</code>,{' '}
              <code>sent</code>, <code>delivered</code>, <code>read</code>, <code>retrying</code>, <code>failed</code>, <code>expired</code>,{' '}
              <code>blocked</code>, <code>sandbox_simulated</code>. <code>provider_accepted</code> means the provider took the message; delivery and read
              states come from provider receipts. Temporary failures are retried with backoff; permanent ones are not. If a provider call times out and
              we cannot tell whether it was accepted, we do not blindly send again; the delivery is confirmed by a receipt or ends as{' '}
              <code>provider_timeout_unconfirmed</code>. Some residual uncertainty about third-party delivery always remains.
            </p>
          </Section>

          <Section id="webhooks" title="Webhooks">
            <p>
              Register an https endpoint in the console. Events: <code>invoice.generated</code>, <code>invoice.failed</code>,{' '}
              <code>delivery.sent</code>, <code>delivery.delivered</code>, <code>delivery.failed</code>, <code>otp.verified</code> (ids and outcome only,
              never the code). Each request is signed with <code>Sendnaro-Signature</code> over the exact raw body and timestamp. Verify it, reject old
              timestamps, and de-duplicate on the event <code>id</code>. A failing callback is retried, and never causes the customer message to be resent.
            </p>
            <CodeBlock label="examples/node/verify-webhook.ts" code={readExample('node/verify-webhook.ts')} />
          </Section>

          <Section id="errors" title="Errors">
            <p>
              Every error is <code>{'{ "error": { "code", "message", "request_id", "fields"? } }'}</code>. Quote the <code>request_id</code> when you contact support.
            </p>
            <div className="border-border overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">HTTP</th>
                    <th className="px-3 py-2">code</th>
                    <th className="px-3 py-2">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {ERRORS.map(([status, code, meaning]) => (
                    <tr key={code} className="border-border border-t align-top">
                      <td className="px-3 py-2 font-mono text-xs">{status}</td>
                      <td className="px-3 py-2 font-mono text-xs">{code}</td>
                      <td className="px-3 py-2">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="limits" title="Limits and costs">
            <p>
              Each key has a request-per-minute limit, and verification codes are limited per business, per recipient and per address. A <code>429</code>{' '}
              includes <code>Retry-After</code>. WhatsApp messages are sent through your own WhatsApp Business account; Meta may charge you for them and
              enforces its own limits. Idempotency records are kept for 24 hours; sandbox data for 7 days by default.
            </p>
          </Section>
        </div>
      </article>
    </div>
  );
}
