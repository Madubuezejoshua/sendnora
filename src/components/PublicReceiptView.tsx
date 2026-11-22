import { useEffect, useState } from 'react';
import { ArrowLeft, Download, CheckCircle2 } from 'lucide-react';
import { apiRequest, formatMoney, formatTimestamp } from '../lib/api';
import { BrandMark } from './BrandMark';

interface ReceiptData {
  invoiceNumber: string;
  reference: string;
  businessName: string;
  businessEmail?: string;
  customerName: string;
  currency: string;
  items: { description: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }[];
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  status: string;
  notes?: string;
  createdAt: string;
  environment: string;
}

export function PublicReceiptView({
  token,
  onBack,
}: {
  token: string;
  onBack: () => void;
}) {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<ReceiptData>(`/api/public/invoices/${encodeURIComponent(token)}`).then((res) => {
      if (!active) return;
      if (res.ok && res.data) {
        setReceipt(res.data);
        setError(null);
      } else {
        setError(res.error?.message || 'Receipt not found');
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#050705] px-6 py-10 text-[#F4F7F4]">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <BrandMark light />
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#9AA69D] transition-colors hover:text-[#F4F7F4] whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-8">
            <div className="h-5 w-40 animate-pulse rounded bg-white/[0.06]" />
            <div className="mt-4 h-24 animate-pulse rounded bg-white/[0.04]" />
          </div>
        ) : error || !receipt ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-8 text-center">
            <h1 className="font-display text-lg font-semibold text-[#F4F7F4]">Receipt unavailable</h1>
            <p className="mt-2 text-sm text-[#9AA69D]">{error || 'This receipt link is invalid or expired.'}</p>
          </div>
        ) : (
          <article className="overflow-hidden rounded-2xl border border-white/12 bg-[#0B0F0C]">
            <div className="border-b border-white/[0.08] px-8 py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-[#7E8C81]">
                    {receipt.environment === 'sandbox' ? 'Sandbox Receipt' : 'Verified Payment Receipt'} · {receipt.reference}
                  </p>
                  <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#F4F7F4]">
                    {receipt.businessName}
                  </h1>
                  {receipt.businessEmail && (
                    <p className="mt-0.5 text-sm text-[#849287]">{receipt.businessEmail}</p>
                  )}
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4ADE80]">
                    <CheckCircle2 className="h-4 w-4" />
                    {receipt.status}
                  </div>
                  <p className="mt-1 font-mono text-sm font-medium text-[#F4F7F4] tabular-nums">
                    {receipt.invoiceNumber}
                  </p>
                  <p className="mt-0.5 text-xs text-[#7E8C81] tabular-nums">
                    {formatTimestamp(receipt.createdAt)}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6">
              <div className="mb-6 text-sm">
                <span className="text-[#7E8C81]">Billed to</span>
                <p className="mt-0.5 font-medium text-[#F4F7F4]">{receipt.customerName}</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs font-medium text-[#849287]">
                      <th className="pb-2.5">Item</th>
                      <th className="pb-2.5 text-right">Qty</th>
                      <th className="pb-2.5 text-right">Unit price</th>
                      <th className="pb-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {receipt.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-3 text-[#F4F7F4]">{item.description}</td>
                        <td className="py-3 text-right font-mono text-[#9AA69D] tabular-nums">{item.quantity}</td>
                        <td className="py-3 text-right font-mono text-[#9AA69D] tabular-nums">
                          {formatMoney(item.unitPriceMinor, receipt.currency)}
                        </td>
                        <td className="py-3 text-right font-mono font-medium text-[#F4F7F4] tabular-nums">
                          {formatMoney(item.lineTotalMinor, receipt.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 border-t border-white/[0.08] pt-4">
                <dl className="ml-auto max-w-xs space-y-2 text-sm">
                  <div className="flex justify-between text-[#9AA69D]">
                    <dt>Subtotal</dt>
                    <dd className="font-mono tabular-nums">{formatMoney(receipt.subtotalMinor, receipt.currency)}</dd>
                  </div>
                  {receipt.discountMinor > 0 && (
                    <div className="flex justify-between text-[#9AA69D]">
                      <dt>Discount</dt>
                      <dd className="font-mono tabular-nums">-{formatMoney(receipt.discountMinor, receipt.currency)}</dd>
                    </div>
                  )}
                  {receipt.taxMinor > 0 && (
                    <div className="flex justify-between text-[#9AA69D]">
                      <dt>Tax</dt>
                      <dd className="font-mono tabular-nums">{formatMoney(receipt.taxMinor, receipt.currency)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-white/[0.08] pt-2.5 text-base font-semibold text-[#F4F7F4]">
                    <dt>Total paid</dt>
                    <dd className="font-mono text-[#4ADE80] tabular-nums">{formatMoney(receipt.totalMinor, receipt.currency)}</dd>
                  </div>
                </dl>
              </div>

              {receipt.notes && (
                <p className="mt-6 border-t border-white/[0.06] pt-4 text-xs text-[#7E8C81]">
                  {receipt.notes}
                </p>
              )}

              <div className="mt-8 flex items-center justify-between border-t border-white/[0.08] pt-5">
                <p className="text-xs text-[#7E8C81]">Token-scoped receipt · Safe sanitized download</p>
                <a
                  href={`/api/public/invoices/${encodeURIComponent(token)}/download`}
                  className="inline-flex items-center gap-2 rounded-full bg-[#22C55E] px-5 py-2 text-xs font-semibold text-[#050705] transition-colors hover:bg-[#16A34A] whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download receipt
                </a>
              </div>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
