'use client';

import * as React from 'react';
import { Button, toast } from '@invoicetap/ui';

export function PayButton({
  token,
  provider,
}: {
  token: string;
  provider: 'PAYSTACK' | 'FLUTTERWAVE';
}) {
  const [loading, setLoading] = React.useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/public/invoices/${token}/pay`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Payment could not be started');
      window.location.href = body.data.authorizationUrl;
    } catch (err) {
      toast.error('Could not start payment', err instanceof Error ? err.message : undefined);
      setLoading(false);
    }
  };

  return (
    <Button onClick={handlePay} isLoading={loading} className="w-full">
      Pay with {provider === 'PAYSTACK' ? 'Paystack' : 'Flutterwave'}
    </Button>
  );
}
