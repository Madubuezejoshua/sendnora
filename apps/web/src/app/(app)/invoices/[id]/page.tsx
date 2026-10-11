'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Download, Send, CreditCard, Ban, ExternalLink } from 'lucide-react';
import { getCurrency } from '@invoicetap/shared';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  PageHeader,
  Skeleton,
  StatusBadge,
  toast,
} from '@invoicetap/ui';
import { useInvoice, useIssueInvoice, useVoidInvoice } from '@/hooks/use-invoices';
import { RecordPaymentDialog } from '@/components/app/record-payment-dialog';
import { WhatsAppShareButton } from '@/components/app/whatsapp-share-button';
import { TelegramShareButton } from '@/components/app/telegram-share-button';

function formatMoney(minorUnits: number, currency: string): string {
  const def = getCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(minorUnits / 10 ** def.minorUnitDigits);
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isLoading } = useInvoice(id);
  const issueInvoice = useIssueInvoice();
  const voidInvoice = useVoidInvoice(id);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [voidOpen, setVoidOpen] = React.useState(false);

  if (isLoading || !invoice) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const publicUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/i/${invoice.publicToken}` : '';
  const outstanding = invoice.grandTotalMinorUnits - invoice.amountPaidMinorUnits;
  const canIssue = invoice.status === 'DRAFT';
  const canRecordPayment =
    outstanding > 0 && !['DRAFT', 'VOID', 'CANCELLED'].includes(invoice.status);
  const canVoid = !['VOID', 'CANCELLED', 'DRAFT'].includes(invoice.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={invoice.number}
        description={invoice.customer.name}
        actions={
          <>
            <StatusBadge status={invoice.status} />
            <Button variant="outline" asChild>
              <a href={`/api/proxy/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
                <Download className="size-4" /> PDF
              </a>
            </Button>
            {canIssue && (
              <Button
                isLoading={issueInvoice.isPending}
                onClick={() =>
                  issueInvoice.mutate(invoice.id, {
                    onSuccess: () => toast.success('Invoice issued'),
                    onError: () => toast.error('Could not issue invoice'),
                  })
                }
              >
                <Send className="size-4" /> Issue invoice
              </Button>
            )}
            {canRecordPayment && (
              <Button onClick={() => setPaymentOpen(true)}>
                <CreditCard className="size-4" /> Record payment
              </Button>
            )}
            {canVoid && (
              <Button variant="destructive" onClick={() => setVoidOpen(true)}>
                <Ban className="size-4" /> Void
              </Button>
            )}
          </>
        }
      />

      {!canIssue && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 text-sm">
            <ExternalLink className="text-muted-foreground size-4" />
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              View public invoice page
            </a>
          </div>
          <WhatsAppShareButton
            phone={invoice.customer.whatsappPhone}
            message={`Hi ${invoice.customer.name}, here's your invoice ${invoice.number} for ${formatMoney(invoice.grandTotalMinorUnits, invoice.currency)}. View & pay: ${publicUrl}`}
          />
          <TelegramShareButton invoiceId={invoice.id} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Line items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-muted-foreground text-left text-xs uppercase">
                  <tr>
                    <th className="pb-2">Description</th>
                    <th className="pb-2">Qty</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2">{item.description}</td>
                      <td className="py-2">{item.quantity}</td>
                      <td className="py-2 text-right">
                        {formatMoney(item.lineTotalMinorUnits, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatMoney(invoice.subtotalMinorUnits, invoice.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatMoney(invoice.totalTaxMinorUnits, invoice.currency)}</span>
            </div>
            <div className="border-border flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span>{formatMoney(invoice.grandTotalMinorUnits, invoice.currency)}</span>
            </div>
            <div className="text-success flex justify-between">
              <span>Paid</span>
              <span>{formatMoney(invoice.amountPaidMinorUnits, invoice.currency)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Balance due</span>
              <span>{formatMoney(outstanding, invoice.currency)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        invoiceId={invoice.id}
        currency={invoice.currency}
        outstandingMinorUnits={outstanding}
      />

      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title="Void this invoice?"
        description="This cannot be undone. If the invoice has been paid, you'll need a credit note covering the paid amount first."
        confirmLabel="Void invoice"
        variant="destructive"
        isLoading={voidInvoice.isPending}
        onConfirm={() =>
          voidInvoice.mutate('Voided from the invoice detail page', {
            onSuccess: () => {
              toast.success('Invoice voided');
              setVoidOpen(false);
            },
            onError: () => toast.error('Could not void invoice'),
          })
        }
      />
    </div>
  );
}
