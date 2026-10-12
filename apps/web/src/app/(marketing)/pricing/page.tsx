import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrency } from '@sendnaro/shared';
import { Button } from '@sendnaro/ui';
import { getPlatformState } from '@/lib/platform-state';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'What Sendnaro costs today, and what third-party providers may charge you.',
  alternates: { canonical: '/pricing' },
};

function formatPrice(amountMinor: number, currency: string): string {
  try {
    const digits = getCurrency(currency).minorUnitDigits;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
      amountMinor / 10 ** digits,
    );
  } catch {
    return `${currency} ${amountMinor / 100}`;
  }
}

export default async function PricingPage() {
  const { state, price } = await getPlatformState();

  const live =
    state === 'billing' && price
      ? {
          title: `${formatPrice(price.amountMinor, price.currency)} one-time`,
          body: 'Activate a business once to send live messages. This is a licence payment, not a subscription, and it does not include provider charges.',
        }
      : state === 'free'
        ? {
            title: 'No activation fee right now',
            body: 'Live sending is currently available without a Sendnaro payment. A one-time activation may be introduced later; the sandbox will stay free.',
          }
        : {
            title: 'See the console',
            body: 'Current live access terms are shown in the console after you sign in.',
          };

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl">
        There is no monthly Sendnaro subscription. This page reflects the current state of the
        platform, not a promise about the future.
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <section className="border-border rounded-lg border p-6" aria-labelledby="sandbox">
          <h2 id="sandbox" className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Sandbox
          </h2>
          <p className="mt-2 text-2xl font-semibold">Free</p>
          <ul className="text-muted-foreground mt-4 space-y-2 text-sm">
            <li>Test keys, real API, simulated delivery</li>
            <li>Watermarked sandbox PDFs</li>
            <li>OTP test inbox, Telegram link simulator</li>
            <li>Signed webhooks to your own receiver</li>
          </ul>
          <Button className="mt-6" asChild>
            <Link href="/register">Start testing</Link>
          </Button>
        </section>

        <section className="border-border rounded-lg border p-6" aria-labelledby="live">
          <h2 id="live" className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Live sending
          </h2>
          <p className="mt-2 text-2xl font-semibold">{live.title}</p>
          <p className="text-muted-foreground mt-4 text-sm">{live.body}</p>
          <ul className="text-muted-foreground mt-4 space-y-2 text-sm">
            <li>Real WhatsApp and Telegram delivery</li>
            <li>Your own WhatsApp sender and keys</li>
            <li>Delivery tracking and retries</li>
          </ul>
        </section>
      </div>

      <section className="mt-12" aria-labelledby="provider-costs">
        <h2 id="provider-costs" className="text-lg font-semibold">
          What providers may charge you
        </h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong className="text-foreground">WhatsApp.</strong> Messages are sent through your
            own WhatsApp Business account. Meta may charge you directly for template messages (for
            example authentication and utility messages) and applies its own sending limits.
            Sendnaro does not pay for your messages.
          </li>
          <li>
            <strong className="text-foreground">Telegram.</strong> Bot messages are free of charge
            from Telegram, and subject to its rate limits.
          </li>
          <li>
            <strong className="text-foreground">Your payment provider.</strong> Sendnaro does not
            process your customers’ purchases.
          </li>
        </ul>
      </section>
    </div>
  );
}
