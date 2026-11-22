import { useEffect, useState } from 'react';
import { Shield, RefreshCw, Ban, CheckCircle2, Gift } from 'lucide-react';
import { apiRequest, formatMoney, formatTimestamp } from '../lib/api';

interface AdminOverviewData {
  counts: {
    users: number;
    businesses: number;
    activeKeys: number;
    totalDeliveries: number;
    deliveredCount: number;
    failedCount: number;
    deadJobs: number;
  };
  billing: {
    billingRequired: boolean;
    activationPriceMinor: number;
    activationCurrency: 'NGN' | 'USD' | 'GBP' | 'EUR';
    gatewayMode: 'TEST' | 'LIVE';
    updatedAt: string;
  };
  readiness: {
    gatewayConfigured: boolean;
    gatewayMode: string;
    priceConfigured: boolean;
  };
  revenueByCurrency: Record<string, number>;
  businesses: {
    id: string;
    name: string;
    contactEmail: string;
    currency: string;
    createdAt: string;
    suspendedAt?: string;
    suspendedReason?: string;
    entitlement: {
      source: string;
      note?: string;
      revokedAt?: string;
    } | null;
  }[];
  auditLogs: {
    id: string;
    action: string;
    actorEmail?: string;
    detail: string;
    ip: string;
    at: string;
  }[];
}

