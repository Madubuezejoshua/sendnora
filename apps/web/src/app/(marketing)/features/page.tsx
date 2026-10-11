import type { Metadata } from 'next';
import {
  FileText,
  MessageCircle,
  CreditCard,
  Bell,
  Users,
  BarChart3,
  Repeat,
  Receipt,
} from 'lucide-react';
import { Card } from '@invoicetap/ui';

export const metadata: Metadata = {
  title: 'Features',
  description: 'Everything you need to quote, invoice, get paid and track your business.',
  alternates: { canonical: '/features' },
};

const FEATURES = [
  {
    icon: FileText,
    title: 'Quotes & Invoices',
    description:
      'Create branded quotes and invoices with line items, taxes, discounts, and multi-currency support. Convert accepted quotes to invoices in one click.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp sharing',
    description:
      'Share any document via a pre-filled WhatsApp message and secure link — works instantly with no setup, plus a prepared path to fully automated sending.',
  },
  {
    icon: CreditCard,
    title: 'Online payments',
    description:
      'Accept card and bank payments through Paystack and Flutterwave, or record cash and bank transfer payments manually. Partial payments are supported.',
  },
  {
    icon: Receipt,
    title: 'Receipts',
    description:
      'Every payment automatically generates a receipt with a QR-code verification link your customer can trust.',
  },
  {
    icon: Repeat,
    title: 'Recurring invoices',
    description:
      'Set up daily, weekly, monthly, quarterly or custom billing schedules — invoices generate and can auto-issue themselves.',
  },
  {
    icon: Bell,
    title: 'Payment reminders',
    description: 'Automatic reminders before, on, and after the due date, by email and WhatsApp.',
  },
  {
    icon: Users,
    title: 'Team & permissions',
    description:
      'Invite staff and accountants with role-based access — owner, admin, accountant, staff, or view-only.',
  },
  {
    icon: BarChart3,
    title: 'Dashboard & reports',
    description:
      'Track outstanding balances, overdue ageing, revenue by customer/product, tax and discount summaries.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything you need to run your billing
        </h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-xl">
          From the first quote to the final receipt, InvoiceTap covers the whole cycle.
        </p>
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="p-6">
            <f.icon className="text-primary size-6" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">{f.title}</h2>
            <p className="text-muted-foreground mt-1.5 text-sm">{f.description}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
