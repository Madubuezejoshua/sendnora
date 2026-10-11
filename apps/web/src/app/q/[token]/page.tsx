import { notFound } from 'next/navigation';
import { Download } from 'lucide-react';
import { getCurrency, BRAND } from '@sendnaro/shared';
import { Card } from '@sendnaro/ui';
import { publicApiFetch } from '@/lib/public-api';
import { RespondButtons } from './respond-buttons';

interface PublicQuote {
  id: string;
  number: string;
  status: string;
  currency: string;
  grandTotalMinorUnits: number;
  publicToken: string;
  customer: { name: string };
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

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await publicApiFetch<{ data: PublicQuote }>(`/public/quotes/${token}`);
  if (!result) notFound();
  const quote = result.data;
  const businessName = quote.workspace.businessProfile?.displayName ?? quote.workspace.name;
  const canRespond = ['SENT', 'VIEWED'].includes(quote.status);

  return (
    <div className="bg-muted/30 min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="text-muted-foreground text-center text-sm">
          Powered by {BRAND.productName}
        </div>
        <Card className="p-6 sm:p-8">
          <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b pb-6">
            <div>
              <p className="text-muted-foreground text-sm">Quote from</p>
              <h1 className="text-xl font-semibold">{businessName}</h1>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-sm">{quote.number}</p>
              <p className="mt-1 text-2xl font-semibold">
                {formatMoney(quote.grandTotalMinorUnits, quote.currency)}
              </p>
            </div>
          </div>

          <div className="divide-border border-border mt-6 divide-y border-y">
            {quote.items.map((item) => (
              <div key={item.id} className="flex justify-between py-3 text-sm">
                <span>
                  {item.description}{' '}
                  <span className="text-muted-foreground">× {item.quantity}</span>
                </span>
                <span>{formatMoney(item.lineTotalMinorUnits, quote.currency)}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/api/v1/public/quotes/${quote.publicToken}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="border-input hover:bg-accent inline-flex h-10 items-center justify-center gap-2 rounded-md border text-sm font-medium"
            >
              <Download className="size-4" /> Download PDF
            </a>
            {canRespond && <RespondButtons token={quote.publicToken} />}
          </div>
        </Card>
      </div>
    </div>
  );
}
