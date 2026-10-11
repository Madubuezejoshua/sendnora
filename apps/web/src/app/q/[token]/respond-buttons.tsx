'use client';

import * as React from 'react';
import { Button, toast } from '@sendnaro/ui';

export function RespondButtons({ token }: { token: string }) {
  const [loading, setLoading] = React.useState<'ACCEPTED' | 'REJECTED' | null>(null);
  const [done, setDone] = React.useState<'ACCEPTED' | 'REJECTED' | null>(null);

  const respond = async (decision: 'ACCEPTED' | 'REJECTED') => {
    setLoading(decision);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/public/quotes/${token}/respond`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        },
      );
      if (!res.ok) throw new Error();
      setDone(decision);
      toast.success(decision === 'ACCEPTED' ? 'Quote accepted' : 'Quote declined');
    } catch {
      toast.error('Could not submit your response. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  if (done) {
    return (
      <p className="text-success text-sm font-medium">
        You have {done === 'ACCEPTED' ? 'accepted' : 'declined'} this quote.
      </p>
    );
  }

  return (
    <div className="flex gap-3">
      <Button
        className="flex-1"
        isLoading={loading === 'ACCEPTED'}
        disabled={loading !== null}
        onClick={() => respond('ACCEPTED')}
      >
        Accept quote
      </Button>
      <Button
        variant="outline"
        className="flex-1"
        isLoading={loading === 'REJECTED'}
        disabled={loading !== null}
        onClick={() => respond('REJECTED')}
      >
        Decline
      </Button>
    </div>
  );
}
