import { notFound } from 'next/navigation';
import { Download, MessageCircle } from 'lucide-react';
import { getCurrency, BRAND } from '@invoicetap/shared';
import { Card } from '@invoicetap/ui';
import { publicApiFetch } from '@/lib/public-api';
import { PayButton } from './pay-button';

interface PublicInvoice {
  id: string;
  number: string;
  status: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  subtotalMinorUnits: number;
  totalTaxMinorUnits: number;
  grandTotalMinorUnits: number;
  amountPaidMinorUnits: number;
  notes: string | null;
  paymentInstructions: string | null;
  publicToken: string;
  customer: { name: string; email: string | null };
  items: { id: string; description: string; quantity: string; lineTotalMinorUnits: number }[];
  workspace: { name: string; businessProfile: { displayName: string } | null };
}

function formatMoney(minorUnits: number, currency: string): string {
  const def = getCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(minorUnits / 10 ** def.minorUnitDigits);
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await publicApiFetch<{ data: PublicInvoice }>(`/public/invoices/${token}`);
  if (!result) notFound();
  const invoice = result.data;

  const outstanding = invoice.grandTotalMinorUnits - invoice.amountPaidMinorUnits;
  const businessName = invoice.workspace.businessProfile?.displayName ?? invoice.workspace.name;
  const canPay = outstanding > 0 && !['DRAFT', 'VOID', 'CANCELLED'].includes(invoice.status);

  return (
    <div className="bg-muted/30 min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="text-muted-foreground text-center text-sm">
          Powered by {BRAND.productName}
        </div>

        <Card className="p-6 sm:p-8">
          <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b pb-6">
            <div>
              <p className="text-muted-foreground text-sm">Invoice from</p>
              <h1 className="text-xl font-semibold">{businessName}</h1>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-sm">{invoice.number}</p>
              <p className="mt-1 text-2xl font-semibold">
                {formatMoney(invoice.grandTotalMinorUnits, invoice.currency)}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Billed to</p>
              <p className="font-medium">{invoice.customer.name}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-muted-foreground">Due date</p>
              <p className="font-medium">{new Date(invoice.dueDate).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="divide-border border-border mt-6 divide-y border-y">
            {invoice.items.map((item) => (
              <div key={item.id} className="flex justify-between py-3 text-sm">
                <span>
                  {item.description}{' '}
                  <span className="text-muted-foreground">× {item.quantity}</span>
                </span>
                <span>{formatMoney(item.lineTotalMinorUnits, invoice.currency)}</span>
              </div>
            ))}
          </div>

          <div className="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-sm">
            <div className="text-muted-foreground flex justify-between">
              <span>Subtotal</span>
              <span>{formatMoney(invoice.subtotalMinorUnits, invoice.currency)}</span>
            </div>
            <div className="text-muted-foreground flex justify-between">
              <span>Tax</span>
              <span>{formatMoney(invoice.totalTaxMinorUnits, invoice.currency)}</span>
            </div>
            <div className="border-border flex justify-between border-t pt-1.5 font-semibold">
              <span>Total</span>
              <span>{formatMoney(invoice.grandTotalMinorUnits, invoice.currency)}</span>
            </div>
            {invoice.amountPaidMinorUnits > 0 && (
              <div className="text-success flex justify-between">
                <span>Paid</span>
                <span>{formatMoney(invoice.amountPaidMinorUnits, invoice.currency)}</span>
              </div>
            )}
          </div>

          {invoice.paymentInstructions && (
            <div className="bg-muted/50 mt-6 rounded-md p-4 text-sm">
              <p className="font-medium">Payment instructions</p>
              <p className="text-muted-foreground mt-1">{invoice.paymentInstructions}</p>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/api/v1/public/invoices/${invoice.publicToken}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="border-input hover:bg-accent inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border text-sm font-medium"
            >
              <Download className="size-4" /> Download PDF
            </a>
            {canPay && (
              <>
                <PayButton token={invoice.publicToken} provider="PAYSTACK" />
                <PayButton token={invoice.publicToken} provider="FLUTTERWAVE" />
              </>
            )}
          </div>
        </Card>

        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-center text-xs">
          <MessageCircle className="size-3.5" /> Ask {businessName} to resend this link via WhatsApp
          if it expires.
        </p>
      </div>
    </div>
  );
}
