import { useEffect, useState } from 'react';
import { Search, RefreshCw, X } from 'lucide-react';
import { apiRequest, formatTimestamp } from '../lib/api';

interface DeliveryAttempt {
  attempt: number;
  outcome: string;
  errorCode?: string;
  message?: string;
  at: string;
}

interface DeliveryItem {
  id: string;
  kind: string;
  channel: string;
  recipient: string;
  status: string;
  simulated: boolean;
  environment: string;
  scenario?: string;
  message_preview: string;
  error?: { code: string; message?: string };
  attempts: DeliveryAttempt[];
  next_attempt_at?: string;
  created_at: string;
  sent_at?: string;
  delivered_at?: string;
  failed_at?: string;
}

function statusStyle(status: string): string {
  switch (status) {
    case 'delivered':
    case 'read':
      return 'text-[#4ADE80] font-medium';
    case 'failed':
    case 'blocked':
    case 'expired':
      return 'text-red-400 font-medium';
    case 'unconfirmed':
    case 'queued':
    case 'sent':
      return 'text-amber-400 font-medium';
    default:
      return 'text-[#9AA69D] font-medium';
  }
}

export function DeliveriesView({ refreshSignal }: { refreshSignal: number }) {
  const [rows, setRows] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [envFilter, setEnvFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<DeliveryItem | null>(null);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (envFilter !== 'all') params.set('environment', envFilter);
    if (channelFilter !== 'all') params.set('channel', channelFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (query.trim()) params.set('q', query.trim());

    const res = await apiRequest<DeliveryItem[]>(`/api/console/deliveries?${params.toString()}`);
    if (res.ok && res.data) {
      setRows(res.data);
      if (selected) {
        const updated = res.data.find((d) => d.id === selected.id);
        if (updated) setSelected(updated);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envFilter, channelFilter, statusFilter, refreshSignal]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F4F7F4]">
            Deliveries
          </h1>
          <p className="mt-1 text-sm text-[#9AA69D]">
            Every outbound WhatsApp and Telegram message tracked per channel with full attempt
            history.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#0B0F0C] px-3.5 py-2 text-xs font-medium text-[#E6ECE7] hover:bg-white/[0.05] whitespace-nowrap"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6D7970]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') load();
            }}
            placeholder="Search by delivery ID, phone, or message..."
            className="w-full rounded-lg border border-white/12 bg-[#060807] py-1.5 pl-9 pr-3 text-xs text-[#F4F7F4] placeholder:text-[#5F6B61] focus:border-[#22C55E] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-[#060807] p-1">
          {(['all', 'sandbox', 'live'] as const).map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => setEnvFilter(env)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                envFilter === env
                  ? 'bg-[#172119] text-[#F4F7F4]'
                  : 'text-[#849287] hover:text-[#F4F7F4]'
              }`}
            >
              {env}
            </button>
          ))}
        </div>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-lg border border-white/12 bg-[#060807] px-3 py-1.5 text-xs text-[#F4F7F4] focus:border-[#22C55E] focus:outline-none"
        >
          <option value="all">All channels</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="telegram">Telegram</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-white/12 bg-[#060807] px-3 py-1.5 text-xs text-[#F4F7F4] focus:border-[#22C55E] focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="delivered">Delivered</option>
          <option value="queued">Queued</option>
          <option value="sent">Sent</option>
          <option value="unconfirmed">Unconfirmed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div
          className={`${selected ? 'lg:col-span-7' : 'lg:col-span-12'} overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F0C]`}
        >
          {loading ? (
            <div className="p-6 space-y-3">
              <div className="h-10 animate-pulse rounded bg-white/[0.05]" />
              <div className="h-10 animate-pulse rounded bg-white/[0.05]" />
              <div className="h-10 animate-pulse rounded bg-white/[0.05]" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#849287]">
              No deliveries match the current filters. Run a test in the Sandbox Playground to
              generate real delivery traces.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.07] bg-[#080B09] text-xs font-medium text-[#849287]">
                    <th className="px-5 py-3">Delivery</th>
                    <th className="px-5 py-3">Channel &amp; Recipient</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Attempts</th>
                    <th className="px-5 py-3 text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {rows.map((d) => {
                    const isSelected = selected?.id === d.id;
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelected(d)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#22C55E]/[0.08]' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <td className="px-5 py-3">
                          <p className="font-mono text-xs font-medium text-[#F4F7F4]">{d.id}</p>
                          <p className="mt-0.5 text-xs text-[#7E8C81] capitalize">
                            {d.kind} · {d.environment}
                            {d.scenario && d.scenario !== 'success' ? ` · ${d.scenario}` : ''}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-xs font-medium text-[#E6ECE7] capitalize">{d.channel}</p>
                          <p className="mt-0.5 font-mono text-xs text-[#7E8C81]">{d.recipient}</p>
                        </td>
                        <td className="px-5 py-3 text-xs capitalize whitespace-nowrap">
                          <span className={statusStyle(d.status)}>{d.status}</span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-[#9AA69D] tabular-nums">
                          {d.attempts.length}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-[#7E8C81] tabular-nums whitespace-nowrap">
                          {formatTimestamp(d.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Delivery Detail Drawer */}
        {selected && (
          <aside className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6 lg:col-span-5 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] pb-4">
              <div>
                <p className="font-mono text-xs text-[#7E8C81]">{selected.id}</p>
                <h2 className="mt-1 font-display text-base font-semibold text-[#F4F7F4] capitalize">
                  {selected.kind} via {selected.channel}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close delivery inspector"
                className="rounded-md p-1 text-[#7E8C81] hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-[#7E8C81]">Status</dt>
                <dd className={`mt-0.5 capitalize ${statusStyle(selected.status)}`}>
                  {selected.status}
                </dd>
              </div>
              <div>
                <dt className="text-[#7E8C81]">Environment</dt>
                <dd className="mt-0.5 font-medium text-[#F4F7F4] capitalize">
                  {selected.environment} {selected.simulated ? '(simulated)' : ''}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[#7E8C81]">Recipient</dt>
                <dd className="mt-0.5 font-mono text-[#F4F7F4]">{selected.recipient}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[#7E8C81]">Message preview</dt>
                <dd className="mt-1 rounded-lg border border-white/[0.08] bg-[#060807] p-3 text-[#C2CEC5]">
                  {selected.message_preview}
                </dd>
              </div>
            </dl>

            {selected.error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                <p className="font-mono font-semibold">{selected.error.code}</p>
                {selected.error.message && <p className="mt-1">{selected.error.message}</p>}
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold text-[#F4F7F4]">Attempt timeline</h3>
              {selected.attempts.length === 0 ? (
                <p className="mt-2 text-xs text-[#7E8C81]">
                  Queued in outbox — click Process queue in the Sandbox Playground to execute.
                </p>
              ) : (
                <ol className="mt-3 space-y-2.5">
                  {selected.attempts.map((a) => (
                    <li
                      key={a.attempt}
                      className="rounded-lg border border-white/[0.08] bg-[#070A08] px-3.5 py-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-medium text-[#F4F7F4]">
                          Attempt #{a.attempt} · {a.outcome}
                        </span>
                        <span className="text-[11px] text-[#7E8C81] tabular-nums">
                          {formatTimestamp(a.at)}
                        </span>
                      </div>
                      {a.message && <p className="mt-1 text-[#9AA69D]">{a.message}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
