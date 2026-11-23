import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert, CreditCard } from 'lucide-react';
import { apiRequest, formatMoney, formatTimestamp } from '../lib/api';
import { BillingDurationSelector } from './BillingDurationSelector';
import {
  PLANS,
  calculatePlanQuote,
  formatMajorPrice,
  type BillingPreset,
  type PlanId,
} from '../lib/pricing';

interface ActivationData {
  billingRequired: boolean;
  activationPriceMinor: number;
  activationCurrency: string;
  liveAllowed: boolean;
  entitlement: {
    source: string;
    grantedAt: string;
    revokedAt?: string;
  } | null;
  payments: {
    id: string;
    reference: string;
    amountMinor: number;
    currency: string;
    status: string;
    createdAt: string;
  }[];
}

export function ActivationView() {
  const [data, setData] = useState<ActivationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>('growth');
  const [billingPreset, setBillingPreset] = useState<BillingPreset>('12');
  const [billingMonths, setBillingMonths] = useState<number>(12);

  const selectedPlan = PLANS.find((p) => p.id === selectedPlanId) ?? PLANS[1]!;
  const quote = calculatePlanQuote(selectedPlan, billingMonths);

  const load = async () => {
    setLoading(true);
    const res = await apiRequest<ActivationData>('/api/console/activation');
    if (res.ok && res.data) setData(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCheckout = async () => {
    setBusy(true);
    setMessage(null);
    const res = await apiRequest<{ entitlementGranted: boolean; note?: string }>(
      '/api/console/activation/checkout',
      {
        method: 'POST',
        body: {
          planId: selectedPlan.id,
          durationMonths: quote.months,
        },
      },
    );
    setBusy(false);
    if (res.ok && res.data) {
      setMessage({
        ok: res.data.entitlementGranted,
        text:
          res.data.note ||
          (res.data.entitlementGranted
            ? 'Live production sending has been unlocked for this business.'
            : 'Checkout recorded.'),
      });
      load();
    } else {
      setMessage({ ok: false, text: res.error?.message || 'Activation request failed' });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F4F7F4]">
          Live activation &amp; billing
        </h1>
        <p className="mt-1 text-sm text-[#9AA69D]">
          Choose a flexible monthly duration (1, 2, 3, or custom months) or save up to 33% on an
          annual plan to unlock live API sending.
        </p>
      </div>

      {loading || !data ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-8">
          <div className="h-6 w-48 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-4 h-20 animate-pulse rounded bg-white/[0.04]" />
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[#7E8C81]">Account status</p>
                <div className="mt-1.5 flex items-center gap-2">
                  {data.liveAllowed ? (
                    <CheckCircle2 className="h-5 w-5 text-[#22C55E]" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-amber-400" />
                  )}
                  <h2 className="font-display text-lg font-semibold text-[#F4F7F4]">
                    {data.liveAllowed ? 'Live sending enabled' : 'Plan activation required'}
                  </h2>
                </div>
                <p className="mt-2 text-sm text-[#9AA69D]">
                  {!data.billingRequired
                    ? 'Live sending is active for your business account. You can create and use live API keys right away.'
                    : data.liveAllowed
                      ? 'Your production plan is active. You can create live API keys and send real customer messages.'
                      : 'Select your preferred plan and billing duration below. Sandbox testing remains free.'}
                </p>
              </div>
            </div>

            {data.billingRequired && !data.liveAllowed && (
              <div className="space-y-5 border-t border-white/[0.07] pt-5">
                {/* Plan Selector */}
                <div>
                  <p className="text-xs font-medium text-[#A8B3AA] mb-2.5">1. Select plan</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {PLANS.map((plan) => {
                      const planQuote = calculatePlanQuote(plan, billingMonths);
                      const active = plan.id === selectedPlan.id;
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setSelectedPlanId(plan.id)}
                          className={`rounded-xl border p-4 text-left transition-colors ${
                            active
                              ? 'border-[#22C55E]/60 bg-[#22C55E]/10'
                              : 'border-white/[0.08] bg-[#070A08] hover:border-white/20'
                          }`}
                        >
                          <p className="text-xs font-semibold text-[#F4F7F4]">{plan.name}</p>
                          <p className="mt-1 font-display text-xl font-bold text-[#F4F7F4] tabular-nums">
                            {formatMajorPrice(planQuote.totalMajor, planQuote.currency)}
                            <span className="ml-1 text-[11px] font-normal text-[#8B988E]">
                              {planQuote.periodLabel}
                            </span>
                          </p>
                          <p className="mt-1.5 text-[11px] font-medium text-[#4ADE80]">
                            {planQuote.quotaLabel}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#7E8C81]">{plan.regionLabel}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Duration Selector */}
                <div>
                  <p className="text-xs font-medium text-[#A8B3AA] mb-2.5">
                    2. Choose duration (longer terms reduce your monthly cost)
                  </p>
                  <BillingDurationSelector
                    preset={billingPreset}
                    months={billingMonths}
                    onSelectPreset={(nextPreset, nextMonths) => {
                      setBillingPreset(nextPreset);
                      setBillingMonths(nextMonths);
                    }}
                    onChangeCustomMonths={(nextMonths) => {
                      setBillingPreset('custom');
                      setBillingMonths(nextMonths);
                    }}
                  />
                </div>

                {/* Checkout Summary Strip */}
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#070A08] p-4">
                  <div>
                    <p className="text-xs text-[#8B988E]">
                      {selectedPlan.name} · {quote.months}{' '}
                      {quote.months === 1 ? 'month' : 'months'} ·{' '}
                      <span className="text-[#C2CEC5]">{quote.quotaLabel}</span>
                    </p>
                    <div className="mt-1 flex items-baseline gap-2.5">
                      <span className="font-display text-2xl font-bold text-[#F4F7F4] tabular-nums">
                        {formatMajorPrice(quote.totalMajor, quote.currency)}
                      </span>
                      {quote.savingsMajor > 0 && (
                        <span className="font-mono text-xs text-[#4ADE80] tabular-nums">
                          Save {formatMajorPrice(quote.savingsMajor, quote.currency)} (
                          {quote.savingsPct}% off monthly)
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleCheckout}
                    className="inline-flex items-center gap-2 rounded-full bg-[#22C55E] px-6 py-2.5 text-xs font-semibold text-[#050705] hover:bg-[#16A34A] disabled:opacity-60 whitespace-nowrap"
                  >
                    <CreditCard className="h-4 w-4" />
                    {busy
                      ? 'Processing...'
                      : `Pay ${formatMajorPrice(quote.totalMajor, quote.currency)}`}
                  </button>
                </div>
              </div>
            )}

            {message && (
              <div
                className={`rounded-lg border px-4 py-3 text-xs ${
                  message.ok
                    ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#B6F4CA]'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                }`}
              >
                {message.text}
              </div>
            )}
          </div>

          {data.payments.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F0C]">
              <div className="border-b border-white/[0.07] px-6 py-4">
                <h3 className="font-display text-sm font-semibold text-[#F4F7F4]">
                  Billing history
                </h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.07] bg-[#080B09] text-[#849287]">
                    <th className="px-6 py-2.5">Reference</th>
                    <th className="px-6 py-2.5">Status</th>
                    <th className="px-6 py-2.5 text-right">Amount</th>
                    <th className="px-6 py-2.5 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-6 py-3 font-mono text-[#F4F7F4]">{p.reference}</td>
                      <td className="px-6 py-3 text-[#9AA69D] capitalize">
                        {p.status.toLowerCase()}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-[#F4F7F4] tabular-nums">
                        {formatMoney(p.amountMinor, p.currency)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-[#7E8C81] tabular-nums">
                        {formatTimestamp(p.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
