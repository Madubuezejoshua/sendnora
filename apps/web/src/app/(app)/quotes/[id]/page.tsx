'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Download, Send, FileCheck, ExternalLink } from 'lucide-react';
import { getCurrency } from '@invoicetap/shared';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
  StatusBadge,
  toast,
} from '@invoicetap/ui';
import { useConvertQuote, useQuote, useSendQuote } from '@/hooks/use-quotes';
import { WhatsAppShareButton } from '@/components/app/whatsapp-share-button';

function formatMoney(minorUnits: number, currency: string): string {
  const def = getCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(minorUnits / 10 ** def.minorUnitDigits);
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: quote, isLoading } = useQuote(id);
  const sendQuote = useSendQuote(id);
  const convertQuote = useConvertQuote(id);

  if (isLoading || !quote) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const publicUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/q/${quote.publicToken}` : '';

  return (
    <div className="space-y-6">
      <PageHeader
        title={quote.number}
        description={quote.customer.name}
        actions={
          <>
            <StatusBadge status={quote.status} />
            <Button variant="outline" asChild>
              <a href={`/api/proxy/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer">
                <Download className="size-4" /> PDF
              </a>
            </Button>
            {quote.status === 'DRAFT' && (
              <Button
                isLoading={sendQuote.isPending}
                onClick={() =>
                  sendQuote.mutate(undefined, {
                    onSuccess: () => toast.success('Quote sent'),
                    onError: () => toast.error('Could not send quote'),
                  })
                }
              >
                <Send className="size-4" /> Mark as sent
              </Button>
            )}
            {quote.status === 'ACCEPTED' && (
              <Button
                isLoading={convertQuote.isPending}
                onClick={() =>
                  convertQuote.mutate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), {
                    onSuccess: (result) => {
                      toast.success('Converted to invoice');
                      router.push(`/invoices/${result.data.id}`);
                    },
                    onError: () => toast.error('Could not convert quote'),
                  })
                }
              >
                <FileCheck className="size-4" /> Convert to invoice
              </Button>
            )}
          </>
        }
      />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-sm">
          <ExternalLink className="text-muted-foreground size-4" />
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            View public quote page
          </a>
        </div>
        <WhatsAppShareButton
          phone={quote.customer.whatsappPhone}
          message={`Hi ${quote.customer.name}, here's your quote ${quote.number} for ${formatMoney(quote.grandTotalMinorUnits, quote.currency)}. Review it here: ${publicUrl}`}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-border divide-y">
            {quote.items.map((item) => (
              <div key={item.id} className="flex justify-between py-2 text-sm">
                <span>
                  {item.description}{' '}
                  <span className="text-muted-foreground">× {item.quantity}</span>
                </span>
                <span>{formatMoney(item.lineTotalMinorUnits, quote.currency)}</span>
              </div>
            ))}
          </div>
          <div className="border-border mt-4 flex justify-between border-t pt-3 font-semibold">
            <span>Total</span>
            <span>{formatMoney(quote.grandTotalMinorUnits, quote.currency)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
