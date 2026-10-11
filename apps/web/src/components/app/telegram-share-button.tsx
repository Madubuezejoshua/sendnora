'use client';

import * as React from 'react';
import { Send } from 'lucide-react';
import { Button, toast } from '@invoicetap/ui';
import { apiBrowserFetch } from '@/lib/api-browser';

type SendResult =
  | { sent: true }
  | { sent: false; reason: 'not_configured' | 'send_failed' }
  | { sent: false; reason: 'not_linked'; linkUrl: string };

/**
 * Sends the invoice to the customer's Telegram chat. Bots can't message first, so when the
 * customer hasn't linked yet we hand the user the one-time link to share with them.
 */
export function TelegramShareButton({
  invoiceId,
  className,
}: {
  invoiceId: string;
  className?: string;
}) {
  const [busy, setBusy] = React.useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      const { data } = await apiBrowserFetch<{ data: SendResult }>(
        `/invoices/${invoiceId}/send-telegram`,
        { method: 'POST' },
      );
      if (data.sent) {
        toast.success('Sent via Telegram');
      } else if (data.reason === 'not_linked') {
        await navigator.clipboard?.writeText(data.linkUrl).catch(() => undefined);
        toast.error(
          'Customer has not connected Telegram yet',
          `Link copied — send it to them: ${data.linkUrl}`,
        );
      } else if (data.reason === 'not_configured') {
        toast.error('Telegram is not set up', 'Ask an admin to configure the Telegram bot.');
      } else {
        toast.error('Could not send via Telegram', 'Please try again.');
      }
    } catch {
      toast.error('Could not send via Telegram', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="outline" onClick={handleClick} disabled={busy} className={className}>
      <Send className="size-4" /> Send via Telegram
    </Button>
  );
}
