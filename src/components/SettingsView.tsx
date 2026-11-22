import { useEffect, useState, type FormEvent } from 'react';
import { Shield, Trash2, Send, CheckCircle2, AlertCircle, Lock, LogOut } from 'lucide-react';
import { apiRequest, formatTimestamp } from '../lib/api';

type SettingsTab = 'business' | 'channels' | 'webhooks' | 'security';

interface SettingsPayload {
  business: {
    displayName: string;
    contactEmail: string;
    countryCode: string;
    currency: 'NGN' | 'USD' | 'GBP' | 'EUR' | 'KES' | 'GHS';
    allowedLinkOrigins: string[];
  };
  channels: {
    id: string;
    channel: string;
    environment: string;
    status: string;
    displayLabel: string;
    config: Record<string, string>;
    secretMask: string;
    updatedAt: string;
  }[];
  webhooks: {
    id: string;
    environment: string;
    url: string;
    events: string[];
    active: boolean;
    secretMask: string;
    createdAt: string;
    lastDeliveredAt?: string;
    lastStatus?: number;
  }[];
  webhookLogs: {
    id: string;
    endpointId: string;
    eventType: string;
    signatureHeader: string;
    status: number;
    at: string;
  }[];
  availableWebhookEvents: string[];
  telegramLinks: {
    id: string;
    externalCustomerId: string;
    chatId: string;
    environment: string;
    linkedAt: string;
  }[];
  security: {
    activeSessions: {
      id: string;
      current: boolean;
      userAgent: string;
      ip: string;
      createdAt: string;
      lastSeenAt: string;
    }[];
    loginHistory: {
      id: string;
      success: boolean;
      reason?: string;
      ip: string;
      at: string;
    }[];
  };
}

