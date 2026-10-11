import type { Metadata } from 'next';
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Frequently asked questions about InvoiceTap.',
  alternates: { canonical: '/faq' },
};

const FAQS = [
  {
    q: 'Do I need a WhatsApp Business account?',
    a: 'No. WhatsApp sharing works with a standard WhatsApp account on your phone via a click-to-chat link — no business API setup required to get started.',
  },
  {
    q: 'Which countries and currencies are supported?',
    a: 'InvoiceTap supports major global currencies plus a range of African currencies including NGN, GHS, KES, ZAR, XOF, XAF, EGP and more. You can bill in any supported currency regardless of where your business is registered.',
  },
  {
    q: 'How do online payments work?',
    a: 'Customers pay via a secure link using Paystack or Flutterwave (card, bank transfer, and local payment methods depending on the provider). Payments are verified directly with the provider before an invoice is marked paid.',
  },
  {
    q: 'Can I use InvoiceTap without accepting online payments?',
    a: 'Yes — you can record cash, bank transfer or other manual payments at any time, with or without online payment providers connected.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes, the Free plan supports up to 5 invoices and 3 customers per month with WhatsApp sharing and manual payment recording, forever.',
  },
  {
    q: 'Can my accountant or team access my account?',
    a: 'Yes — invite team members with specific roles (admin, accountant, staff, or view-only) on the Business and Agency plans.',
  },
  {
    q: 'Is my data secure?',
    a: 'See our Security page for the full breakdown — in short: encrypted secrets, hashed passwords, tenant-isolated data, and verified payment webhooks.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, you can downgrade or cancel your plan at any time from your billing settings.',
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Frequently asked questions
        </h1>
      </div>

      <Accordion.Root
        type="single"
        collapsible
        className="divide-border border-border mt-10 divide-y border-y"
      >
        {FAQS.map((faq, i) => (
          <Accordion.Item key={i} value={`item-${i}`}>
            <Accordion.Trigger className="group flex w-full items-center justify-between py-4 text-left text-sm font-medium">
              {faq.q}
              <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            </Accordion.Trigger>
            <Accordion.Content className="text-muted-foreground pb-4 text-sm">
              {faq.a}
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </div>
  );
}
