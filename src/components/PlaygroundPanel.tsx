import { useState } from 'react';
import { Play, FastForward, RefreshCw, ExternalLink, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiRequest, sandboxRelayCall } from '../lib/api';

type PlaygroundTab = 'invoice' | 'otp' | 'notification' | 'telegram';

interface LogEntry {
  id: number;
  title: string;
  method: string;
  path: string;
  status: number;
  body: unknown;
  at: string;
}

const SCENARIOS = [
  'success',
  'temporary_failure',
  'throttled',
  'delayed_callback',
  'duplicate_callback',
  'ambiguous_timeout',
  'ambiguous_timeout_lost',
  'invalid_recipient',
  'permanent_failure',
  'expired_otp',
];

export function PlaygroundPanel({
  sandboxKey,
  onChangeSandboxKey,
  onOpenReceipt,
  onActivity,
}: {
  sandboxKey: string;
  onChangeSandboxKey: (key: string) => void;
  onOpenReceipt: (token: string) => void;
  onActivity: () => void;
}) {
  const [tab, setTab] = useState<PlaygroundTab>('invoice');
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState('success');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [seq, setSeq] = useState(1);

  const [invRef, setInvRef] = useState('ORD-90421');
  const [invCustomer, setInvCustomer] = useState('Chinedu Eze');
  const [invPhone, setInvPhone] = useState('+2348012345678');
  const [invExternalId, setInvExternalId] = useState('customer_42');
  const [invItem, setInvItem] = useState('Same-Day Courier Package');
  const [invAmountMajor, setInvAmountMajor] = useState('12500');
  const [invChannels, setInvChannels] = useState<('whatsapp' | 'telegram')[]>(['whatsapp']);
  const [lastReceiptToken, setLastReceiptToken] = useState<string | null>(null);

  const [otpPhone, setOtpPhone] = useState('+2348012345678');
  const [otpPurpose, setOtpPurpose] = useState<'login' | 'signup' | 'checkout' | 'payout'>('checkout');
  const [otpChallengeId, setOtpChallengeId] = useState('');
  const [otpCodeInput, setOtpCodeInput] = useState('');
  const [inboxEntries, setInboxEntries] = useState<
    { id: string; challengeId: string; phone: string; purpose: string; code: string; version: number }[]
  >([]);

  const [notifType, setNotifType] = useState<
    'order_confirmation' | 'payment_confirmation' | 'shipping_update' | 'general_update'
  >('shipping_update');
  const [notifMessage, setNotifMessage] = useState(
    'Your order ORD-90421 has been dispatched. Track your delivery anytime.',
  );
  const [notifLinkUrl, setNotifLinkUrl] = useState('');

  const [tgCustomerId, setTgCustomerId] = useState('customer_42');
  const [tgToken, setTgToken] = useState('');
  const [tgDeepLink, setTgDeepLink] = useState('');

  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const pushLog = (title: string, method: string, path: string, status: number, body: unknown) => {
    setSeq((n) => n + 1);
    setLog((prev) =>
      [
        {
          id: seq,
          title,
          method,
          path,
          status,
          body,
          at: new Date().toLocaleTimeString('en-US', { hour12: false }),
        },
        ...prev,
      ].slice(0, 12),
    );
  };

  const ensureKey = () => {
    if (!/^sn_test_/.test(sandboxKey.trim())) {
      setNotice({
        ok: false,
        message: 'Add or mint a sandbox key (sn_test_…) first. Live keys are rejected by the browser relay.',
      });
      return false;
    }
    return true;
  };

  const mintQuickSandboxKey = async () => {
    setBusy(true);
    setNotice(null);
    const res = await apiRequest<{ secretKey: string }>('/api/console/keys', {
      method: 'POST',
      body: {
        name: `Playground Key ${new Date().toLocaleTimeString('en-US', { hour12: false })}`,
        environment: 'sandbox',
        scopes: [
          'invoices:create',
          'invoices:read',
          'otp:create',
          'otp:verify',
          'notifications:send',
          'deliveries:read',
          'telegram:link',
        ],
        rateLimitPerMinute: 120,
      },
    });
    setBusy(false);
    if (res.ok && res.data?.secretKey) {
      onChangeSandboxKey(res.data.secretKey);
      setNotice({
        ok: true,
        message: 'Minted a new scoped sandbox key in memory. Ready to run requests.',
      });
      onActivity();
    } else {
      setNotice({ ok: false, message: res.error?.message || 'Could not create sandbox key' });
    }
  };

  const runQueue = async (fastForward: boolean) => {
    if (!ensureKey()) return;
    setBusy(true);
    const r = await sandboxRelayCall(sandboxKey, 'POST', '/sandbox/process-queue', {
      fast_forward: fastForward,
    });
    pushLog(
      fastForward ? 'Fast-forward outbox queue' : 'Process due outbox jobs',
      'POST',
      '/api/v1/sandbox/process-queue',
      r.status,
      r.body,
    );
    setBusy(false);
    onActivity();
  };

  const handleSendInvoice = async () => {
    if (!ensureKey()) return;
    setBusy(true);
    setNotice(null);
    const amountMinor = Math.max(100, Math.round(Number(invAmountMajor || '0') * 100));
    const r = await sandboxRelayCall<Record<string, unknown>>(
      sandboxKey,
      'POST',
      '/invoices',
      {
        reference: invRef,
        currency: 'NGN',
        customer: {
          name: invCustomer,
          phone: invPhone,
          external_customer_id: invExternalId,
        },
        items: [{ description: invItem, quantity: 1, unit_price_minor: amountMinor }],
        tax_rate_bps: 750,
        channels: invChannels,
        scenario: scenario === 'expired_otp' ? 'success' : scenario,
      },
      `idem_${invRef}_${Date.now()}`,
    );
    pushLog('Create invoice & enqueue delivery', 'POST', '/api/v1/invoices', r.status, r.body);

    if (r.ok && typeof r.body?.receipt_url === 'string') {
      const token = r.body.receipt_url.split('/').pop() || null;
      setLastReceiptToken(token);
      const q = await sandboxRelayCall(sandboxKey, 'POST', '/sandbox/process-queue', {
        fast_forward: false,
      });
      pushLog('Auto-drain due outbox jobs', 'POST', '/api/v1/sandbox/process-queue', q.status, q.body);
      setNotice({ ok: true, message: `Invoice accepted (${r.body.invoice_number}). Inspect deliveries or fast-forward retries.` });
    } else {
      const errObj = r.body?.error as { message?: string } | undefined;
      setNotice({ ok: false, message: errObj?.message || 'Invoice request failed' });
    }
    setBusy(false);
    onActivity();
  };

  const refreshOtpInbox = async () => {
    if (!ensureKey()) return;
    const r = await sandboxRelayCall<{ data?: typeof inboxEntries }>(
      sandboxKey,
      'GET',
      `/sandbox/otp-inbox?phone=${encodeURIComponent(otpPhone)}`,
    );
    if (r.ok && Array.isArray(r.body?.data)) {
      setInboxEntries(r.body.data);
      if (r.body.data[0]?.code) {
        setOtpCodeInput(r.body.data[0].code);
      }
    }
    return r;
  };

  const handleSendOtp = async () => {
    if (!ensureKey()) return;
    setBusy(true);
    setNotice(null);
    const r = await sandboxRelayCall<Record<string, unknown>>(sandboxKey, 'POST', '/otp/challenges', {
      phone: otpPhone,
      purpose: otpPurpose,
      length: 6,
      ttl_seconds: 300,
      scenario,
    });
    pushLog('Create WhatsApp OTP challenge', 'POST', '/api/v1/otp/challenges', r.status, r.body);
    if (r.ok && typeof r.body?.id === 'string') {
      setOtpChallengeId(r.body.id);
      await sandboxRelayCall(sandboxKey, 'POST', '/sandbox/process-queue', { fast_forward: false });
      const inboxRes = await refreshOtpInbox();
      if (inboxRes) {
        pushLog('Read sandbox OTP inbox', 'GET', '/api/v1/sandbox/otp-inbox', inboxRes.status, inboxRes.body);
      }
      setNotice({ ok: true, message: `OTP challenge ${r.body.id} created. Code loaded from sandbox inbox.` });
    } else {
      const errObj = r.body?.error as { message?: string } | undefined;
      setNotice({ ok: false, message: errObj?.message || 'Could not create OTP challenge' });
    }
    setBusy(false);
    onActivity();
  };

  const handleVerifyOtp = async () => {
    if (!ensureKey() || !otpChallengeId) return;
    setBusy(true);
    const r = await sandboxRelayCall<Record<string, unknown>>(
      sandboxKey,
      'POST',
      `/otp/challenges/${encodeURIComponent(otpChallengeId)}/verify`,
      { code: otpCodeInput },
    );
    pushLog('Verify OTP code', 'POST', `/api/v1/otp/challenges/${otpChallengeId}/verify`, r.status, r.body);
    setNotice({
      ok: r.ok,
      message: r.ok
        ? 'Code verified (single-use consumed).'
        : ((r.body?.error as { message?: string } | undefined)?.message || 'Verification failed'),
    });
    setBusy(false);
    onActivity();
  };

  const handleResendOtp = async () => {
    if (!ensureKey() || !otpChallengeId) return;
    setBusy(true);
    const r = await sandboxRelayCall<Record<string, unknown>>(
      sandboxKey,
      'POST',
      `/otp/challenges/${encodeURIComponent(otpChallengeId)}/resend`,
    );
    pushLog('Resend OTP (bumps version)', 'POST', `/api/v1/otp/challenges/${otpChallengeId}/resend`, r.status, r.body);
    await refreshOtpInbox();
    setBusy(false);
    onActivity();
  };

  const handleSendNotification = async () => {
    if (!ensureKey()) return;
    setBusy(true);
    setNotice(null);
    const r = await sandboxRelayCall<Record<string, unknown>>(sandboxKey, 'POST', '/notifications', {
      type: notifType,
      customer: { name: invCustomer, phone: invPhone, external_customer_id: invExternalId },
      fields: { order_id: invRef, message: notifMessage },
      ...(notifLinkUrl.trim() ? { link: { label: 'Track shipment', url: notifLinkUrl.trim() } } : {}),
      channels: ['whatsapp'],
      scenario: scenario === 'expired_otp' ? 'success' : scenario,
    });
    pushLog('Send transactional notification', 'POST', '/api/v1/notifications', r.status, r.body);
    if (r.ok) {
      await sandboxRelayCall(sandboxKey, 'POST', '/sandbox/process-queue', { fast_forward: false });
      setNotice({ ok: true, message: 'Notification passed link allowlist check and was queued.' });
    } else {
      const errObj = r.body?.error as { message?: string } | undefined;
      setNotice({ ok: false, message: errObj?.message || 'Notification rejected' });
    }
    setBusy(false);
    onActivity();
  };

  const handleMintTelegramToken = async () => {
    if (!ensureKey()) return;
    setBusy(true);
    setNotice(null);
    const r = await sandboxRelayCall<{ token?: string; deep_link?: string }>(
      sandboxKey,
      'POST',
      '/telegram/link-tokens',
      { external_customer_id: tgCustomerId, customer_name: invCustomer },
    );
    pushLog('Mint single-use Telegram link token', 'POST', '/api/v1/telegram/link-tokens', r.status, r.body);
    if (r.ok && r.body?.token) {
      setTgToken(r.body.token);
      setTgDeepLink(r.body.deep_link || '');
      setNotice({ ok: true, message: 'Single-use Telegram link token minted. Simulate /start below.' });
    }
    setBusy(false);
  };

  const handleSimulateTelegramStart = async () => {
    if (!ensureKey() || !tgToken) return;
    setBusy(true);
    const r = await sandboxRelayCall<Record<string, unknown>>(
      sandboxKey,
      'POST',
      '/sandbox/telegram/start',
      { token: tgToken },
    );
    pushLog('Simulate Telegram /start webhook', 'POST', '/api/v1/sandbox/telegram/start', r.status, r.body);
    setNotice({
      ok: r.ok,
      message: r.ok
        ? `Customer "${tgCustomerId}" is now linked to Telegram in sandbox. You can include "telegram" in invoice channels.`
        : ((r.body?.error as { message?: string } | undefined)?.message || 'Token rejected'),
    });
    setBusy(false);
    onActivity();
  };

  const toggleChannel = (ch: 'whatsapp' | 'telegram') => {
    setInvChannels((prev) =>
      prev.includes(ch) ? (prev.length > 1 ? prev.filter((c) => c !== ch) : prev) : [...prev, ch],
    );
  };

  const fieldClass =
    'mt-1 w-full rounded-lg border border-white/12 bg-[#060807] px-3 py-1.5 text-xs text-[#F4F7F4] placeholder:text-[#5F6B61] focus:border-[#22C55E] focus:outline-none';

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F0C]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] px-6 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
            Interactive Sandbox Playground
          </h2>
          <p className="mt-0.5 text-xs text-[#849287]">
            Calls real <code className="font-mono text-[#4ADE80]">/api/v1</code> endpoints through
            the session-gated sandbox relay (<code className="font-mono text-[#4ADE80]">sn_test_</code>{' '}
            keys only).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => runQueue(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#070A08] px-3 py-1.5 text-xs font-medium text-[#E6ECE7] hover:bg-white/[0.05] whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Process queue
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => runQueue(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#070A08] px-3 py-1.5 text-xs font-medium text-[#E6ECE7] hover:bg-white/[0.05] whitespace-nowrap shrink-0"
          >
            <FastForward className="h-3.5 w-3.5 text-[#22C55E]" />
            Fast-forward retries
          </button>
        </div>
      </div>

      {/* Sandbox Key Bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] bg-[#080B09] px-6 py-3.5">
        <label className="text-xs font-medium text-[#9AA69D] whitespace-nowrap shrink-0">
          Sandbox API key
        </label>
        <input
          type="text"
          value={sandboxKey}
          onChange={(e) => onChangeSandboxKey(e.target.value)}
          placeholder="sn_test_..."
          className="min-w-[260px] flex-1 rounded-lg border border-white/12 bg-[#050705] px-3 py-1.5 font-mono text-xs text-[#F4F7F4] focus:border-[#22C55E] focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[#9AA69D] whitespace-nowrap">Scenario</label>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            className="rounded-lg border border-white/12 bg-[#050705] px-2.5 py-1.5 font-mono text-xs text-[#F4F7F4] focus:border-[#22C55E] focus:outline-none"
          >
            {SCENARIOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={mintQuickSandboxKey}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4F7F4] px-3 py-1.5 text-xs font-semibold text-[#050705] hover:bg-white whitespace-nowrap shrink-0"
        >
          <KeyRound className="h-3.5 w-3.5" />
          Mint new key
        </button>
      </div>

      <div className="grid lg:grid-cols-12">
        {/* Left: Interactive Request Builder */}
        <div className="border-b border-white/[0.07] p-6 lg:col-span-6 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-[#060807] p-1">
            {(
              [
                ['invoice', 'Invoice'],
                ['otp', 'WhatsApp OTP'],
                ['notification', 'Notification'],
                ['telegram', 'Telegram Link'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  setNotice(null);
                }}
                className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === id
                    ? 'bg-[#172119] text-[#F4F7F4]'
                    : 'text-[#849287] hover:text-[#F4F7F4]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {notice && (
            <div
              className={`mt-4 flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
                notice.ok
                  ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#B6F4CA]'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}
            >
              {notice.ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
              )}
              <span>{notice.message}</span>
            </div>
          )}

          {tab === 'invoice' && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Order reference</label>
                  <input
                    type="text"
                    value={invRef}
                    onChange={(e) => setInvRef(e.target.value)}
                    className={`${fieldClass} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Amount (NGN)</label>
                  <input
                    type="number"
                    min="1"
                    value={invAmountMajor}
                    onChange={(e) => setInvAmountMajor(e.target.value)}
                    className={`${fieldClass} font-mono tabular-nums`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Customer name</label>
                  <input
                    type="text"
                    value={invCustomer}
                    onChange={(e) => setInvCustomer(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">WhatsApp phone (E.164)</label>
                  <input
                    type="text"
                    value={invPhone}
                    onChange={(e) => setInvPhone(e.target.value)}
                    className={`${fieldClass} font-mono`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#A8B3AA]">Line item description</label>
                <input
                  type="text"
                  value={invItem}
                  onChange={(e) => setInvItem(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-4 text-xs text-[#C2CEC5]">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={invChannels.includes('whatsapp')}
                      onChange={() => toggleChannel('whatsapp')}
                      className="rounded accent-[#22C55E]"
                    />
                    WhatsApp
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={invChannels.includes('telegram')}
                      onChange={() => toggleChannel('telegram')}
                      className="rounded accent-[#22C55E]"
                    />
                    Telegram ({invExternalId})
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  {lastReceiptToken && (
                    <button
                      type="button"
                      onClick={() => onOpenReceipt(lastReceiptToken)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-2 text-xs font-medium text-[#E6ECE7] hover:bg-white/[0.05] whitespace-nowrap"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View receipt
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSendInvoice}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#22C55E] px-4 py-2 text-xs font-semibold text-[#050705] hover:bg-[#16A34A] disabled:opacity-60 whitespace-nowrap"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Send invoice
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'otp' && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Phone (E.164)</label>
                  <input
                    type="text"
                    value={otpPhone}
                    onChange={(e) => setOtpPhone(e.target.value)}
                    className={`${fieldClass} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Purpose</label>
                  <select
                    value={otpPurpose}
                    onChange={(e) =>
                      setOtpPurpose(e.target.value as 'login' | 'signup' | 'checkout' | 'payout')
                    }
                    className={fieldClass}
                  >
                    <option value="checkout">checkout</option>
                    <option value="login">login</option>
                    <option value="signup">signup</option>
                    <option value="payout">payout</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSendOtp}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#22C55E] px-4 py-2 text-xs font-semibold text-[#050705] hover:bg-[#16A34A] disabled:opacity-60"
                >
                  <Play className="h-3.5 w-3.5" />
                  Create OTP challenge
                </button>
                <button
                  type="button"
                  disabled={busy || !otpChallengeId}
                  onClick={handleResendOtp}
                  className="rounded-lg border border-white/12 px-3 py-2 text-xs font-medium text-[#E6ECE7] hover:bg-white/[0.05] disabled:opacity-50"
                >
                  Resend (bump version)
                </button>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-[#070A08] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#F4F7F4]">Verify challenge</span>
                  <span className="font-mono text-[#7E8C81]">{otpChallengeId || 'No active challenge'}</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={otpCodeInput}
                    onChange={(e) => setOtpCodeInput(e.target.value)}
                    placeholder="6-digit code from sandbox inbox"
                    className="flex-1 rounded-lg border border-white/12 bg-[#050705] px-3 py-1.5 font-mono text-xs text-[#F4F7F4] tracking-widest focus:border-[#22C55E] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy || !otpChallengeId || !otpCodeInput}
                    onClick={handleVerifyOtp}
                    className="rounded-lg bg-[#F4F7F4] px-4 py-1.5 text-xs font-semibold text-[#050705] hover:bg-white disabled:opacity-50"
                  >
                    Verify once
                  </button>
                </div>
                {inboxEntries.length > 0 && (
                  <div className="border-t border-white/[0.07] pt-2.5 text-xs text-[#9AA69D]">
                    <span className="font-medium text-[#D4DFD7]">Sandbox Inbox (latest):</span>{' '}
                    <span className="font-mono font-semibold text-[#4ADE80]">
                      {inboxEntries[0]!.code}
                    </span>{' '}
                    · v{inboxEntries[0]!.version} · {inboxEntries[0]!.phone}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'notification' && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Notification type</label>
                  <select
                    value={notifType}
                    onChange={(e) =>
                      setNotifType(
                        e.target.value as
                          | 'order_confirmation'
                          | 'payment_confirmation'
                          | 'shipping_update'
                          | 'general_update',
                      )
                    }
                    className={fieldClass}
                  >
                    <option value="shipping_update">shipping_update</option>
                    <option value="order_confirmation">order_confirmation</option>
                    <option value="payment_confirmation">payment_confirmation</option>
                    <option value="general_update">general_update</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">
                    Optional HTTPS link (allowlist checked)
                  </label>
                  <input
                    type="url"
                    value={notifLinkUrl}
                    onChange={(e) => setNotifLinkUrl(e.target.value)}
                    placeholder="https://track.yourbusiness.com/..."
                    className={`${fieldClass} font-mono`}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <label className="font-medium text-[#A8B3AA]">Message body (max 300 chars)</label>
                  <span className="font-mono text-[#7E8C81] tabular-nums">{notifMessage.length}/300</span>
                </div>
                <textarea
                  rows={3}
                  maxLength={300}
                  value={notifMessage}
                  onChange={(e) => setNotifMessage(e.target.value)}
                  className={fieldClass}
                />
                <p className="mt-1 text-[11px] text-[#7E8C81]">
                  Try changing the domain to <code className="font-mono text-[#D4DFD7]">https://evil-phish.xyz</code>{' '}
                  to see the anti-phishing link allowlist reject it live.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleSendNotification}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#22C55E] px-4 py-2 text-xs font-semibold text-[#050705] hover:bg-[#16A34A] disabled:opacity-60"
              >
                <Play className="h-3.5 w-3.5" />
                Send notification
              </button>
            </div>
          )}

          {tab === 'telegram' && (
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#A8B3AA]">
                  External customer ID
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={tgCustomerId}
                    onChange={(e) => setTgCustomerId(e.target.value)}
                    className="flex-1 rounded-lg border border-white/12 bg-[#060807] px-3 py-1.5 font-mono text-xs text-[#F4F7F4] focus:border-[#22C55E] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleMintTelegramToken}
                    className="rounded-lg bg-[#F4F7F4] px-4 py-1.5 text-xs font-semibold text-[#050705] hover:bg-white whitespace-nowrap"
                  >
                    1. Mint link token
                  </button>
                </div>
              </div>

              {tgDeepLink && (
                <div className="rounded-xl border border-white/[0.08] bg-[#070A08] p-3.5 space-y-2.5 text-xs">
                  <p className="font-medium text-[#F4F7F4]">Customer deep link (single-use)</p>
                  <p className="break-all font-mono text-[11px] text-[#9AA69D]">{tgDeepLink}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSimulateTelegramStart}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#22C55E] px-3.5 py-1.5 text-xs font-semibold text-[#050705] hover:bg-[#16A34A]"
                  >
                    <Play className="h-3.5 w-3.5" />
                    2. Simulate customer /start
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Live JSON Response Stream */}
        <div className="bg-[#060807] p-6 text-[#E6ECE7] lg:col-span-6 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
            <span className="font-mono text-xs text-[#9AA69D]">Live HTTP Response Log</span>
            {log.length > 0 && (
              <button
                type="button"
                onClick={() => setLog([])}
                className="text-xs text-[#7E8C81] hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          <div className="mt-4 flex-1 space-y-3 overflow-y-auto max-h-[380px] pr-1">
            {log.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#7E8C81]">
                Run any invoice, OTP, notification, or Telegram action on the left to inspect real
                server responses and status codes.
              </div>
            ) : (
              log.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-white/[0.08] bg-[#0B0F0C] p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-[#E6ECE7]">
                      <span className="text-[#7E8C81]">{entry.method}</span> {entry.path}
                    </span>
                    <span className="tabular-nums">
                      <span
                        className={
                          entry.status >= 200 && entry.status < 300
                            ? 'text-[#4ADE80] font-semibold'
                            : 'text-amber-400 font-semibold'
                        }
                      >
                        HTTP {entry.status}
                      </span>
                      <span className="ml-2 text-[#6D7970]">{entry.at}</span>
                    </span>
                  </div>
                  <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed text-[#B6C3B9]">
                    {JSON.stringify(entry.body, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
