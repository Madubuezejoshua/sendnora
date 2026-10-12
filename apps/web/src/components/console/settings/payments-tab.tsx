'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  ErrorState,
  FormField,
  Input,
  Skeleton,
  toast,
} from '@sendnaro/ui';
import { apiBrowserFetch, ApiClientError } from '@/lib/api-browser';

interface Source {
  id: string;
  environment: string;
  webhook_url: string;
}

/** Pattern B: a verified Paystack purchase event in the merchant's account becomes a receipt, unattended. */
export function PaymentsTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payment-sources'],
    queryFn: () => apiBrowserFetch<{ data: Source[] }>('/payment-sources'),
  });
  const [environment, setEnvironment] = React.useState<'sandbox' | 'live'>('sandbox');
  const [key, setKey] = React.useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['payment-sources'] });
  const fail = (e: unknown) =>
    toast.error('That did not work', e instanceof ApiClientError ? e.message : 'Please try again.');

  const save = useMutation({
    mutationFn: () =>
      apiBrowserFetch('/payment-sources', {
        method: 'PUT',
        body: JSON.stringify({ environment, paystack_secret_key: key }),
      }),
    onSuccess: () => {
      setKey('');
      toast.success('Saved', 'Paste the webhook URL below into your Paystack dashboard.');
      refresh();
    },
    onError: fail,
  });
  const del = useMutation({
    mutationFn: (id: string) => apiBrowserFetch(`/payment-sources/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: fail,
  });

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground max-w-xl text-sm">
        Already taking payments with Paystack? Add your Paystack secret key and Sendnaro sends the
        receipt for every successful payment automatically. Your key is stored encrypted and never
        shown again. Include <code>metadata.sendnaro</code> (phone, consent, name) on each
        transaction; see the API guide.
      </p>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Environment</legend>
            <div className="flex gap-4 text-sm">
              {(['sandbox', 'live'] as const).map((e) => (
                <label key={e} className="flex items-center gap-2 capitalize">
                  <input
                    type="radio"
                    name="ps-env"
                    checked={environment === e}
                    onChange={() => setEnvironment(e)}
                  />{' '}
                  {e}
                </label>
              ))}
            </div>
          </fieldset>
          <FormField label="Paystack secret key" htmlFor="ps-key" required>
            <Input
              id="ps-key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk_test_..."
            />
          </FormField>
          <Button disabled={key.length < 8 || save.isPending} onClick={() => save.mutate()}>
            Save payment source
          </Button>
        </CardContent>
      </Card>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError || !data ? (
        <ErrorState title="Could not load payment sources" onRetry={() => refetch()} />
      ) : (
        data.data.map((s) => (
          <Card key={s.id}>
            <CardContent className="space-y-2 pt-6 text-sm">
              <p className="font-medium capitalize">{s.environment} webhook URL</p>
              <code className="bg-muted block break-all rounded-md p-3 font-mono text-xs">
                {s.webhook_url}
              </code>
              <Button size="sm" variant="outline" onClick={() => del.mutate(s.id)}>
                Remove
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