export function AdminView() {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceMajor, setPriceMajor] = useState('60000');
  const [currency, setCurrency] = useState<'NGN' | 'USD' | 'GBP' | 'EUR'>('NGN');
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await apiRequest<AdminOverviewData>('/api/admin/overview');
    if (res.ok && res.data) {
      setData(res.data);
      setPriceMajor(String(Math.round(res.data.billing.activationPriceMinor / 100)));
      setCurrency(res.data.billing.activationCurrency);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggleBilling = async (nextRequired: boolean) => {
    setFeedback(null);
    if (nextRequired && !confirmEnable) {
      setConfirmEnable(true);
      return;
    }
    const res = await apiRequest('/api/admin/billing', {
      method: 'PATCH',
      body: {
        billingRequired: nextRequired,
        activationPriceMinor: Math.max(100, Math.round(Number(priceMajor || '60000') * 100)),
        activationCurrency: currency,
        confirm: nextRequired,
      },
    });
    setConfirmEnable(false);
    if (res.ok) {
      setFeedback({
        ok: true,
        text: `Platform billing switch set to ${nextRequired ? 'ON' : 'OFF'}.`,
      });
      load();
    } else {
      setFeedback({ ok: false, text: res.error?.message || 'Unable to update billing settings' });
    }
  };

  const handleSavePrice = async () => {
    setFeedback(null);
    const res = await apiRequest('/api/admin/billing', {
      method: 'PATCH',
      body: {
        activationPriceMinor: Math.max(100, Math.round(Number(priceMajor || '60000') * 100)),
        activationCurrency: currency,
      },
    });
    if (res.ok) {
      setFeedback({ ok: true, text: 'Activation price updated.' });
      load();
    } else {
      setFeedback({ ok: false, text: res.error?.message || 'Failed to update price' });
    }
  };

  const handleSuspend = async (id: string, currentlySuspended: boolean) => {
    setFeedback(null);
    const path = currentlySuspended
      ? `/api/admin/businesses/${encodeURIComponent(id)}/unsuspend`
      : `/api/admin/businesses/${encodeURIComponent(id)}/suspend`;
    const res = await apiRequest(path, {
      method: 'POST',
      body: currentlySuspended ? undefined : { reason: 'Suspended via Platform Admin Console' },
    });
    if (res.ok) {
      setFeedback({ ok: true, text: currentlySuspended ? 'Business unsuspended.' : 'Business suspended immediately.' });
      load();
    }
  };

  const handleGrantComp = async (id: string) => {
    const note = (noteInput[id] || '').trim() || '1-week company giveaway trial';
    const res = await apiRequest(`/api/admin/entitlements/${encodeURIComponent(id)}/complimentary`, {
      method: 'POST',
      body: { note },
    });
    if (res.ok) {
      setFeedback({ ok: true, text: 'Complimentary / giveaway entitlement granted and logged.' });
      load();
    }
  };

  const handleRevokeComp = async (id: string) => {
    const res = await apiRequest(`/api/admin/entitlements/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
      body: { reason: 'Revoked by platform admin' },
    });
    if (res.ok) {
      setFeedback({ ok: true, text: 'Entitlement revoked.' });
      load();
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-52 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-44 animate-pulse rounded-2xl bg-[#0B0F0C] border border-white/[0.08]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-[#4ADE80]">
            <Shield className="h-4 w-4" />
            Platform Owner Governance
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#F4F7F4]">
            Platform Admin
          </h1>
          <p className="mt-1 text-sm text-[#9AA69D]">
            Global billing gate, 1-week company giveaways, business suspensions, and immutable audit
            history.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#0B0F0C] px-3.5 py-2 text-xs font-medium text-[#E6ECE7] hover:bg-white/[0.05]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-xs ${
            feedback.ok
              ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#B6F4CA]'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Registered businesses', data.counts.businesses],
          ['Active API keys', data.counts.activeKeys],
          ['Total deliveries', data.counts.totalDeliveries],
          ['Dead outbox jobs', data.counts.deadJobs],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-white/[0.08] bg-[#0B0F0C] p-5">
            <p className="text-xs text-[#849287]">{label}</p>
            <p className="mt-1.5 font-display text-2xl font-semibold text-[#F4F7F4] tabular-nums">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Billing Switch */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
              Activation Billing Gate
            </h2>
            <p className="mt-1 text-xs text-[#9AA69D]">
              Currently{' '}
              <strong className={data.billing.billingRequired ? 'text-amber-400' : 'text-[#4ADE80]'}>
                {data.billing.billingRequired ? 'ON (activation required for live keys)' : 'OFF (live sending open)'}
              </strong>{' '}
              · Gateway mode: <span className="font-mono text-[#F4F7F4]">{data.readiness.gatewayMode}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {confirmEnable ? (
              <>
                <button
                  type="button"
                  onClick={() => handleToggleBilling(true)}
                  className="rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-[#050705] hover:bg-amber-400"
                >
                  Confirm enable billing
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmEnable(false)}
                  className="rounded-lg border border-white/12 px-3 py-2 text-xs text-[#9AA69D] hover:text-white"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleToggleBilling(!data.billing.billingRequired)}
                className="rounded-lg bg-[#22C55E] px-4 py-2 text-xs font-semibold text-[#050705] hover:bg-[#16A34A]"
              >
                {data.billing.billingRequired ? 'Turn billing OFF' : 'Turn billing ON'}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-white/[0.07] pt-4">
          <div>
            <label className="block text-xs font-medium text-[#A8B3AA]">Activation price (major)</label>
            <input
              type="number"
              min="1"
              value={priceMajor}
              onChange={(e) => setPriceMajor(e.target.value)}
              className="mt-1 w-36 rounded-lg border border-white/12 bg-[#060807] px-3 py-1.5 font-mono text-xs text-[#F4F7F4] tabular-nums focus:border-[#22C55E] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#A8B3AA]">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'NGN' | 'USD' | 'GBP' | 'EUR')}
              className="mt-1 rounded-lg border border-white/12 bg-[#060807] px-3 py-1.5 text-xs text-[#F4F7F4] focus:border-[#22C55E] focus:outline-none"
            >
              <option value="NGN">NGN</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleSavePrice}
            className="rounded-lg border border-white/12 bg-[#070A08] px-3.5 py-1.5 text-xs font-medium text-[#E6ECE7] hover:bg-white/[0.05]"
          >
            Update price ({formatMoney(Math.round(Number(priceMajor || '0') * 100), currency)})
          </button>
        </div>
      </div>

      {/* Businesses & Giveaway Grants Table */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F0C]">
        <div className="border-b border-white/[0.07] px-6 py-4">
          <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
            Businesses, giveaways &amp; entitlements
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] bg-[#080B09] text-[#849287]">
                <th className="px-6 py-3">Business</th>
                <th className="px-6 py-3">Entitlement</th>
                <th className="px-6 py-3">Account state</th>
                <th className="px-6 py-3 text-right">Governance actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {data.businesses.map((b) => {
                const hasActiveEnt = Boolean(b.entitlement && !b.entitlement.revokedAt);
                const suspended = Boolean(b.suspendedAt);
                return (
                  <tr key={b.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-[#F4F7F4]">{b.name}</p>
                      <p className="text-[#7E8C81]">{b.contactEmail}</p>
                    </td>
                    <td className="px-6 py-3.5">
                      {hasActiveEnt ? (
                        <span className="text-[#4ADE80] font-medium">
                          {b.entitlement!.source} · {b.entitlement!.note || 'Active'}
                        </span>
                      ) : (
                        <span className="text-[#7E8C81]">None</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      {suspended ? (
                        <span className="font-medium text-red-400">Suspended</span>
                      ) : (
                        <span className="text-[#4ADE80] font-medium">Active</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        {!hasActiveEnt ? (
                          <>
                            <input
                              type="text"
                              placeholder="1-week giveaway note"
                              value={noteInput[b.id] || ''}
                              onChange={(e) =>
                                setNoteInput((prev) => ({ ...prev, [b.id]: e.target.value }))
                              }
                              className="w-36 rounded border border-white/12 bg-[#060807] px-2 py-1 text-[11px] text-[#F4F7F4] placeholder:text-[#5F6B61]"
                            />
                            <button
                              type="button"
                              onClick={() => handleGrantComp(b.id)}
                              className="inline-flex items-center gap-1 rounded border border-[#22C55E]/35 bg-[#22C55E]/10 px-2.5 py-1 font-medium text-[#4ADE80] hover:bg-[#22C55E]/20"
                            >
                              <Gift className="h-3 w-3" />
                              Grant giveaway
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRevokeComp(b.id)}
                            className="rounded border border-white/12 px-2.5 py-1 text-[#C2CEC5] hover:bg-white/[0.05]"
                          >
                            Revoke ent.
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSuspend(b.id, suspended)}
                          className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium ${
                            suspended
                              ? 'border border-[#22C55E]/40 text-[#4ADE80] hover:bg-[#22C55E]/10'
                              : 'border border-red-500/30 text-red-400 hover:bg-red-500/10'
                          }`}
                        >
                          {suspended ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" />
                              Unsuspend
                            </>
                          ) : (
                            <>
                              <Ban className="h-3 w-3" />
                              Suspend
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F0C]">
        <div className="border-b border-white/[0.07] px-6 py-4">
          <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
            Platform audit history
          </h2>
        </div>
        <div className="divide-y divide-white/[0.06] text-xs">
          {data.auditLogs.slice(0, 15).map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
              <div>
                <span className="font-mono font-medium text-[#F4F7F4]">{a.action}</span>
                <span className="ml-2 text-[#9AA69D]">{a.detail}</span>
              </div>
              <span className="font-mono text-[#7E8C81] tabular-nums">
                {formatTimestamp(a.at)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
