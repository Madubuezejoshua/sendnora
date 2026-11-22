import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert, CreditCard } from 'lucide-react';
import { apiRequest, formatMoney, formatTimestamp } from '../lib/api';

interface ActivationData {
  billingRequired: boolean;
  activationPriceMinor: number;
  activationCurrency: string;
  gatewayMode: 'TEST' | 'LIVE';
  liveAllowed: boolean;
  entitlement: {
    source: string;
    grantedAt: string;
    note?: string;
    revokedAt?: string;
    revokedReason?: string;
  } | null;
  payments: {
    id: string;
    reference: string;
    amountMinor: number;
    currency: string;
    status: string;
    livemode: boolean;
    createdAt: string;
  }[];
}

export function ActivationView() {
  const [data, setData] = useState<ActivationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

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
      { method: 'POST' },
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
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F4F7F4]">
          Live activation
        </h1>
        <p className="mt-1 text-sm text-[#9AA69D]">
          Authoritative server-checked entitlement for issuing live API keys and dispatching
          production messages.
        </p>
      </div>

      {loading || !data ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-8">
          <div className="h-6 w-48 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-4 h-20 animate-pulse rounded bg-white/[0.04]" />
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[#7E8C81]">Live sending gate</p>
                <div className="mt-1.5 flex items-center gap-2">
                  {data.liveAllowed ? (
                    <CheckCircle2 className="h-5 w-5 text-[#22C55E]" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-amber-400" />
                  )}
                  <h2 className="font-display text-lg font-semibold text-[#F4F7F4]">
                    {data.liveAllowed ? 'Live sending enabled' : 'Annual activation required'}
                  </h2>
                </div>
                <p className="mt-2 text-sm text-[#9AA69D]">
                  {!data.billingRequired
                    ? 'Platform billing is currently OFF. All verified businesses can create and use live keys without an activation fee.'
                    : data.liveAllowed
                      ? `Active via ${data.entitlement?.source.toLowerCase()} entitlement (${data.entitlement?.note || 'verified'}).`
                      : `Annual live plan activation is ${formatMoney(
                          data.activationPriceMinor,
                          data.activationCurrency,
                        )} / year. Sandbox remains free forever.`}
                </p>
              </div>

              {data.billingRequired && !data.liveAllowed && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCheckout}
                  className="inline-flex items-center gap-2 rounded-full bg-[#22C55E] px-5 py-2.5 text-xs font-semibold text-[#050705] hover:bg-[#16A34A] disabled:opacity-60 whitespace-nowrap"
                >
                  <CreditCard className="h-4 w-4" />
                  {busy
                    ? 'Verifying...'
                    : `Pay ${formatMoney(data.activationPriceMinor, data.activationCurrency)}`}
                </button>
              )}
            </div>

            {message && (
              <div
                className={`mt-5 rounded-lg border px-4 py-3 text-xs ${
                  message.ok
                    ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#B6F4CA]'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="mt-6 border-t border-white/[0.07] pt-4 text-xs text-[#7E8C81] flex flex-wrap gap-6">
              <span>
                Gateway mode: <strong className="font-mono text-[#F4F7F4]">{data.gatewayMode}</strong>
              </span>
              <span>
                Invariant: <strong className="text-[#D4DFD7]">Test-mode payments never unlock live keys</strong>
              </span>
            </div>
          </div>

          {data.payments.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F0C]">
              <div className="border-b border-white/[0.07] px-6 py-4">
                <h3 className="font-display text-sm font-semibold text-[#F4F7F4]">
                  Activation payment history
                </h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.07] bg-[#080B09] text-[#849287]">
                    <th className="px-6 py-2.5">Reference</th>
                    <th className="px-6 py-2.5">Mode</th>
                    <th className="px-6 py-2.5 text-right">Amount</th>
                    <th className="px-6 py-2.5 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-6 py-3 font-mono text-[#F4F7F4]">{p.reference}</td>
                      <td className="px-6 py-3 text-[#9AA69D]">
                        {p.livemode ? 'Live' : 'Test (non-unlocking)'}
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
