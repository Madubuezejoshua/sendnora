'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrency } from '@sendnaro/shared';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ErrorState, PageHeader, Skeleton, toast } from '@sendnaro/ui';
import { apiBrowserFetch, ApiClientError } from '@/lib/api-browser';

interface State {
  billingRequired: boolean;
  entitled: boolean;
  entitlementSource: 'PAYMENT' | 'COMPLIMENTARY' | null;
  price: { amountMinor: number; currency: string } | null;
  hasPendingPayment: boolean;
  state: 'free_access' | 'active' | 'activation_required';
}

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 10 ** getCurrency(currency).minorUnitDigits);
  } catch {
    return `${currency} ${minor}`;
  }
}

export default function ActivationPage() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['activation'], queryFn: () => apiBrowserFetch<{ data: State }>('/activation') });

  // Returning from checkout: the URL proves nothing. Ask the server, which asks the gateway.
  const verify = useMutation({
    mutationFn: (ref: string) => apiBrowserFetch<{ data: { result: string } }>('/activation/verify', { method: 'POST', body: JSON.stringify({ reference: ref }) }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['activation'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
      if (r.data.result === 'granted' || r.data.result === 'already_processed') toast.success('Activation confirmed');
      else if (r.data.result === 'pending') toast.error('Payment not confirmed yet', 'It can take a minute. Refresh this page shortly.');
      else toast.error('We could not confirm that payment');
    },
  });
  const verified = React.useRef(false);
  React.useEffect(() => {
    if (reference && !verified.current) {
      verified.current = true;
      verify.mutate(reference);
    }
  }, [reference, verify]);

  const checkout = useMutation({
    mutationFn: () => apiBrowserFetch<{ data: { checkoutUrl: string } }>('/activation/checkout', { method: 'POST' }),
    onSuccess: (r) => { window.location.href = r.data.checkoutUrl; },
    onError: (e) => toast.error('Could not start checkout', e instanceof ApiClientError ? e.message : 'Please try again.'),
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (isError || !data) return <ErrorState title="Could not load activation" onRetry={() => refetch()} />;
  const s = data.data;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Activation" description="Sendnaro access for live sending." />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Status{' '}
            <Badge variant={s.state === 'activation_required' ? 'warning' : 'success'}>
              {s.state === 'free_access' ? 'free access' : s.state === 'active' ? 'activated' : 'activation required'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {s.state === 'free_access' && (
            <>
              <p>Live sending is currently available without a Sendnaro activation payment. The sandbox is always free.</p>
              <p className="text-muted-foreground">Provider costs still apply: Meta may charge your WhatsApp Business account for messages. No checkout is available while activation is not required.</p>
            </>
          )}
          {s.state === 'active' && (
            <p>This business is activated{s.entitlementSource === 'COMPLIMENTARY' ? ' (complimentary access granted by Sendnaro)' : ' with a verified one-time payment'}. It is a licence, not a subscription, and does not include provider charges.</p>
          )}
          {s.state === 'activation_required' && (
            <>
              <p>
                Live sending needs a one-time activation{s.price ? ` of ${money(s.price.amountMinor, s.price.currency)}` : ''}. Sandbox keys keep working for free. Until you activate, live requests return{' '}
                <code>activation_required</code>.
              </p>
              <Button onClick={() => checkout.mutate()} disabled={checkout.isPending || !s.price}>Pay and activate</Button>
              <p className="text-muted-foreground text-xs">Access is granted only after the payment is verified with the payment provider, not by returning to this page.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
