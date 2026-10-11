import Link from 'next/link';
import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import { PLANS, type PlanDefinition } from '@invoicetap/shared';
import { Button, Card } from '@invoicetap/ui';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple, transparent pricing for freelancers, small businesses and agencies.',
  alternates: { canonical: '/pricing' },
};

function featureRows(plan: PlanDefinition): string[] {
  const rows: string[] = [];
  rows.push(
    plan.limits.invoicesPerMonth === -1
      ? 'Unlimited invoices (fair use)'
      : `${plan.limits.invoicesPerMonth} invoices / month`,
  );
  rows.push(
    plan.limits.customers === -1 ? 'Unlimited customers' : `${plan.limits.customers} customers`,
  );
  rows.push(
    plan.limits.teamMembers === -1
      ? 'Unlimited team members'
      : `${plan.limits.teamMembers} team member${plan.limits.teamMembers > 1 ? 's' : ''}`,
  );
  if (plan.limits.onlinePayments) rows.push('Online payments (Paystack/Flutterwave)');
  if (plan.limits.emailDelivery) rows.push('Email delivery');
  if (plan.limits.paymentReminders) rows.push('Automatic payment reminders');
  if (plan.limits.recurringInvoices) rows.push('Recurring invoices');
  if (plan.limits.customNumbering) rows.push('Custom invoice numbering');
  if (plan.limits.expenses) rows.push('Expense tracking');
  if (plan.limits.dataExports) rows.push('Data exports');
  if (plan.limits.whiteLabel) rows.push('White-label documents');
  if (plan.limits.prioritySupport) rows.push('Priority support');
  rows.push(
    plan.limits.reports === 'advanced'
      ? 'Advanced reports'
      : plan.limits.reports === 'basic'
        ? 'Basic reports'
        : 'No reports',
  );
  return rows;
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Simple, transparent pricing
        </h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-xl">
          Start free. Upgrade when you need more invoices, team members, or online payments.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Object.values(PLANS).map((plan) => (
          <Card key={plan.code} className="flex flex-col p-6">
            <h2 className="font-semibold">{plan.name}</h2>
            <p className="mt-2 text-3xl font-semibold">
              ${(plan.monthlyPriceMinorUnits / 100).toFixed(0)}
              <span className="text-muted-foreground text-sm font-normal">/mo</span>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              or ${(plan.yearlyPriceMinorUnits / 100).toFixed(0)}/year
            </p>
            <p className="text-muted-foreground mt-3 text-sm">{plan.description}</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {featureRows(plan).map((row) => (
                <li key={row} className="flex items-start gap-2 text-sm">
                  <Check className="text-success mt-0.5 size-4 shrink-0" />
                  <span>{row}</span>
                </li>
              ))}
            </ul>
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

      <p className="text-muted-foreground mt-10 text-center text-xs">
        Prices shown are indicative and may change. &quot;Unlimited&quot; plans are subject to a
        fair-use ceiling to prevent abuse. Payment processing fees from Paystack/Flutterwave apply
        separately on online payments you collect.
      </p>
    </div>
  );
}
