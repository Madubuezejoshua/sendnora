'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
  toast,
} from '@invoicetap/ui';
import { apiBrowserFetch, ApiClientError } from '@/lib/api-browser';

interface SubscriptionInfo {
  subscription: { planCode: string; status: string; currentPeriodEnd: string } | null;
  plan: { name: string; description: string; limits: Record<string, unknown> };
  usage: { invoicesIssuedThisMonth: number };
}

interface PlanOption {
  code: string;
  name: string;
  monthlyPriceMinorUnits: number;
  yearlyPriceMinorUnits: number;
  currency: string;
}

export default function BillingSettingsPage() {
  const [checkingOut, setCheckingOut] = React.useState(false);
  const [selectedPlan, setSelectedPlan] = React.useState<string>('STARTER');
  const [interval, setInterval] = React.useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  const { data, isLoading } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () =>
      apiBrowserFetch<{ data: SubscriptionInfo }>('/billing/subscription').then((r) => r.data),
  });

  const { data: plans } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => apiBrowserFetch<{ data: PlanOption[] }>('/billing/plans').then((r) => r.data),
  });

  const handleCheckout = async () => {
    setCheckingOut(true);
    try {
      const result = await apiBrowserFetch<{ data: { authorizationUrl: string } }>(
        '/billing/subscription/checkout',
        {
          method: 'POST',
          body: JSON.stringify({ planCode: selectedPlan, interval }),
        },
      );
      window.location.href = result.data.authorizationUrl;
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'CONFLICT') {
        toast.error(
          'Online checkout unavailable',
          'Online plan checkout is not configured on this platform yet. Contact support to upgrade.',
        );
      } else {
        toast.error('Could not start checkout');
      }
      setCheckingOut(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Billing" />
      {isLoading && <Skeleton className="h-40 w-full" />}
      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{data.plan.name}</span>
              {data.subscription && <StatusBadge status={data.subscription.status} />}
            </div>
            <p className="text-muted-foreground">{data.plan.description}</p>
            <div className="border-border flex justify-between border-t pt-3">
              <span className="text-muted-foreground">Invoices issued this month</span>
              <span>{data.usage.invoicesIssuedThisMonth}</span>
            </div>
            {data.subscription && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current period ends</span>
                <span>{new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upgrade or change plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans
                  ?.filter((p) => p.code !== 'FREE')
                  .map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={interval} onValueChange={(v) => setInterval(v as 'MONTHLY' | 'YEARLY')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="YEARLY">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" isLoading={checkingOut} onClick={handleCheckout}>
            Continue to payment
          </Button>
          <p className="text-muted-foreground text-xs">
            Payment is processed securely by Paystack. Your subscription renews automatically each
            period until cancelled.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
