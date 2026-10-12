import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, MessageCircle, Send } from 'lucide-react';
import { BRAND } from '@sendnaro/shared';
import { Button } from '@sendnaro/ui';
import { CodeBlock } from '@/components/marketing/code-block';
import { readExample } from '@/lib/examples';
import { getPlatformState } from '@/lib/platform-state';

export const metadata: Metadata = {
  title: { absolute: `${BRAND.productName}: ${BRAND.tagline}` },
  description: BRAND.description,
  alternates: { canonical: '/' },
};

const FEATURES = [
  {
    icon: FileText,
    title: 'Automatic invoices',
    body: 'Your backend confirms a payment. Sendnaro builds a branded PDF receipt and delivers it, with no one clicking send.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp verification',
    body: 'Send one-time codes to a customer’s WhatsApp number and verify them on your server, once.',
  },
  {
    icon: Send,
    title: 'Telegram delivery',
    body: 'Customers who connect Telegram once receive invoices and updates there. Each channel is tracked separately.',
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Set up once',
    body: 'Add your business details, connect your WhatsApp sender, and create a key.',
  },
  {
    n: '2',
    title: 'Send from your backend',
    body: 'Call the API when an order is paid or a customer asks for a code.',
  },
  {
    n: '3',
    title: 'Track every delivery',
    body: 'Follow each message from queued to delivered, or get signed webhooks.',
  },
];

export default async function HomePage() {
  const platform = await getPlatformState();
  const snippet = readExample('curl/create-invoice.sh')
    .split('\n')
    .filter((l) => !l.startsWith('#') && !l.startsWith('set '))
    .join('\n')
    .trim();

  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-24">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Customer messages, delivered automatically.
          </h1>
          <p className="text-muted-foreground mt-5 max-w-xl text-lg">
            Connect your website or app to send invoices, WhatsApp verification codes, and order
            updates through one API.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/register">Start testing</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/docs">Read the API docs</Link>
            </Button>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            {platform.state === 'billing'
              ? 'The sandbox is free. Live sending needs a one-time activation.'
              : platform.state === 'free'
                ? 'The sandbox is free, and live sending is currently available without a Sendnaro activation fee.'
                : 'The sandbox is free.'}
          </p>
        </div>
        <CodeBlock label="POST /api/v1/invoices (server-side)" code={snippet} />
      </section>

      <section aria-labelledby="features" className="border-border border-y">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="features" className="sr-only">
            What it does
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <f.icon className="text-success size-6" aria-hidden="true" />
                <h3 className="mt-3 text-base font-semibold">{f.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          Set up once. Send from your backend. Track every delivery.
        </h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="border-border rounded-lg border p-5">
              <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-full text-xs font-semibold">
                {s.n}
              </span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-muted/40 border-border border-t">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-lg font-semibold">Plain facts</h2>
          <ul className="text-muted-foreground mt-3 grid gap-2 text-sm md:grid-cols-2">
            <li>
              WhatsApp messages use the official WhatsApp Business Platform. Meta may charge your
              business for messages, and it sets sending limits.
            </li>
            <li>
              A WhatsApp code verifies access to that phone number. It does not verify an email
              address.
            </li>
            <li>
              Telegram cannot start a conversation with a customer. They connect once from a link
              you give them.
            </li>
            <li>
              A 202 response means “accepted for processing”. Delivery status is reported
              separately.
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