export function SettingsView() {
  const [tab, setTab] = useState<SettingsTab>('business');
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [currency, setCurrency] = useState<'NGN' | 'USD' | 'GBP' | 'EUR' | 'KES' | 'GHS'>('NGN');
  const [originsText, setOriginsText] = useState('');

  const [chType, setChType] = useState<'whatsapp' | 'telegram'>('whatsapp');
  const [chLabel, setChLabel] = useState('');
  const [chPhoneId, setChPhoneId] = useState('');
  const [chBotUser, setChBotUser] = useState('');
  const [chSecret, setChSecret] = useState('');

  const [whUrl, setWhUrl] = useState('');
  const [whEnv, setWhEnv] = useState<'sandbox' | 'live'>('sandbox');
  const [whEvents, setWhEvents] = useState<string[]>([
    'invoice.created',
    'delivery.delivered',
    'delivery.failed',
    'otp.verified',
  ]);
  const [newWhSecret, setNewWhSecret] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await apiRequest<SettingsPayload>('/api/console/settings');
    if (res.ok && res.data) {
      setData(res.data);
      setDisplayName(res.data.business.displayName);
      setContactEmail(res.data.business.contactEmail);
      setCurrency(res.data.business.currency);
      setOriginsText(res.data.business.allowedLinkOrigins.join('\n'));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveBusiness = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const allowedLinkOrigins = originsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await apiRequest('/api/console/settings/business', {
      method: 'PATCH',
      body: { displayName, contactEmail, currency, allowedLinkOrigins },
    });
    if (res.ok) {
      setFeedback({ ok: true, text: 'Business profile and allowed link origins saved.' });
      load();
    } else {
      setFeedback({ ok: false, text: res.error?.message || 'Unable to save business settings' });
    }
  };

  const handleConnectChannel = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiRequest<{ secretMask: string }>('/api/console/settings/channels', {
      method: 'PUT',
      body: {
        channel: chType,
        environment: 'live',
        displayLabel: chLabel,
        phoneNumberId: chType === 'whatsapp' ? chPhoneId : undefined,
        botUsername: chType === 'telegram' ? chBotUser : undefined,
        secretToken: chSecret,
      },
    });
    if (res.ok) {
      setChSecret('');
      setFeedback({
        ok: true,
        text: `Credentials encrypted with AES-256-GCM (${res.data?.secretMask}). Plaintext is never returned.`,
      });
      load();
    } else {
      setFeedback({ ok: false, text: res.error?.message || 'Unable to save channel credentials' });
    }
  };

  const handleAddWebhook = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setNewWhSecret(null);
    const res = await apiRequest<{ signingSecret: string }>('/api/console/settings/webhooks', {
      method: 'POST',
      body: { url: whUrl, environment: whEnv, events: whEvents },
    });
    if (res.ok && res.data) {
      setWhUrl('');
      setNewWhSecret(res.data.signingSecret);
      setFeedback({ ok: true, text: 'SSRF-vetted webhook registered. Copy your signing secret below.' });
      load();
    } else {
      setFeedback({ ok: false, text: res.error?.message || 'Webhook registration blocked' });
    }
  };

  const handleTestWebhook = async (id: string) => {
    setFeedback(null);
    const res = await apiRequest<{ signatureHeader: string }>(
      `/api/console/settings/webhooks/${encodeURIComponent(id)}/test`,
      { method: 'POST' },
    );
    if (res.ok) {
      setFeedback({ ok: true, text: `Signed test event dispatched (${res.data?.signatureHeader.slice(0, 32)}…)` });
      load();
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    const res = await apiRequest(`/api/console/settings/webhooks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) load();
  };

  const handleLogoutOthers = async () => {
    setFeedback(null);
    const res = await apiRequest<{ revoked: number }>('/api/auth/logout-other-sessions', {
      method: 'POST',
    });
    if (res.ok) {
      setFeedback({ ok: true, text: `Revoked ${res.data?.revoked ?? 0} other active session(s).` });
      load();
    }
  };

  const toggleEvent = (ev: string) => {
    setWhEvents((prev) =>
      prev.includes(ev) ? (prev.length > 1 ? prev.filter((x) => x !== ev) : prev) : [...prev, ev],
    );
  };

  const inputClass =
    'mt-1.5 w-full rounded-lg border border-white/12 bg-[#060807] px-3 py-2 text-sm text-[#F4F7F4] placeholder:text-[#5F6B61] focus:border-[#22C55E] focus:outline-none';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F4F7F4]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[#9AA69D]">
          Manage business identity, encrypted channel senders, SSRF-hardened webhooks, and active
          sessions.
        </p>
      </div>

      {/* Segmented Settings Nav */}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-white/[0.07] bg-[#0B0F0C] p-1">
        {(
          [
            ['business', 'Business & Allowlist'],
            ['channels', 'Channels'],
            ['webhooks', 'Webhooks'],
            ['security', 'Sessions & Security'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setFeedback(null);
            }}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              tab === id
                ? 'bg-[#172119] text-[#F4F7F4]'
                : 'text-[#849287] hover:text-[#F4F7F4]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-xs ${
            feedback.ok
              ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#B6F4CA]'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#22C55E]" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {loading || !data ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-8">
          <div className="h-6 w-48 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-4 h-28 animate-pulse rounded bg-white/[0.04]" />
        </div>
      ) : (
        <>
          {tab === 'business' && (
            <form
              onSubmit={handleSaveBusiness}
              className="max-w-2xl rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6 space-y-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Business display name</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Contact email</label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="max-w-xs">
                <label className="block text-xs font-medium text-[#A8B3AA]">Default currency</label>
                <select
                  value={currency}
                  onChange={(e) =>
                    setCurrency(e.target.value as 'NGN' | 'USD' | 'GBP' | 'EUR' | 'KES' | 'GHS')
                  }
                  className={inputClass}
                >
                  <option value="NGN">NGN (₦)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="KES">KES (KSh)</option>
                  <option value="GHS">GHS (GH₵)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A8B3AA]">
                  Allowed notification link hosts (one domain per line)
                </label>
                <textarea
                  rows={4}
                  value={originsText}
                  onChange={(e) => setOriginsText(e.target.value)}
                  placeholder="koramarket.example&#10;track.koramarket.example"
                  className={`${inputClass} font-mono text-xs`}
                />
                <p className="mt-1 text-xs text-[#7E8C81]">
                  Anti-phishing safeguard: transactional notifications containing URLs outside this
                  list are automatically rejected.
                </p>
              </div>

              <button
                type="submit"
                className="rounded-lg bg-[#22C55E] px-4 py-2 text-xs font-semibold text-[#050705] hover:bg-[#16A34A]"
              >
                Save business profile
              </button>
            </form>
          )}

          {tab === 'channels' && (
            <div className="grid gap-6 lg:grid-cols-12">
              <form
                onSubmit={handleConnectChannel}
                className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6 space-y-4 lg:col-span-6"
              >
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[#22C55E]" />
                  <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                    Connect encrypted channel sender
                  </h2>
                </div>
                <p className="text-xs text-[#849287]">
                  Access tokens and bot tokens are encrypted with AES-256-GCM before storage and
                  never returned in API responses.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#A8B3AA]">Channel</label>
                    <select
                      value={chType}
                      onChange={(e) => setChType(e.target.value as 'whatsapp' | 'telegram')}
                      className={`${inputClass} text-xs`}
                    >
                      <option value="whatsapp">WhatsApp Cloud API (Meta)</option>
                      <option value="telegram">Telegram Bot</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#A8B3AA]">Sender label</label>
                    <input
                      type="text"
                      required
                      value={chLabel}
                      onChange={(e) => setChLabel(e.target.value)}
                      placeholder="Primary Orders Sender"
                      className={`${inputClass} text-xs`}
                    />
                  </div>
                </div>

                {chType === 'whatsapp' ? (
                  <div>
                    <label className="block text-xs font-medium text-[#A8B3AA]">
                      Meta Phone Number ID
                    </label>
                    <input
                      type="text"
                      value={chPhoneId}
                      onChange={(e) => setChPhoneId(e.target.value)}
                      placeholder="109283746501928"
                      className={`${inputClass} font-mono text-xs`}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-[#A8B3AA]">Bot username</label>
                    <input
                      type="text"
                      value={chBotUser}
                      onChange={(e) => setChBotUser(e.target.value)}
                      placeholder="koramarket_notify_bot"
                      className={`${inputClass} font-mono text-xs`}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">
                    {chType === 'whatsapp' ? 'Permanent System User Access Token' : 'Telegram Bot API Token'}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={chSecret}
                    onChange={(e) => setChSecret(e.target.value)}
                    placeholder="Stored encrypted with AES-256-GCM"
                    className={`${inputClass} font-mono text-xs`}
                  />
                </div>

                <button
                  type="submit"
                  className="rounded-lg bg-[#22C55E] px-4 py-2 text-xs font-semibold text-[#050705] hover:bg-[#16A34A]"
                >
                  Encrypt &amp; save sender
                </button>
              </form>

              <div className="space-y-5 lg:col-span-6">
                <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6">
                  <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                    Connected senders ({data.channels.length})
                  </h2>
                  {data.channels.length === 0 ? (
                    <p className="mt-3 text-xs text-[#849287]">
                      No live channel senders connected yet. Sandbox requests use the built-in
                      deterministic simulator.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-white/[0.06]">
                      {data.channels.map((c) => (
                        <li key={c.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                          <div>
                            <p className="font-medium text-[#F4F7F4]">
                              {c.displayLabel} · <span className="capitalize">{c.channel}</span>
                            </p>
                            <p className="mt-0.5 font-mono text-[#7E8C81]">
                              Encrypted secret: {c.secretMask}
                            </p>
                          </div>
                          <span className="font-medium text-[#4ADE80] capitalize">{c.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6">
                  <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                    Linked Telegram customers ({data.telegramLinks.length})
                  </h2>
                  {data.telegramLinks.length === 0 ? (
                    <p className="mt-3 text-xs text-[#849287]">
                      No customers linked yet. Use the Telegram Link tab in the Sandbox Playground
                      to simulate customer opt-in.
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-white/[0.06] text-xs">
                      {data.telegramLinks.map((l) => (
                        <li key={l.id} className="py-2.5 flex justify-between font-mono">
                          <span className="text-[#F4F7F4]">{l.externalCustomerId}</span>
                          <span className="text-[#7E8C81]">{l.chatId}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'webhooks' && (
            <div className="space-y-6">
              {newWhSecret && (
                <div className="rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/10 p-4 text-xs">
                  <p className="font-semibold text-[#4ADE80]">
                    Webhook signing secret (shown once — verify with Sendnaro-Signature):
                  </p>
                  <p className="mt-1 font-mono text-[#F4F7F4] break-all">{newWhSecret}</p>
                </div>
              )}

              <form
                onSubmit={handleAddWebhook}
                className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  Register HTTPS webhook endpoint
                </h2>
                <p className="text-xs text-[#849287]">
                  URLs are vetted against SSRF: HTTPS required, no embedded credentials, and private
                  / loopback / cloud metadata IPs are blocked.
                </p>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-[#A8B3AA]">Endpoint URL</label>
                    <input
                      type="url"
                      required
                      value={whUrl}
                      onChange={(e) => setWhUrl(e.target.value)}
                      placeholder="https://api.yourbusiness.com/webhooks/sendnaro"
                      className={`${inputClass} font-mono text-xs`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#A8B3AA]">Environment</label>
                    <select
                      value={whEnv}
                      onChange={(e) => setWhEnv(e.target.value as 'sandbox' | 'live')}
                      className={`${inputClass} text-xs`}
                    >
                      <option value="sandbox">Sandbox</option>
                      <option value="live">Live</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {data.availableWebhookEvents.map((ev) => (
                    <label
                      key={ev}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#070A08] px-3 py-1.5 font-mono text-[11px] text-[#C2CEC5] cursor-pointer hover:border-white/20"
                    >
                      <input
                        type="checkbox"
                        checked={whEvents.includes(ev)}
                        onChange={() => toggleEvent(ev)}
                        className="accent-[#22C55E]"
                      />
                      {ev}
                    </label>
                  ))}
                </div>

                <button
                  type="submit"
                  className="rounded-lg bg-[#22C55E] px-4 py-2 text-xs font-semibold text-[#050705] hover:bg-[#16A34A]"
                >
                  Register endpoint
                </button>
              </form>

              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F0C]">
                <div className="border-b border-white/[0.07] px-6 py-4">
                  <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                    Registered endpoints ({data.webhooks.length})
                  </h2>
                </div>
                <div className="divide-y divide-white/[0.06]">
                  {data.webhooks.map((w) => (
                    <div
                      key={w.id}
                      className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 text-xs"
                    >
                      <div>
                        <p className="font-mono font-medium text-[#F4F7F4]">{w.url}</p>
                        <p className="mt-1 text-[#7E8C81]">
                          {w.environment} · {w.events.join(', ')} · Secret {w.secretMask}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleTestWebhook(w.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/12 px-3 py-1.5 font-medium text-[#E6ECE7] hover:bg-white/[0.05]"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Send signed test
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteWebhook(w.id)}
                          className="text-red-400 hover:text-red-300"
                          aria-label="Delete webhook endpoint"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {data.webhookLogs.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F0C]">
                  <div className="border-b border-white/[0.07] px-6 py-3.5">
                    <h3 className="font-display text-sm font-semibold text-[#F4F7F4]">
                      Recent signed webhook dispatches
                    </h3>
                  </div>
                  <div className="divide-y divide-white/[0.06] font-mono text-xs">
                    {data.webhookLogs.slice(0, 8).map((l) => (
                      <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
                        <span className="text-[#F4F7F4]">{l.eventType}</span>
                        <span className="truncate max-w-md text-[#7E8C81]">{l.signatureHeader}</span>
                        <span className="text-[#4ADE80] tabular-nums">
                          HTTP {l.status} · {formatTimestamp(l.at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] pb-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[#22C55E]" />
                    <div>
                      <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                        Active server-tracked sessions ({data.security.activeSessions.length})
                      </h2>
                      <p className="text-xs text-[#849287]">
                        Bearer session tokens are held strictly in browser memory (never localStorage).
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogoutOthers}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3.5 py-2 text-xs font-medium text-[#E6ECE7] hover:bg-white/[0.05] whitespace-nowrap"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Log out other sessions
                  </button>
                </div>

                <ul className="mt-4 divide-y divide-white/[0.06] text-xs">
                  {data.security.activeSessions.map((s) => (
                    <li key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-[#F4F7F4]">
                          {s.current ? 'Current session' : 'Other session'} ·{' '}
                          <span className="font-mono text-[#7E8C81]">{s.ip}</span>
                        </p>
                        <p className="mt-0.5 text-[#7E8C81] truncate max-w-xl">{s.userAgent}</p>
                      </div>
                      <span className="font-mono text-[#7E8C81] tabular-nums">
                        Last active {formatTimestamp(s.lastSeenAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
