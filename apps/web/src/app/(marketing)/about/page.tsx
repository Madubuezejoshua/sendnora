import type { Metadata } from 'next';
import { BRAND } from '@invoicetap/shared';

export const metadata: Metadata = {
  title: 'About',
  description: `About ${BRAND.productName}.`,
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        About {BRAND.productName}
      </h1>
      <div className="prose prose-sm text-muted-foreground mt-6 max-w-none">
        <p>
          {BRAND.productName} was built on a simple observation: most invoicing software assumes
          businesses communicate with customers over email. In many of the fastest-growing markets
          in the world, that&apos;s not how business actually happens — it happens on WhatsApp.
        </p>
        <p className="mt-4">
          We set out to build an invoicing tool that treats WhatsApp as a first-class channel,
          supports the payment rails that actually work in these markets (Paystack, Flutterwave),
          and handles the currencies businesses actually bill in — without giving up the
          professionalism and reliability of a modern SaaS product.
        </p>
        <p className="mt-4">
          {BRAND.productName} is an early-stage product. We&apos;re building it in the open, one
          release at a time.
        </p>
      </div>
    </div>
  );
}
