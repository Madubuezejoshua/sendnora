import { useEffect, useState, type FormEvent } from 'react';
import { Copy, Check, Plus, Trash2, KeyRound } from 'lucide-react';
import { apiRequest, formatTimestamp } from '../lib/api';

interface ApiKeyItem {
  id: string;
  name: string;
  environment: 'sandbox' | 'live';
  prefix: string;
  lastFour: string;
  scopes: string[];
  rateLimitPerMinute: number;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export function KeysView({
  onUseSandboxKey,
}: {
  onUseSandboxKey: (key: string) => void;
}) {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'live'>('sandbox');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'invoices:create',
    'invoices:read',
    'otp:create',
    'otp:verify',
    'notifications:send',
    'deliveries:read',
    'telegram:link',
  ]);
  const [rateLimit, setRateLimit] = useState(120);
  const [revealedKey, setRevealedKey] = useState<{ secret: string; environment: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = async () => {
    setLoading(true);
    const res = await apiRequest<{ keys: ApiKeyItem[]; availableScopes: string[] }>('/api/console/keys');
    if (res.ok && res.data) {
      setKeys(res.data.keys);
      setAvailableScopes(res.data.availableScopes);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedScopes.length === 0) {
      setError('Select at least one API scope.');
      return;
    }
    setCreating(true);
    setError(null);
    const res = await apiRequest<{ secretKey: string; environment: string }>('/api/console/keys', {
      method: 'POST',
      body: {
        name: name.trim(),
        environment,
        scopes: selectedScopes,
        rateLimitPerMinute: rateLimit,
      },
    });
    setCreating(false);
    if (res.ok && res.data?.secretKey) {
      setRevealedKey({ secret: res.data.secretKey, environment: res.data.environment });
      setName('');
      if (res.data.environment === 'sandbox') {
        onUseSandboxKey(res.data.secretKey);
      }
      loadKeys();
    } else {
      setError(res.error?.message || 'Unable to create API key');
    }
  };

  const handleRevoke = async (id: string) => {
    const res = await apiRequest(`/api/console/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) loadKeys();
  };

  const copySecret = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F4F7F4]">
          API keys
        </h1>
        <p className="mt-1 text-sm text-[#9AA69D]">
          Create scoped API keys for Sandbox testing or Live production. Full secrets are shown once
          at creation and cannot be viewed again.
        </p>
      </div>

      {revealedKey && (
        <div className="rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#4ADE80]">
                Copy your new {revealedKey.environment} API key now — it will not be shown again
              </p>
              <p className="mt-1.5 break-all font-mono text-xs text-[#F4F7F4]">
                {revealedKey.secret}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copySecret}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#22C55E] px-3.5 py-2 text-xs font-semibold text-[#050705] hover:bg-[#16A34A] whitespace-nowrap"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy secret'}
              </button>
              <button
                type="button"
                onClick={() => setRevealedKey(null)}
                className="rounded-lg border border-white/15 bg-[#0B0F0C] px-3 py-2 text-xs font-medium text-[#E6ECE7] hover:bg-white/[0.06]"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Key Form */}
      <form onSubmit={handleCreate} className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#22C55E]" />
          <h2 className="font-display text-base font-semibold text-[#F4F7F4]">Create API key</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-[#A8B3AA]">Key label</label>
            <input
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Checkout backend service"
              className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#060807] px-3 py-2 text-sm text-[#F4F7F4] placeholder:text-[#5F6B61] focus:border-[#22C55E] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A8B3AA]">Environment</label>
            <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg border border-white/[0.07] bg-[#060807] p-1">
              <button
                type="button"
                onClick={() => setEnvironment('sandbox')}
                className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                  environment === 'sandbox'
                    ? 'bg-[#172119] text-[#F4F7F4]'
                    : 'text-[#849287] hover:text-[#F4F7F4]'
                }`}
              >
                Sandbox (sn_test_)
              </button>
              <button
                type="button"
                onClick={() => setEnvironment('live')}
                className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                  environment === 'live'
                    ? 'bg-[#172119] text-[#F4F7F4]'
                    : 'text-[#849287] hover:text-[#F4F7F4]'
                }`}
              >
                Live (sn_live_)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A8B3AA]">Rate limit (req/min)</label>
            <input
              type="number"
              min={10}
              max={600}
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#060807] px-3 py-2 font-mono text-sm text-[#F4F7F4] tabular-nums focus:border-[#22C55E] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#A8B3AA]">Least-privilege scopes</label>
          <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {availableScopes.map((scope) => (
              <label
                key={scope}
                className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#070A08] px-3 py-2 text-xs text-[#C2CEC5] cursor-pointer hover:border-white/20"
              >
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                  className="rounded accent-[#22C55E]"
                />
                <span className="font-mono text-[11px]">{scope}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#22C55E] px-4 py-2 text-xs font-semibold text-[#050705] hover:bg-[#16A34A] disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" />
          {creating ? 'Generating...' : 'Generate API key'}
        </button>
      </form>

      {/* Keys Table */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F0C]">
        <div className="border-b border-white/[0.07] px-6 py-4">
          <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
            Provisioned keys ({keys.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-10 animate-pulse rounded bg-white/[0.05]" />
            <div className="h-10 animate-pulse rounded bg-white/[0.05]" />
          </div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#849287]">No API keys created yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] bg-[#080B09] text-xs font-medium text-[#849287]">
                  <th className="px-6 py-3">Name &amp; token fragment</th>
                  <th className="px-6 py-3">Environment</th>
                  <th className="px-6 py-3">Scopes</th>
                  <th className="px-6 py-3 text-right">Limit</th>
                  <th className="px-6 py-3">Last used</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-[#F4F7F4]">{k.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-[#7E8C81]">
                        {k.prefix}••••••••{k.lastFour}
                      </p>
                    </td>
                    <td className="px-6 py-3.5 text-xs font-medium">
                      <span className={k.environment === 'live' ? 'text-[#4ADE80]' : 'text-[#9AA69D]'}>
                        {k.environment === 'live' ? 'Live' : 'Sandbox'}
                      </span>
                      {k.revokedAt && <span className="ml-1.5 text-red-400">· Revoked</span>}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[11px] text-[#9AA69D] max-w-xs truncate">
                      {k.scopes.join(', ')}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs text-[#9AA69D] tabular-nums whitespace-nowrap">
                      {k.rateLimitPerMinute}/min
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-[#7E8C81] tabular-nums whitespace-nowrap">
                      {formatTimestamp(k.lastUsedAt)}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {k.revokedAt ? (
                        <span className="text-xs text-[#616E63]">Revoked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRevoke(k.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-300 whitespace-nowrap"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
