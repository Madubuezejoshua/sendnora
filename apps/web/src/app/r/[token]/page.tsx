import { notFound } from 'next/navigation';
import { Download, ShieldCheck } from 'lucide-react';
import { getCurrency, BRAND } from '@invoicetap/shared';
import { Card } from '@invoicetap/ui';
import { publicApiFetch } from '@/lib/public-api';

interface PublicReceipt {
  id: string;
  number: string;
  status: string;
  currency: string;
  amountMinorUnits: number;
  paymentMethod: string;
  paidAt: string;
  publicToken: string;
  invoice: { number: string; customer: { name: string } };
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

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await publicApiFetch<{ data: PublicReceipt }>(`/public/receipts/${token}`);
  if (!result) notFound();
  const receipt = result.data;
  const businessName = receipt.workspace.businessProfile?.displayName ?? receipt.workspace.name;

  return (
    <div className="bg-muted/30 min-h-screen px-4 py-10">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="text-muted-foreground text-center text-sm">
          Powered by {BRAND.productName}
        </div>
        <Card className="p-6 sm:p-8">
          <div className="text-success flex items-center justify-center gap-2">
            <ShieldCheck className="size-6" />
            <span className="font-semibold">
              {receipt.status === 'ISSUED' ? 'Verified receipt' : 'Void receipt'}
            </span>
          </div>
          <div className="border-border mt-6 border-b pb-6 text-center">
            <p className="text-muted-foreground text-sm">Receipt {receipt.number}</p>
            <p className="mt-1 text-3xl font-semibold">
              {formatMoney(receipt.amountMinorUnits, receipt.currency)}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Paid via {receipt.paymentMethod.replace('_', ' ')} on{' '}
              {new Date(receipt.paidAt).toLocaleDateString()}
            </p>
          </div>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid to</span>
              <span className="font-medium">{businessName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid by</span>
              <span className="font-medium">{receipt.invoice.customer.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice</span>
              <span className="font-medium">{receipt.invoice.number}</span>
            </div>
          </div>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL}/api/v1/public/receipts/${receipt.publicToken}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="border-input hover:bg-accent mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border text-sm font-medium"
          >
            <Download className="size-4" /> Download PDF
          </a>
        </Card>
      </div>
    </div>
  );
}
