import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  ShieldCheck,
  Zap,
  FileText,
  CreditCard,
} from 'lucide-react';
import { BRAND, PLANS } from '@invoicetap/shared';
import { Button, Card } from '@invoicetap/ui';

export const metadata: Metadata = {
  title: `${BRAND.productName} — Invoices, quotes and receipts your customers pay in minutes`,
  description: BRAND.description,
  alternates: { canonical: '/' },
};

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Create',
    description:
      'Build a branded invoice or quote in under a minute — add items, taxes and discounts.',
  },
  {
    step: '2',
    title: 'Share',
    description:
      'Send it by WhatsApp, email, or a shareable link. No app required for your customer.',
  },
  {
    step: '3',
    title: 'Get paid',
    description:
      'Customers pay online via Paystack or Flutterwave, or you record cash/bank payments manually.',
  },
];

const FEATURES = [
  {
    icon: FileText,
    title: 'Professional documents',
    description:
      'Quotes, invoices and receipts with your logo, brand color, and a choice of PDF templates.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp-first sharing',
    description:
      'One-tap WhatsApp sharing with a pre-filled message and secure link — no setup required.',
  },
  {
    icon: CreditCard,
    title: 'Get paid online',
    description:
      'Accept card and bank payments via Paystack and Flutterwave, or record payments manually.',
  },
  {
    icon: Zap,
    title: 'Automatic reminders',
    description:
      'Never chase a late payment by hand — reminders go out before, on, and after the due date.',
  },
  {
    icon: ShieldCheck,
    title: 'Built for teams',
    description:
      'Invite staff and accountants with role-based permissions, all scoped to your business.',
  },
  {
    icon: CheckCircle2,
    title: 'Multi-currency',
    description:
      'Bill in Naira, Cedis, Shillings, Dollars and more — built for businesses that trade across borders.',
  },
];

const USE_CASES = [
  {
    title: 'Freelancers',
    description: 'Send a polished invoice from your phone right after a client call.',
  },
  {
    title: 'Small retailers',
    description: 'Issue receipts customers can trust, with a scannable verification QR code.',
  },
  {
    title: 'Agencies',
    description: 'Manage quotes and invoices for multiple clients from one workspace.',
  },
  {
    title: 'Consultants',
    description: 'Bill by the hour with fractional quantities and automatic tax calculation.',
  },
];

export default function HomePage() {
  return (
    <>
      <section className="border-border relative overflow-hidden border-b">
        <div className="from-primary/5 absolute inset-0 -z-10 bg-gradient-to-b to-transparent" />
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 md:items-center md:py-24">
          <div>
            <span className="border-border bg-background text-muted-foreground inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium">
              Built for WhatsApp-first businesses
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Create invoices, get paid, and send receipts through WhatsApp in minutes.
            </h1>
            <p className="text-muted-foreground mt-4 max-w-lg text-base sm:text-lg">
              {BRAND.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/register">
                  Get started free <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              No credit card required. Free plan available.
            </p>
          </div>

          <Card className="shadow-popover p-6">
            <div className="border-border flex items-center justify-between border-b pb-4">
              <div>
                <p className="text-muted-foreground text-xs">Invoice</p>
                <p className="text-lg font-semibold">INV-2026-0042</p>
              </div>
              <span className="bg-success/15 text-success rounded-full px-3 py-1 text-xs font-medium">
                Paid
              </span>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Brand identity package</span>
                <span>₦450,000.00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT (7.5%)</span>
                <span>₦33,750.00</span>
              </div>
            </div>
            <div className="border-border mt-4 flex justify-between border-t pt-4 text-base font-semibold">
              <span>Total</span>
              <span>₦483,750.00</span>
            </div>
            <div className="mt-6 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1">
                Download PDF
              </Button>
              <Button size="sm" className="flex-1">
                <MessageCircle className="mr-1.5 size-4" /> Share via WhatsApp
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          How it works
        </h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {HOW_IT_WORKS.map((item) => (
            <div key={item.step} className="text-center">
              <div className="bg-primary text-primary-foreground mx-auto flex size-10 items-center justify-center rounded-full text-sm font-semibold">
                {item.step}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="text-muted-foreground mt-2 text-sm">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border bg-muted/30 border-y">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything you need to get paid faster
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="p-6">
                <feature.icon className="text-primary size-6" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">{feature.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          Built for how you already work
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {USE_CASES.map((useCase) => (
            <div key={useCase.title} className="border-border rounded-lg border p-5">
              <h3 className="font-semibold">{useCase.title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm">{useCase.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border bg-muted/30 border-t">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Simple, transparent pricing
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Object.values(PLANS).map((plan) => (
              <Card key={plan.code} className="flex flex-col p-6">
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-1 text-2xl font-semibold">
                  ${(plan.monthlyPriceMinorUnits / 100).toFixed(0)}
                  <span className="text-muted-foreground text-sm font-normal">/mo</span>
                </p>
                <p className="text-muted-foreground mt-2 text-sm">{plan.description}</p>
                <Button
                  className="mt-6"
                  variant={plan.code === 'STARTER' ? 'primary' : 'outline'}
                  asChild
                >
                  <Link href="/register">Get started</Link>
                </Button>
              </Card>
            ))}
          </div>
          <p className="text-muted-foreground mt-6 text-center text-sm">
            <Link href="/pricing" className="underline underline-offset-2">
              Compare all plan features
            </Link>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Start invoicing in the next five minutes
        </h2>
        <p className="text-muted-foreground mx-auto mt-3 max-w-lg">
          Free forever for up to 5 invoices a month. No credit card required.
        </p>
        <Button size="lg" className="mt-6" asChild>
          <Link href="/register">
            Create your free account <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
      </section>
    </>
  );
}
