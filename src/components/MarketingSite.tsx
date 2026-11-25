import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Gift,
  KeyRound,
  Link2,
  Lock,
  MessageSquare,
  Rocket,
  Send,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { BrandMark } from './BrandMark';
import { CodeBlock } from './CodeBlock';
import { BillingDurationSelector } from './BillingDurationSelector';
import {
  PLANS,
  calculatePlanQuote,
  formatMajorPrice,
  type BillingPreset,
} from '../lib/pricing';

export type MarketingPage =
  | 'home'
  | 'about'
  | 'docs'
  | 'pricing'
  | 'security'
  | 'support'
  | 'privacy'
  | 'terms'
  | 'data-deletion';

interface PlatformState {
  billingRequired: boolean;
  activationPrice: { amountMinor: number; currency: string } | null;
  configuredPrice: { amountMinor: number; currency: string };
}

const INVOICE_CURL = `curl -X POST https://api.sendnaro.com/api/v1/invoices \\
  -H "Authorization: Bearer $SENDNARO_API_KEY" \\
  -H "Idempotency-Key: ord_88241_receipt" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference": "ORD-88241",
    "currency": "NGN",
    "customer": {
      "name": "Amaka Okafor",
      "phone": "+2348012345678"
    },
    "items": [
      { "description": "Express Lagos Parcel (4x)", "quantity": 4, "unit_price_minor": 350000 }
    ],
    "tax_rate_bps": 750,
    "channels": ["whatsapp"]
  }'`;

const OTP_SNIPPET = `// 1. Issue a verification code on WhatsApp (never stored in plaintext)
const challenge = await fetch('/api/v1/otp/challenges', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.SENDNARO_API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    phone: '+2348012345678',
    purpose: 'checkout',
    length: 6,
    ttl_seconds: 300,
  }),
}).then((r) => r.json());

// 2. Verify once on your server (atomic single-use with 5-attempt cap)
const check = await fetch(\`/api/v1/otp/challenges/\${challenge.id}/verify\`, {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.SENDNARO_API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ code: userEnteredCode }),
}).then((r) => r.json());`;

const WEBHOOK_VERIFY_SNIPPET = `import crypto from 'node:crypto';

export function verifySendnaroWebhook(rawBody: Buffer, header: string, secret: string): boolean {
  const parts = new Map<string, string>();
  for (const item of header.split(',')) {
    const idx = item.indexOf('=');
    if (idx > 0) parts.set(item.slice(0, idx).trim(), item.slice(idx + 1).trim());
  }
  const timestamp = Number(parts.get('t'));
  const signature = parts.get('v1');
  if (!Number.isInteger(timestamp) || !signature) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${timestamp}.\`)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

const SANDBOX_SCENARIO_ROWS = [
  ['success', 'Accepted immediately and transitions to delivered'],
  ['temporary_failure', 'Transient provider error on attempts 1–2; succeeds on attempt 3'],
  ['throttled', 'Rate limited on attempt 1 with Retry-After backoff; succeeds on attempt 2'],
  ['delayed_callback', 'Marked sent first, then confirmed delivered after a delayed receipt'],
  ['duplicate_callback', 'Delivers two identical receipts; idempotently settles once'],
  ['ambiguous_timeout', 'Times out as unconfirmed (never auto-resent); late receipt confirms'],
  ['ambiguous_timeout_lost', 'Times out and remains unconfirmed to prevent duplicate sends'],
  ['invalid_recipient', 'Permanent failure — number unreachable on channel'],
  ['permanent_failure', 'Permanent provider rejection; stops retrying immediately'],
  ['expired_otp', 'OTP challenge created already expired for expiry-handling tests'],
];

const HERO_BARS = [
  { label: 'Mon', height: 52, active: false },
  { label: 'Tue', height: 22, active: false },
  { label: 'Wed', height: 34, active: false },
  { label: 'Thu', height: 42, active: false },
  { label: 'Fri', height: 56, active: false },
  { label: 'Sat', height: 92, active: true },
  { label: 'Sun', height: 38, active: false },
  { label: 'Now', height: 58, active: false },
];

const TOOL_MODULES = [
  {
    id: 'otp',
    title: 'WhatsApp OTP Verification',
    summary: 'Verify customer phone numbers directly on WhatsApp with atomic single-use codes and 5-attempt caps.',
    panelLabel: 'WhatsApp OTP Engine',
    metricPrimary: '482,910',
    metricSecondary: '/ 500k cap',
    statusText: 'On Track',
    progressPct: 76,
    leftStatLabel: 'Median Delivery',
    leftStatValue: '1.4 sec',
    rightStatLabel: 'Cryptographic Mode',
    rightStatValue: 'HMAC-SHA256',
    sampleLine: 'Use phone number to verify · Code 482 910 expires in 5 minutes.',
  },
  {
    id: 'invoices',
    title: 'Automated Invoice Receipts',
    summary: 'Compute minor-unit NGN or USD totals, discounts, and VAT, then deliver verified receipts right after checkout.',
    panelLabel: 'Invoice Delivery Pipeline',
    metricPrimary: '₦14,820,000',
    metricSecondary: '/ 30 days',
    statusText: 'Verified',
    progressPct: 88,
    leftStatLabel: 'Receipts Issued',
    leftStatValue: '4,180',
    rightStatLabel: 'Duplicate Sends',
    rightStatValue: '0 blocked',
    sampleLine: 'Receipt #INV-88241 paid · Sent to +234 801 234 5678 via WhatsApp.',
  },
  {
    id: 'updates',
    title: 'Order & Shipping Updates',
    summary: 'Send timely payment, dispatch, and account alerts on WhatsApp or Telegram with verified business links.',
    panelLabel: 'Transactional Alerts',
    metricPrimary: '2 Channels',
    metricSecondary: 'WhatsApp & Telegram',
    statusText: 'Verified Links',
    progressPct: 72,
    leftStatLabel: 'Link Protection',
    leftStatValue: 'Allowlisted',
    rightStatLabel: 'Retry Handling',
    rightStatValue: 'Automatic',
    sampleLine: 'Order #ORD-88241 dispatched · Tracking update delivered on WhatsApp.',
  },
] as const;

const FAQ_ITEMS = [
  {
    num: '01.',
    q: 'Can I test Sendnaro right now without Meta WhatsApp API keys?',
    a: 'Yes. Create a free business account to receive a scoped sn_test_ API key and test invoices, WhatsApp OTP codes, retries, and webhook signatures in Sandbox before going live.',
  },
  {
    num: '02.',
    q: 'How does monthly vs. annual pricing work for Nigerian and global businesses?',
    a: 'You can pay for 1, 2, 3, or any custom number of months — or save up to 33% by paying yearly. Starter scales both price and quota: 50 messages/month on 1-month billing (₦7,000), up to 100 messages/month (1,200/year — 2× bonus) on the 1-year plan (₦60,000). Growth (₦12,000/mo or ₦100,000/yr) and Global Pro ($25/mo or $200/yr) include unlimited messages.',
  },
  {
    num: '03.',
    q: 'What do I need from Meta to go live on WhatsApp?',
    a: 'Create a Meta App with the WhatsApp product enabled, copy your Phone Number ID and Permanent System User Access Token, and save them in Settings → Channels. Sendnaro encrypts your credentials at rest.',
  },
  {
    num: '04.',
    q: 'Can I use Sendnaro for both payment invoices and WhatsApp OTP verification?',
    a: 'Yes. One Sendnaro account and API integration handles both automated payment receipts and WhatsApp phone number verification ("Use phone number to verify") so you do not need separate providers.',
  },
  {
    num: '05.',
    q: 'Are OTP codes or channel credentials ever stored in plaintext?',
    a: 'Never. API keys are hashed, channel credentials are encrypted at rest, and one-time verification codes are generated dynamically and verified with strict attempt limits.',
  },
];

export function MarketingSite({
  page,
  onNavigate,
  onOpenAuth,
  onOpenRegister,
  isAuthenticated,
  onOpenConsole,
}: {
  page: MarketingPage;
  onNavigate: (next: MarketingPage) => void;
  onOpenAuth: () => void;
  onOpenRegister: () => void;
  isAuthenticated: boolean;
  onOpenConsole: () => void;
}) {
  const [platform, setPlatform] = useState<PlatformState | null>(null);
  const [heroTab, setHeroTab] = useState<'volume' | 'whatsapp' | 'curl'>('volume');
  const [activeToolId, setActiveToolId] = useState<(typeof TOOL_MODULES)[number]['id']>('otp');
  const [pricingRegion, setPricingRegion] = useState<'all' | 'nigeria' | 'global'>('all');
  const [billingPreset, setBillingPreset] = useState<BillingPreset>('12');
  const [billingMonths, setBillingMonths] = useState<number>(12);
  const [openFaq, setOpenFaq] = useState<number>(0);

  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    category: 'General' as 'General' | 'Integration' | 'Billing' | 'Security',
    subject: '',
    message: '',
  });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactResult, setContactResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiRequest<PlatformState>('/api/public/platform').then((res) => {
      if (res.ok && res.data) setPlatform(res.data);
    });
  }, [page]);

  const handleContactSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setContactSubmitting(true);
    setContactResult(null);
    const res = await apiRequest<{ id: string }>('/api/public/contact', {
      method: 'POST',
      body: contactForm,
    });
    setContactSubmitting(false);
    if (res.ok) {
      setContactResult({
        ok: true,
        text: `Inquiry received (ref ${res.data?.id}). Our team will follow up by email.`,
      });
      setContactForm({ name: '', email: '', category: 'General', subject: '', message: '' });
    } else {
      setContactResult({
        ok: false,
        text: res.error?.message || 'Unable to submit inquiry. Check all fields and try again.',
      });
    }
  };

  const navItems: { id: MarketingPage; label: string }[] = [
    { id: 'home', label: 'Product' },
    { id: 'about', label: 'About' },
    { id: 'docs', label: 'API Docs' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'security', label: 'Security' },
    { id: 'support', label: 'Support' },
  ];

  const activeTool = TOOL_MODULES.find((m) => m.id === activeToolId) ?? TOOL_MODULES[0];

  const renderPricingCards = () => {
    const visiblePlans = PLANS.filter(
      (p) => pricingRegion === 'all' || p.region === pricingRegion,
    );

    return (
      <div className="mt-8 space-y-6">
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

        <div
          className={`grid gap-6 ${
            visiblePlans.length === 1
              ? 'md:grid-cols-1 max-w-md'
              : visiblePlans.length === 2
                ? 'md:grid-cols-2'
                : 'md:grid-cols-3'
          }`}
        >
          {visiblePlans.map((plan) => {
            const quote = calculatePlanQuote(plan, billingMonths);
            const annualQuote = calculatePlanQuote(plan, 12);
            const isPopular = Boolean(plan.popular);
            const isGlobal = plan.id === 'global_pro';

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-2xl p-7 ${
                  isPopular
                    ? 'border border-[#22C55E]/50 bg-[radial-gradient(ellipse_at_top,rgba(34,197,94,0.12),#0B0F0C_60%)]'
                    : 'border border-white/[0.08] bg-[#0B0F0C]'
                }`}
              >
                <div>
                  <p
                    className={`text-xs font-medium ${
                      isPopular ? 'text-[#4ADE80]' : 'text-[#8B988E]'
                    }`}
                  >
                    {plan.regionLabel}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-semibold text-[#F4F7F4]">
                    {plan.name}
                  </h3>

                  {/* Dynamic Total Price */}
                  <div className="mt-4 flex items-baseline gap-2 flex-wrap">
                    <p className="font-display text-3xl font-bold tracking-tight text-[#F4F7F4] tabular-nums">
                      {formatMajorPrice(quote.totalMajor, quote.currency)}
                    </p>
                    <span className="text-xs font-normal text-[#8B988E]">{quote.periodLabel}</span>
                    {quote.savingsMajor > 0 && (
                      <span className="font-mono text-xs text-[#6E7C71] line-through tabular-nums">
                        {formatMajorPrice(quote.standardMonthlyTotalMajor, quote.currency)}
                      </span>
                    )}
                  </div>

                  {/* Effective Monthly Rate & Savings Breakdown */}
                  <div className="mt-2 min-h-[20px] font-mono text-[11px] tabular-nums">
                    {quote.months > 1 ? (
                      <span className="text-[#4ADE80]">
                        {formatMajorPrice(
                          quote.effectiveMonthlyMajor,
                          quote.currency,
                          quote.currency === 'USD' && !Number.isInteger(quote.effectiveMonthlyMajor),
                        )}
                        /mo · Save {formatMajorPrice(quote.savingsMajor, quote.currency)} (
                        {quote.savingsPct}% off)
                      </span>
                    ) : (
                      <span className="text-[#8B988E]">
                        Standard monthly · Save up to {annualQuote.savingsPct}% on 1 Year
                      </span>
                    )}
                  </div>

                  <p className={`mt-3 text-xs ${isPopular ? 'text-[#9EAFA2]' : 'text-[#8B988E]'}`}>
                    {plan.tagline}
                  </p>

                  <ul
                    className={`mt-6 space-y-3 border-t pt-6 text-xs ${
                      isPopular
                        ? 'border-white/[0.08] text-[#E1EBE3]'
                        : 'border-white/[0.07] text-[#C2CEC5]'
                    }`}
                  >
                    <li className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
                      <strong className="font-semibold text-[#F4F7F4]">{quote.quotaLabel}</strong>
                    </li>
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={isAuthenticated ? onOpenConsole : onOpenRegister}
                  className={`mt-8 w-full rounded-full px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    isPopular
                      ? 'bg-[#22C55E] text-[#050705] hover:bg-[#16A34A]'
                      : isGlobal
                        ? 'bg-[#F4F7F4] text-[#050705] hover:bg-white'
                        : 'border border-white/15 bg-white/[0.03] text-[#F4F7F4] hover:border-white/30 hover:bg-white/[0.07]'
                  }`}
                >
                  Choose {plan.name.replace(' Plan', '')} ({quote.months}{' '}
                  {quote.months === 1 ? 'mo' : 'mos'})
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#050705] text-[#F4F7F4]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#050705]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 border-x border-white/[0.06] px-6">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] rounded-md"
          >
            <BrandMark light />
          </button>

          <nav aria-label="Primary" className="hidden md:flex items-center gap-7">
            {navItems.map((item) => {
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b ${
                    active
                      ? 'border-[#22C55E] text-[#F4F7F4]'
                      : 'border-transparent text-[#8B988E] hover:text-[#F4F7F4]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={isAuthenticated ? onOpenConsole : onOpenAuth}
              className="rounded-full bg-[#F4F7F4] px-5 py-2 text-xs font-semibold text-[#050705] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? 'Open Console' : 'Sign in'}
            </button>
          </div>
        </div>

        {/* Mobile navigation strip */}
        <div className="flex md:hidden items-center gap-5 overflow-x-auto border-t border-white/[0.06] px-6 py-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                page === item.id ? 'text-[#22C55E] font-semibold' : 'text-[#8B988E]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1">
        {page === 'home' && (
          <div className="mx-auto max-w-6xl border-x border-white/[0.06]">
            {/* 1. VALUET-Inspired Hero Split with WhatsApp Emerald Halo */}
            <section className="relative overflow-hidden border-b border-white/[0.06] px-6 py-16 sm:px-10 lg:py-24">
              <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
                <div>
                  <p className="text-xs font-medium text-[#4ADE80]">
                    WhatsApp OTP &amp; Invoicing API · Built for Nigeria &amp; Global
                  </p>
                  <h1 className="mt-4 font-display text-[clamp(2.35rem,4.3vw,3.65rem)] font-bold leading-[1.08] tracking-[-0.03em] text-[#F4F7F4] text-balance">
                    Stop chasing receipts. Deliver on WhatsApp.
                  </h1>
                  <p className="mt-5 max-w-lg text-base leading-relaxed text-[#9AA69D]">
                    One secure API key to send verified payment invoices, WhatsApp phone
                    verification codes, and order updates automatically — backed by a deterministic
                    sandbox and signed webhooks.
                  </p>

                  <div className="mt-8 flex flex-wrap items-center gap-3.5">
                    <button
                      type="button"
                      onClick={isAuthenticated ? onOpenConsole : onOpenRegister}
                      className="inline-flex items-center gap-2 rounded-full bg-[#22C55E] px-6 py-3 text-sm font-semibold text-[#050705] transition-colors hover:bg-[#16A34A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white whitespace-nowrap shrink-0"
                    >
                      {isAuthenticated ? 'Open Console' : 'Create Free Account'}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('docs')}
                      className="rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-medium text-[#E6ECE7] transition-colors hover:border-white/30 hover:bg-white/[0.07] whitespace-nowrap shrink-0"
                    >
                      Read API Docs
                    </button>
                  </div>

                  <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7E8C81]">
                    <span>Sandbox free forever</span>
                    <span aria-hidden="true">·</span>
                    <span>Plans from ₦60,000/yr</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {platform?.billingRequired
                        ? 'Annual live activation ready'
                        : 'Live & Sandbox ready'}
                    </span>
                  </div>
                </div>

                {/* Right: VALUET-Inspired Dark Obsidian Interactive Telemetry & WhatsApp Preview Card */}
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-6 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.20),transparent_70%)] blur-xl"
                  />
                  <div className="relative rounded-2xl border border-white/12 bg-[#0B0F0C] p-6">
                    {/* Functional Segmented Switcher */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] bg-[#060807] p-1">
                        {(
                          [
                            ['volume', 'Delivery'],
                            ['whatsapp', 'WhatsApp UI'],
                            ['curl', 'cURL API'],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setHeroTab(id)}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                              heroTab === id
                                ? 'bg-[#172119] text-[#F4F7F4]'
                                : 'text-[#849287] hover:text-[#F4F7F4]'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 text-[#4ADE80]">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>

                    {heroTab === 'volume' && (
                      <div className="mt-6">
                        <p className="text-xs text-[#849287]">Verified Monthly Volume</p>
                        <div className="mt-1 flex items-baseline justify-between gap-3">
                          <p className="font-display text-3xl font-bold tracking-tight text-[#F4F7F4] tabular-nums">
                            14,820
                            <span className="ml-2 text-xs font-normal text-[#849287]">
                              WhatsApp &amp; Invoices
                            </span>
                          </p>
                          <span className="font-mono text-xs font-medium text-[#4ADE80] tabular-nums">
                            99.8% delivered
                          </span>
                        </div>

                        {/* VALUET Signature Minimal Bar Chart */}
                        <div className="mt-7 grid h-36 grid-cols-8 items-end gap-2.5">
                          {HERO_BARS.map((bar) => (
                            <div key={bar.label} className="flex h-full flex-col items-center justify-end gap-2">
                              <div
                                className={`w-full rounded-t-md transition-opacity ${
                                  bar.active
                                    ? 'bg-[#22C55E] shadow-[0_0_24px_rgba(34,197,94,0.35)]'
                                    : 'bg-[#1A211C] hover:bg-[#232D26]'
                                }`}
                                style={{ height: `${bar.height}%` }}
                              />
                              <span className="font-mono text-[10px] text-[#6D7970]">{bar.label}</span>
                            </div>
                          ))}
                        </div>

                        {/* VALUET Bottom Triggered Event Strip */}
                        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#101612] px-4 py-3.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/15 text-[#4ADE80]">
                              <MessageSquare className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-[#F4F7F4]">
                                Auto-Dispatch Triggered
                              </p>
                              <p className="truncate font-mono text-[11px] text-[#849287]">
                                ORD-88241 · +234 801 234 5678
                              </p>
                            </div>
                          </div>
                          <span className="font-mono text-xs font-semibold text-[#4ADE80] tabular-nums whitespace-nowrap">
                            ₦14,000 Paid
                          </span>
                        </div>
                      </div>
                    )}

                    {heroTab === 'whatsapp' && (
                      <div className="mt-5 space-y-3">
                        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3 text-xs">
                          <span className="font-medium text-[#F4F7F4]">Sendnaro Verified Business</span>
                          <span className="font-mono text-[11px] text-[#4ADE80]">+234 801 234 5678</span>
                        </div>
                        <div className="rounded-xl border border-[#22C55E]/25 bg-[#0F1B13] p-4 text-xs leading-relaxed text-[#E1EBE3]">
                          <p className="font-semibold text-[#4ADE80]">Use phone number to verify</p>
                          <p className="mt-1.5">
                            Your verification code for <strong>Your Business</strong> is{' '}
                            <span className="font-mono text-sm font-bold tracking-wider text-white">
                              482 910
                            </span>
                            . Valid for 5 minutes. Never share this code.
                          </p>
                          <p className="mt-2 text-right font-mono text-[10px] text-[#7E9985]">
                            14:02 · Delivered ✓✓
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/[0.08] bg-[#101612] p-4 text-xs leading-relaxed text-[#D7E2DA]">
                          <p className="font-semibold text-[#F4F7F4]">Payment Receipt · ORD-88241</p>
                          <p className="mt-1 text-[#9AA69D]">
                            Amaka Okafor — ₦14,000.00 confirmed (4x Express Lagos Parcel). View
                            sanitized receipt link anytime.
                          </p>
                          <p className="mt-2 text-right font-mono text-[10px] text-[#7E8C81]">
                            14:03 · Read ✓✓
                          </p>
                        </div>
                      </div>
                    )}

                    {heroTab === 'curl' && (
                      <div className="mt-5">
                        <CodeBlock
                          label="POST /api/v1/invoices · Server request"
                          code={INVOICE_CURL}
                          maxHeight="260px"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Ecosystem / Trust Strip (VALUET Horizontal Band) */}
            <section className="border-b border-white/[0.06] bg-[#070A08] px-6 py-7 sm:px-10">
              <div className="flex flex-wrap items-center justify-between gap-6 text-xs font-medium tracking-wide text-[#7E8C81]">
                <span className="font-display text-sm font-semibold text-[#B5C1B7]">
                  Meta WhatsApp Cloud API
                </span>
                <span className="font-display text-sm font-semibold text-[#B5C1B7]">
                  Telegram Bot API
                </span>
                <span className="font-mono text-xs text-[#9AA69D]">HMAC-SHA256 Webhooks</span>
                <span className="font-mono text-xs text-[#9AA69D]">AES-256-GCM Vault</span>
                <span className="font-display text-sm font-semibold text-[#B5C1B7]">
                  NGN · USD · GBP
                </span>
              </div>
            </section>

            {/* 3. VALUET Asymmetric 3-Card Bento Grid */}
            <section className="border-b border-white/[0.06] px-6 py-20 sm:px-10">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-xs font-medium text-[#4ADE80]">Capabilities</p>
                <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-[#F4F7F4] sm:text-4xl text-balance">
                  Built to deliver faster, never drop twice.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[#9AA69D]">
                  Sendnaro separates tenant keys, verifies phone numbers over WhatsApp, and
                  calculates minor-unit invoices with full delivery traces.
                </p>
              </div>

              <div className="mt-14 grid gap-6 lg:grid-cols-12">
                {/* Left Tall Card (Spans 2 Rows on Desktop) */}
                <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-7 lg:col-span-6 lg:row-span-2">
                  <div>
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#121814] text-[#9AA69D]">
                      <FileText className="h-4 w-4" />
                    </span>
                    <h3 className="mt-5 font-display text-xl font-semibold text-[#F4F7F4]">
                      Delivery Clarity
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#9AA69D]">
                      Every outbound invoice, WhatsApp OTP challenge, and order notification is
                      tracked per channel with idempotency protection and attempt timelines.
                    </p>
                  </div>

                  <div className="mt-10 border-t border-white/[0.07] pt-6">
                    <div className="flex items-center justify-between text-[11px] font-medium text-[#7E8C81]">
                      <span>Active channels</span>
                      <span className="text-[#4ADE80]">Last 30 days</span>
                    </div>

                    <div className="mt-5 space-y-5">
                      {[
                        { label: 'WhatsApp OTP Verification', value: '8,420 sent', pct: 82, highlight: true },
                        { label: 'Automated Invoice Receipts', value: '4,180 sent', pct: 54, highlight: false },
                        { label: 'Shipping & Order Updates', value: '1,640 sent', pct: 31, highlight: false },
                        { label: 'Telegram Opt-in Receipts', value: '580 sent', pct: 16, highlight: false },
                      ].map((row) => (
                        <div key={row.label}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#D4DFD7]">{row.label}</span>
                            <span className="font-mono text-[#9AA69D] tabular-nums">{row.value}</span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#161D18]">
                            <div
                              className={`h-full rounded-full ${
                                row.highlight ? 'bg-[#22C55E]' : 'bg-[#364239]'
                              }`}
                              style={{ width: `${row.pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top-Right Card: Circular Ring Gauge */}
                <div className="flex flex-col justify-between gap-6 rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-7 sm:flex-row sm:items-center lg:col-span-6">
                  <div className="max-w-xs">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#121814] text-[#9AA69D]">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <h3 className="mt-4 font-display text-lg font-semibold text-[#F4F7F4]">
                      WhatsApp OTP Speed
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-[#9AA69D]">
                      HMAC-SHA256 verification codes derived on demand, verified once under
                      concurrency, and capped at 5 attempts.
                    </p>
                  </div>

                  {/* Clean SVG Progress Ring */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className="relative flex h-28 w-28 items-center justify-center">
                      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="#18201B"
                          strokeWidth="8"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="#22C55E"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray="251.2"
                          strokeDashoffset="22"
                        />
                      </svg>
                      <span className="absolute font-mono text-sm font-bold text-[#F4F7F4] tabular-nums">
                        99.8%
                      </span>
                    </div>
                    <span className="mt-2 text-[11px] text-[#8B988E]">Verified delivery</span>
                  </div>
                </div>

                {/* Bottom-Right Card: Area Sparkline */}
                <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-7 lg:col-span-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#121814] text-[#9AA69D]">
                        <ShieldCheck className="h-4 w-4" />
                      </span>
                      <h3 className="mt-4 font-display text-lg font-semibold text-[#F4F7F4]">
                        Automatic Outbox Retries
                      </h3>
                      <p className="mt-2 max-w-sm text-xs leading-relaxed text-[#9AA69D]">
                        Handles rate limits and temporary upstream faults quietly while marking
                        ambiguous timeouts unconfirmed so customers are never spammed.
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-[#4ADE80] whitespace-nowrap">
                      Zero duplicates
                    </span>
                  </div>

                  {/* Clean SVG Emerald Sparkline */}
                  <div className="mt-6">
                    <svg
                      viewBox="0 0 360 80"
                      className="h-20 w-full overflow-visible"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient id="sendnaroSpark" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22C55E" stopOpacity="0.32" />
                          <stop offset="100%" stopColor="#22C55E" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0 68 C45 64, 72 58, 112 50 C152 42, 184 52, 224 36 C268 20, 310 26, 360 12 L360 80 L0 80 Z"
                        fill="url(#sendnaroSpark)"
                      />
                      <path
                        d="M0 68 C45 64, 72 58, 112 50 C152 42, 184 52, 224 36 C268 20, 310 26, 360 12"
                        fill="none"
                        stroke="#22C55E"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                      <circle cx="360" cy="12" r="4" fill="#22C55E" />
                    </svg>
                  </div>
                </div>
              </div>
            </section>

            {/* 4. VALUET 3-Step Horizontal Timeline */}
            <section className="border-b border-white/[0.06] bg-[#070A08] px-6 py-20 sm:px-10">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-xs font-medium text-[#4ADE80]">Setup</p>
                <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-[#F4F7F4] sm:text-4xl text-balance">
                  WhatsApp Delivery in 3 Steps
                </h2>
                <p className="mt-3 text-sm text-[#9AA69D]">
                  No complex message queues. No manual invoice chasing. Just clean integration.
                </p>
              </div>

              <div className="relative mt-14 grid gap-10 md:grid-cols-3">
                {/* Connecting horizontal hairline on desktop */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none hidden md:block absolute top-6 left-[16%] right-[16%] h-px bg-gradient-to-r from-white/10 via-[#22C55E]/70 to-white/10"
                />

                {[
                  {
                    num: '1. Connect',
                    icon: Link2,
                    highlight: false,
                    body: 'Create a scoped sn_test_ or sn_live_ API key and encrypt your Meta WhatsApp credentials with AES-256-GCM.',
                  },
                  {
                    num: '2. Trigger',
                    icon: Sliders,
                    highlight: true,
                    body: 'Call POST /api/v1/otp/challenges or /api/v1/invoices from your checkout or login backend — or test 10 sandbox scenarios.',
                  },
                  {
                    num: '3. Verify',
                    icon: Rocket,
                    highlight: false,
                    body: 'Customers verify via WhatsApp phone number and receive instant payment receipts while your server gets signed webhooks.',
                  },
                ].map((step) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.num} className="relative flex flex-col items-center text-center">
                      <span
                        className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border ${
                          step.highlight
                            ? 'border-[#22C55E]/60 bg-[#0F1E14] text-[#4ADE80] shadow-[0_0_24px_rgba(34,197,94,0.28)]'
                            : 'border-white/12 bg-[#0D120E] text-[#D4DFD7]'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <h3 className="mt-5 font-display text-base font-semibold text-[#F4F7F4]">
                        {step.num}
                      </h3>
                      <p className="mt-2 max-w-xs text-xs leading-relaxed text-[#9AA69D]">
                        {step.body}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 5. VALUET Interactive Split Feature Showcase ("Tools built for real businesses.") */}
            <section className="border-b border-white/[0.06] px-6 py-20 sm:px-10">
              <div>
                <p className="text-xs font-medium text-[#4ADE80]">Core Modules</p>
                <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-[#F4F7F4] sm:text-4xl text-balance">
                  Tools built for real businesses.
                </h2>
              </div>

              <div className="mt-12 grid gap-8 lg:grid-cols-12 lg:items-center">
                {/* Left clickable feature selector list */}
                <div className="space-y-3 lg:col-span-5">
                  {TOOL_MODULES.map((mod) => {
                    const active = mod.id === activeTool.id;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => setActiveToolId(mod.id)}
                        className={`w-full rounded-xl border p-5 text-left transition-colors ${
                          active
                            ? 'border-white/15 bg-[#0F1511]'
                            : 'border-transparent bg-transparent hover:border-white/[0.07] hover:bg-white/[0.02]'
                        }`}
                      >
                        <h3
                          className={`font-display text-base font-semibold ${
                            active ? 'text-[#F4F7F4]' : 'text-[#8B988E]'
                          }`}
                        >
                          {mod.title}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-[#8B988E]">
                          {mod.summary}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Right glowing interactive detail card (VALUET bottom right panel) */}
                <div className="relative lg:col-span-7">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-4 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.16),transparent_70%)] blur-xl"
                  />
                  <div className="relative rounded-2xl border border-white/12 bg-[#0B0F0C] p-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#849287]">{activeTool.panelLabel}</p>
                        <p className="mt-1 font-display text-3xl font-bold tracking-tight text-[#F4F7F4] tabular-nums">
                          {activeTool.metricPrimary}
                          <span className="ml-2 text-xs font-normal text-[#7E8C81]">
                            {activeTool.metricSecondary}
                          </span>
                        </p>
                      </div>
                      <span className="font-mono text-xs font-semibold text-[#4ADE80]">
                        {activeTool.statusText}
                      </span>
                    </div>

                    <div className="mt-6 h-2.5 w-full overflow-hidden rounded-full bg-[#171E19]">
                      <div
                        className="h-full rounded-full bg-[#22C55E] transition-all duration-300"
                        style={{ width: `${activeTool.progressPct}%` }}
                      />
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/[0.07] bg-[#070A08] p-4">
                        <p className="font-display text-xl font-bold text-[#F4F7F4] tabular-nums">
                          {activeTool.leftStatValue}
                        </p>
                        <p className="mt-1 text-xs text-[#7E8C81]">{activeTool.leftStatLabel}</p>
                      </div>
                      <div className="rounded-xl border border-white/[0.07] bg-[#070A08] p-4">
                        <p className="font-display text-xl font-bold text-[#4ADE80] tabular-nums">
                          {activeTool.rightStatValue}
                        </p>
                        <p className="mt-1 text-xs text-[#7E8C81]">{activeTool.rightStatLabel}</p>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/[0.07] pt-5 text-xs text-[#9AA69D]">
                      <span className="truncate font-mono text-[11px]">{activeTool.sampleLine}</span>
                      <button
                        type="button"
                        onClick={isAuthenticated ? onOpenConsole : onOpenRegister}
                        className="inline-flex items-center gap-1 font-semibold text-[#4ADE80] hover:text-white whitespace-nowrap shrink-0"
                      >
                        Get Started
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 6. Annual Pricing Section */}
            <section className="border-b border-white/[0.06] bg-[#070A08] px-6 py-20 sm:px-10">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="max-w-xl">
                  <p className="text-xs font-medium text-[#4ADE80]">
                    Flexible Monthly &amp; Annual Plans · Nigeria First &amp; Global
                  </p>
                  <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-[#F4F7F4] sm:text-4xl text-balance">
                    Pay monthly or save more on longer terms.
                  </h2>
                  <p className="mt-2 text-sm text-[#9AA69D]">
                    Choose 1, 2, 3, or a custom number of months — or save up to 33% when you bill
                    yearly.
                  </p>
                </div>

                {/* Interactive Region Filter */}
                <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#0B0F0C] p-1">
                  {(
                    [
                      ['all', 'All Plans'],
                      ['nigeria', 'Nigeria (NGN)'],
                      ['global', 'Global (USD)'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPricingRegion(id)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                        pricingRegion === id
                          ? 'bg-[#172119] text-[#F4F7F4]'
                          : 'text-[#849287] hover:text-[#F4F7F4]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {renderPricingCards()}
            </section>

            {/* 7. Interactive FAQ Accordion */}
            <section className="px-6 py-20 sm:px-10">
              <div className="mx-auto max-w-3xl">
                <div className="text-center">
                  <p className="text-xs font-medium text-[#4ADE80]">Common Questions</p>
                  <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-[#F4F7F4] sm:text-3xl">
                    Frequently Asked Questions
                  </h2>
                </div>

                <div className="mt-10 divide-y divide-white/[0.08] border-y border-white/[0.08]">
                  {FAQ_ITEMS.map((item, idx) => {
                    const isOpen = openFaq === idx;
                    return (
                      <div key={item.num} className="py-5">
                        <button
                          type="button"
                          onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                          className="flex w-full items-center justify-between gap-4 text-left"
                        >
                          <span className="flex items-baseline gap-3">
                            <span className="font-mono text-xs text-[#4ADE80] tabular-nums">
                              {item.num}
                            </span>
                            <span className="font-display text-sm font-semibold text-[#F4F7F4] sm:text-base">
                              {item.q}
                            </span>
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-[#849287] transition-transform duration-200 ${
                              isOpen ? 'rotate-180 text-[#22C55E]' : ''
                            }`}
                          />
                        </button>
                        {isOpen && (
                          <p className="mt-3 pl-8 text-sm leading-relaxed text-[#9AA69D]">
                            {item.a}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        )}

        {page === 'about' && (
          <div className="mx-auto max-w-6xl border-x border-white/[0.06]">
            {/* About Hero */}
            <section className="border-b border-white/[0.06] px-6 py-16 sm:px-10 lg:py-20">
              <div className="max-w-3xl">
                <p className="text-xs font-medium text-[#4ADE80]">About Sendnaro</p>
                <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#F4F7F4] sm:text-5xl text-balance">
                  Built to make WhatsApp receipts and phone verification effortless for modern businesses.
                </h1>
                <p className="mt-5 text-base leading-relaxed text-[#9AA69D]">
                  Sendnaro is a transactional messaging and verification platform designed for
                  businesses in Nigeria and across the globe. Instead of juggling separate SMS
                  gateways, manual PDF invoices, and brittle webhook scripts, Sendnaro gives your
                  website or app one clean API to verify users via WhatsApp and automatically
                  deliver payment receipts the moment an order is paid.
                </p>
              </div>
            </section>

            {/* The Two Core Pillars */}
            <section className="border-b border-white/[0.06] bg-[#070A08] px-6 py-16 sm:px-10">
              <div className="max-w-2xl">
                <p className="text-xs font-medium text-[#4ADE80]">What Sendnaro Does</p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#F4F7F4] sm:text-3xl">
                  Two essential customer workflows in one platform
                </h2>
              </div>

              <div className="mt-10 grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-7">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/10 text-[#4ADE80]">
                    <KeyRound className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-semibold text-[#F4F7F4]">
                    1. WhatsApp Phone Number Verification (OTP)
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#9AA69D]">
                    SMS delivery can be slow, unreliable, and expensive per message. With Sendnaro,
                    your signup, login, and checkout forms let customers{' '}
                    <strong className="text-[#F4F7F4]">use their phone number to verify</strong>{' '}
                    directly on WhatsApp — where they already spend their day.
                  </p>
                  <ul className="mt-5 space-y-2.5 border-t border-white/[0.07] pt-5 text-xs text-[#C2CEC5]">
                    <li className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
                      <span>Instant 6-digit codes with configurable expiry windows</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
                      <span>Single-use verification with automatic brute-force protection</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
                      <span>Codes are never exposed in logs or stored in plaintext</span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-7">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/10 text-[#4ADE80]">
                    <FileText className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-semibold text-[#F4F7F4]">
                    2. Automated Payment Invoices &amp; Order Alerts
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#9AA69D]">
                    The moment a customer completes payment on your site, Sendnaro calculates exact
                    line items, taxes, and discounts in NGN, USD, GBP, or EUR and dispatches a clean
                    receipt plus a shareable receipt link straight to their WhatsApp or Telegram.
                  </p>
                  <ul className="mt-5 space-y-2.5 border-t border-white/[0.07] pt-5 text-xs text-[#C2CEC5]">
                    <li className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
                      <span>Exact minor-unit totals with zero rounding errors</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
                      <span>Idempotency protection ensures no customer gets billed or messaged twice</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
                      <span>Hosted customer receipt page and downloadable summary included</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* End-to-End System Flow */}
            <section className="border-b border-white/[0.06] px-6 py-16 sm:px-10">
              <div className="max-w-2xl">
                <p className="text-xs font-medium text-[#4ADE80]">How The System Works</p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#F4F7F4] sm:text-3xl">
                  From checkout or sign-up to verified WhatsApp delivery
                </h2>
                <p className="mt-2 text-sm text-[#9AA69D]">
                  Every business workspace is strictly isolated with its own API keys, channel
                  credentials, link allowlist, and delivery history.
                </p>
              </div>

              <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    step: '01',
                    title: 'Create your business',
                    body: 'Register your company, select your country (Nigeria for NGN annual plans or international for USD Global Pro), and receive your initial Sandbox key.',
                  },
                  {
                    step: '02',
                    title: 'Test safely in Sandbox',
                    body: 'Use your sn_test_ key to build and verify invoices, OTP flows, retries, and webhook verification without sending real messages to customers.',
                  },
                  {
                    step: '03',
                    title: 'Connect Meta WhatsApp',
                    body: 'Add your Meta WhatsApp Business Phone Number ID and System User Access Token in Settings. Credentials are encrypted at rest.',
                  },
                  {
                    step: '04',
                    title: 'Go live & track everything',
                    body: 'Switch to your sn_live_ API key. Every invoice, OTP, and shipping alert is tracked in Deliveries with signed webhook callbacks to your server.',
                  },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6"
                  >
                    <span className="font-mono text-xs font-semibold text-[#4ADE80]">
                      STEP {item.step}
                    </span>
                    <h3 className="mt-3 font-display text-base font-semibold text-[#F4F7F4]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-[#9AA69D]">{item.body}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Built for Nigeria First, Ready for Global Scale */}
            <section className="border-b border-white/[0.06] bg-[#070A08] px-6 py-16 sm:px-10">
              <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-7 space-y-4">
                  <p className="text-xs font-medium text-[#4ADE80]">Predictable Annual Plans</p>
                  <h2 className="font-display text-2xl font-bold tracking-tight text-[#F4F7F4] sm:text-3xl">
                    Built for Nigerian businesses first, ready for teams worldwide.
                  </h2>
                  <p className="text-sm leading-relaxed text-[#9AA69D]">
                    Most messaging platforms charge confusing per-message markups that punish your
                    business as you grow. Sendnaro uses simple, transparent yearly plans — starting
                    at <strong className="text-[#F4F7F4]">₦60,000/year</strong> (Starter) and{' '}
                    <strong className="text-[#F4F7F4]">₦100,000/year</strong> (Growth, unlimited
                    for 1 full year) for Nigerian businesses, and{' '}
                    <strong className="text-[#F4F7F4]">$200/year</strong> (Global Pro, unlimited)
                    for international companies.
                  </p>
                  <p className="text-sm leading-relaxed text-[#9AA69D]">
                    Whether you run an online store, logistics company, SaaS product, or fintech
                    checkout, your customers receive fast, trusted WhatsApp messages under your own
                    verified business identity.
                  </p>
                </div>

                <div className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6 space-y-4">
                  <h3 className="font-display text-base font-semibold text-[#F4F7F4]">
                    Ideal for teams building
                  </h3>
                  <ul className="space-y-3 text-xs text-[#C2CEC5]">
                    {[
                      'E-commerce stores sending instant WhatsApp payment receipts',
                      'Fintech & web apps verifying new users by phone number',
                      'Logistics & courier platforms sending live dispatch updates',
                      'Service businesses automating client invoicing without manual PDFs',
                    ].map((line) => (
                      <li key={line} className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#22C55E]" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* Bottom CTA */}
            <section className="px-6 py-16 sm:px-10">
              <div className="rounded-2xl border border-[#22C55E]/25 bg-[radial-gradient(ellipse_at_top,rgba(34,197,94,0.10),#0B0F0C_65%)] p-8 flex flex-wrap items-center justify-between gap-6">
                <div className="max-w-xl">
                  <h2 className="font-display text-xl font-bold text-[#F4F7F4] sm:text-2xl">
                    Ready to automate your WhatsApp invoices and OTPs?
                  </h2>
                  <p className="mt-2 text-sm text-[#9AA69D]">
                    Create your business account in under a minute and explore the Sandbox API for
                    free.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={isAuthenticated ? onOpenConsole : onOpenRegister}
                    className="inline-flex items-center gap-2 rounded-full bg-[#22C55E] px-6 py-3 text-xs font-semibold text-[#050705] hover:bg-[#16A34A] whitespace-nowrap"
                  >
                    {isAuthenticated ? 'Open Console' : 'Create Free Account'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('docs')}
                    className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 text-xs font-semibold text-[#F4F7F4] hover:border-white/30 hover:bg-white/[0.08] whitespace-nowrap"
                  >
                    Explore API Docs
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {page === 'docs' && (
          <section className="mx-auto max-w-6xl border-x border-white/[0.06] px-6 py-16 sm:px-10 space-y-12">
            <div>
              <p className="text-xs font-medium text-[#4ADE80]">API Reference · v1</p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F4F7F4]">
                Server-to-server integration guide
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#9AA69D]">
                Authenticate every v1 request with a Bearer API key (
                <code className="font-mono text-xs text-[#4ADE80]">sn_test_…</code> or{' '}
                <code className="font-mono text-xs text-[#4ADE80]">sn_live_…</code>). Tenant and
                environment are derived exclusively from the key hash — never from request body
                fields.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F0C]">
              <div className="border-b border-white/[0.07] px-6 py-4">
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  Core v1 Endpoints &amp; Required Scopes
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.07] bg-[#080B09] text-xs font-medium text-[#849287]">
                      <th className="px-6 py-3">Method &amp; Path</th>
                      <th className="px-6 py-3">Scope</th>
                      <th className="px-6 py-3">Behaviour</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {[
                      ['POST /api/v1/invoices', 'invoices:create', 'Create minor-unit receipt & enqueue channel delivery (supports Idempotency-Key)'],
                      ['GET /api/v1/invoices/:id', 'invoices:read', 'Fetch tenant-scoped invoice metadata and public receipt link'],
                      ['POST /api/v1/otp/challenges', 'otp:create', 'Issue HMAC-derived WhatsApp OTP challenge (code never stored)'],
                      ['POST /api/v1/otp/challenges/:id/resend', 'otp:create', 'Bump challenge version to invalidate prior code and resend'],
                      ['POST /api/v1/otp/challenges/:id/verify', 'otp:verify', 'Constant-time single-use verification with 5-attempt cap'],
                      ['POST /api/v1/notifications', 'notifications:send', 'Send typed transactional update (300-char max, link allowlist enforced)'],
                      ['GET /api/v1/deliveries/:id', 'deliveries:read', 'Inspect delivery status, attempt log, and retry schedule'],
                      ['POST /api/v1/telegram/link-tokens', 'telegram:link', 'Mint single-use SHA-256 hashed Telegram deep link token'],
                    ].map(([route, scope, desc]) => (
                      <tr key={route} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-3 font-mono text-xs font-medium text-[#F4F7F4] whitespace-nowrap">
                          {route}
                        </td>
                        <td className="px-6 py-3 font-mono text-xs text-[#4ADE80] whitespace-nowrap">
                          {scope}
                        </td>
                        <td className="px-6 py-3 text-xs text-[#9AA69D]">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <CodeBlock label="WhatsApp OTP Challenge & Verify (Node.js)" code={OTP_SNIPPET} />
              <CodeBlock label="Verify Sendnaro-Signature Webhook Header" code={WEBHOOK_VERIFY_SNIPPET} />
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0F0C]">
              <div className="border-b border-white/[0.07] px-6 py-4">
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  Deterministic Sandbox Scenarios
                </h2>
                <p className="mt-1 text-xs text-[#849287]">
                  Pass <code className="font-mono text-[#4ADE80]">scenario</code> on any sandbox
                  request. Rejected automatically on live keys.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.07] bg-[#080B09] text-xs font-medium text-[#849287]">
                      <th className="px-6 py-2.5">Scenario value</th>
                      <th className="px-6 py-2.5">Simulated pipeline behaviour</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {SANDBOX_SCENARIO_ROWS.map(([name, desc]) => (
                      <tr key={name} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-2.5 font-mono text-xs font-medium text-[#F4F7F4] whitespace-nowrap">
                          {name}
                        </td>
                        <td className="px-6 py-2.5 text-xs text-[#9AA69D]">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {page === 'pricing' && (
          <section className="mx-auto max-w-6xl border-x border-white/[0.06] px-6 py-16 sm:px-10">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-xs font-medium text-[#4ADE80]">
                  Flexible Monthly &amp; Annual Billing · Nigeria First &amp; Global
                </p>
                <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F4F7F4]">
                  Pay for 1, 2, 3, custom months — or save big yearly.
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-[#9AA69D]">
                  Start in Sandbox for free. Choose a short monthly term to get moving quickly, or
                  prepay multiple months or a full year to lock in a lower monthly rate.
                </p>
              </div>

              <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#0B0F0C] p-1">
                {(
                  [
                    ['all', 'All Plans'],
                    ['nigeria', 'Nigeria (NGN)'],
                    ['global', 'Global (USD)'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPricingRegion(id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      pricingRegion === id
                        ? 'bg-[#172119] text-[#F4F7F4]'
                        : 'text-[#849287] hover:text-[#F4F7F4]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {renderPricingCards()}

            <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/10 text-[#4ADE80]">
                  <Gift className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-sm font-semibold text-[#F4F7F4]">
                    Want a 7-day complimentary trial for your business?
                  </h2>
                  <p className="mt-0.5 text-xs text-[#9AA69D]">
                    Reach out to our team via Support to request a 1-week live trial before
                    committing to an annual plan.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('support')}
                className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2 text-xs font-semibold text-[#F4F7F4] hover:border-white/30 hover:bg-white/[0.08] whitespace-nowrap"
              >
                Request Trial
              </button>
            </div>
          </section>
        )}

        {page === 'security' && (
          <section className="mx-auto max-w-6xl border-x border-white/[0.06] px-6 py-16 sm:px-10 space-y-10">
            <div className="max-w-2xl">
              <p className="text-xs font-medium text-[#4ADE80]">Security &amp; Trust</p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F4F7F4]">
                Built to protect your business credentials and customer messages
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#9AA69D]">
                Sendnaro enforces strict tenant isolation, strong encryption, and verified message
                signing so your invoices and OTP codes stay private and tamper-proof.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {[
                {
                  title: 'Scoped & Hashed API Keys',
                  body: 'Every Sandbox (sn_test_) and Live (sn_live_) API key is hashed before storage, scoped to specific permissions, and displayed only once at creation.',
                },
                {
                  title: 'Protected WhatsApp OTP Verification',
                  body: 'Verification codes are generated dynamically without plaintext storage, expire automatically, and enforce strict attempt limits to block brute-force attacks.',
                },
                {
                  title: 'Verified Provider Callbacks',
                  body: 'Inbound WhatsApp and Telegram delivery receipts are cryptographically verified before updating any delivery status in your workspace.',
                },
                {
                  title: 'Signed Outbound Webhooks',
                  body: 'Every webhook event sent to your server includes a timestamped HMAC-SHA256 signature header over HTTPS so your backend can verify authenticity and prevent replay.',
                },
                {
                  title: 'Encrypted Channel Credentials',
                  body: 'Your Meta WhatsApp access tokens, Telegram bot tokens, and webhook secrets are encrypted at rest and never exposed in dashboard or API reads.',
                },
                {
                  title: 'Anti-Phishing Link Controls',
                  body: 'Define your approved business domains in Settings so transactional alerts can only include links belonging to your verified websites.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-6"
                >
                  <div className="flex items-center gap-2.5 text-[#F4F7F4]">
                    <Lock className="h-4 w-4 text-[#22C55E]" aria-hidden="true" />
                    <h2 className="font-display text-base font-semibold">{item.title}</h2>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#9AA69D]">{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === 'support' && (
          <section className="mx-auto max-w-6xl border-x border-white/[0.06] px-6 py-16 sm:px-10">
            <div className="mx-auto max-w-2xl">
              <p className="text-xs font-medium text-[#4ADE80]">Support &amp; Security Disclosure</p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F4F7F4]">
                Contact the Sendnaro team
              </h1>
              <p className="mt-2 text-sm text-[#9AA69D]">
                For security disclosures, select <strong className="text-[#F4F7F4]">Security</strong>{' '}
                and include the{' '}
                <code className="font-mono text-xs text-[#4ADE80]">request_id</code> if available.
                Never include live API keys or customer secrets.
              </p>

              <form
                onSubmit={handleContactSubmit}
                className="mt-8 space-y-5 rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-7"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-[#A8B3AA]">Full name</label>
                    <input
                      type="text"
                      required
                      value={contactForm.name}
                      onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Adaeze Nwosu"
                      className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#060807] px-3.5 py-2 text-sm text-[#F4F7F4] placeholder:text-[#5F6B61] focus:border-[#22C55E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#A8B3AA]">Work email</label>
                    <input
                      type="email"
                      required
                      value={contactForm.email}
                      onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="engineering@company.com"
                      className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#060807] px-3.5 py-2 text-sm text-[#F4F7F4] placeholder:text-[#5F6B61] focus:border-[#22C55E] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-[#A8B3AA]">Category</label>
                    <select
                      value={contactForm.category}
                      onChange={(e) =>
                        setContactForm((f) => ({
                          ...f,
                          category: e.target.value as 'General' | 'Integration' | 'Billing' | 'Security',
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#060807] px-3.5 py-2 text-sm text-[#F4F7F4] focus:border-[#22C55E] focus:outline-none"
                    >
                      <option value="General">General</option>
                      <option value="Integration">Integration</option>
                      <option value="Billing">Billing</option>
                      <option value="Security">Security</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#A8B3AA]">Subject</label>
                    <input
                      type="text"
                      required
                      value={contactForm.subject}
                      onChange={(e) => setContactForm((f) => ({ ...f, subject: e.target.value }))}
                      placeholder="Webhook verification question"
                      className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#060807] px-3.5 py-2 text-sm text-[#F4F7F4] placeholder:text-[#5F6B61] focus:border-[#22C55E] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Message</label>
                  <textarea
                    rows={4}
                    required
                    minLength={10}
                    value={contactForm.message}
                    onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                    placeholder="Describe your integration question or include a request_id..."
                    className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#060807] px-3.5 py-2 text-sm text-[#F4F7F4] placeholder:text-[#5F6B61] focus:border-[#22C55E] focus:outline-none"
                  />
                </div>

                {contactResult && (
                  <div
                    className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-xs ${
                      contactResult.ok
                        ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#B6F4CA]'
                        : 'border-red-500/30 bg-red-500/10 text-red-300'
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{contactResult.text}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="inline-flex items-center gap-2 rounded-full bg-[#22C55E] px-6 py-2.5 text-sm font-semibold text-[#050705] transition-colors hover:bg-[#16A34A] disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                  {contactSubmitting ? 'Sending...' : 'Send message'}
                </button>
              </form>
            </div>
          </section>
        )}

        {/* =============================================================== */}
        {/* PRIVACY POLICY (/privacy)                                       */}
        {/* =============================================================== */}
        {page === 'privacy' && (
          <section className="mx-auto max-w-4xl border-x border-white/[0.06] px-6 py-20 space-y-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#4ADE80]">
                Legal · Effective November 2026
              </p>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#F4F7F4] sm:text-4xl">
                Sendnaro Privacy Policy
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#9AA69D]">
                Sendnaro provides business messaging APIs for automated WhatsApp invoices, receipts,
                phone number verification (OTP), and transactional notifications. This Privacy
                Policy explains what data we collect, how we process and protect it, and how you can
                request deletion.
              </p>
            </div>

            <div className="space-y-6 rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-7 text-sm leading-relaxed text-[#C2CEC5]">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  1. Information We Collect
                </h2>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[#9AA69D]">
                  <li>
                    <strong className="text-[#E1EBE3]">Account &amp; Workspace Data:</strong>{' '}
                    Business name, contact email address, country/currency settings, and hashed
                    authentication credentials.
                  </li>
                  <li>
                    <strong className="text-[#E1EBE3]">Messaging &amp; Delivery Metadata:</strong>{' '}
                    Recipient phone numbers (or Telegram chat IDs), invoice/order references,
                    delivery status events (sent, delivered, read, failed), and timestamps needed to
                    deliver transactional messages on behalf of our business customers.
                  </li>
                  <li>
                    <strong className="text-[#E1EBE3]">Channel Credentials:</strong> Meta WhatsApp
                    Cloud API Phone Number IDs, access tokens, and webhook signing secrets, stored
                    encrypted at rest using AES-256-GCM.
                  </li>
                </ul>
              </div>

              <div>
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  2. How We Use Information
                </h2>
                <p className="mt-2 text-[#9AA69D]">
                  We use collected data strictly to deliver business-initiated invoices, payment
                  receipts, one-time verification codes (OTP), and order status updates via Meta
                  WhatsApp Cloud API and Telegram, maintain delivery logs, prevent fraud and abuse,
                  and provide customer support. We never sell personal data or phone numbers to
                  third parties and never use customer messaging data for advertising.
                </p>
              </div>

              <div>
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  3. Security &amp; Data Protection
                </h2>
                <p className="mt-2 text-[#9AA69D]">
                  All traffic is encrypted in transit over HTTPS/TLS. API keys are stored as
                  one-way cryptographic hashes, user passwords are salted and hashed with scrypt,
                  one-time verification codes are never stored in plaintext, and WhatsApp channel
                  tokens are encrypted at rest with AES-256-GCM. Inbound Meta webhooks are verified
                  using HMAC-SHA256 signatures.
                </p>
              </div>

              <div>
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  4. Third-Party Subprocessors
                </h2>
                <p className="mt-2 text-[#9AA69D]">
                  To transmit messages you instruct us to send, delivery payloads are passed to the
                  messaging channel you configure — specifically Meta Platforms, Inc. (WhatsApp
                  Cloud API) or Telegram. Billing payments are processed by authorized payment
                  providers (such as Paystack).
                </p>
              </div>

              <div>
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  5. Data Retention &amp; Deletion
                </h2>
                <p className="mt-2 text-[#9AA69D]">
                  Workspace records and delivery logs are retained only while your account is active
                  or as required for billing and compliance records. You may revoke channel tokens
                  at any time in Console → Settings → Channels, or request full deletion of your
                  account and associated phone numbers at{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('data-deletion')}
                    className="text-[#4ADE80] underline hover:text-[#22C55E]"
                  >
                    User Data Deletion
                  </button>
                  .
                </p>
              </div>

              <div>
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  6. Contact Us
                </h2>
                <p className="mt-2 text-[#9AA69D]">
                  For privacy inquiries, data export requests, or deletion requests, contact us via
                  our{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('support')}
                    className="text-[#4ADE80] underline hover:text-[#22C55E]"
                  >
                    Support page
                  </button>{' '}
                  or email <span className="font-mono text-[#E1EBE3]">privacy@sendnaro.com</span>.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* =============================================================== */}
        {/* TERMS OF SERVICE (/terms)                                       */}
        {/* =============================================================== */}
        {page === 'terms' && (
          <section className="mx-auto max-w-4xl border-x border-white/[0.06] px-6 py-20 space-y-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#4ADE80]">
                Legal · Effective November 2026
              </p>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#F4F7F4] sm:text-4xl">
                Terms of Service
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#9AA69D]">
                By creating a Sendnaro account or calling the Sendnaro API, you agree to these
                Terms of Service and all applicable WhatsApp Business Messaging Policies.
              </p>
            </div>

            <div className="space-y-6 rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-7 text-sm leading-relaxed text-[#C2CEC5]">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  1. Acceptable Use &amp; Recipient Consent
                </h2>
                <p className="mt-2 text-[#9AA69D]">
                  You may only send transactional invoices, payment receipts, OTP verification
                  codes, and account/order updates to recipients who have provided valid consent or
                  initiated a transaction with your business. Spam, phishing, unsolicited bulk
                  messaging, and illegal content are strictly prohibited and result in immediate
                  account suspension.
                </p>
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  2. Billing &amp; Plans
                </h2>
                <p className="mt-2 text-[#9AA69D]">
                  Sandbox testing is free. Production sending requires an active Starter, Growth, or
                  Global Pro subscription for your chosen duration (monthly, multi-month, or annual).
                  Meta WhatsApp conversation fees, if applicable, are billed directly by Meta on
                  your Meta Business account.
                </p>
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                  3. API Credentials &amp; Security
                </h2>
                <p className="mt-2 text-[#9AA69D]">
                  You are responsible for keeping your Sendnaro API keys and Meta WhatsApp access
                  tokens confidential. If you suspect a key has been compromised, rotate or revoke
                  it immediately in Console → API Keys.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* =============================================================== */}
        {/* USER DATA DELETION (/data-deletion)                             */}
        {/* =============================================================== */}
        {page === 'data-deletion' && (
          <section className="mx-auto max-w-4xl border-x border-white/[0.06] px-6 py-20 space-y-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#4ADE80]">
                Data Control · Sendnaro
              </p>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#F4F7F4] sm:text-4xl">
                User Data Deletion Instructions
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#9AA69D]">
                Follow these steps to remove your WhatsApp connection, phone number data, or entire
                Sendnaro workspace at any time.
              </p>
            </div>

            <div className="space-y-5 rounded-2xl border border-white/[0.08] bg-[#0B0F0C] p-7 text-sm leading-relaxed text-[#9AA69D]">
              <ol className="list-decimal space-y-3 pl-5">
                <li>
                  <strong className="text-[#F4F7F4]">Disconnect WhatsApp immediately:</strong> Sign
                  into Sendnaro Console → <strong className="text-[#E1EBE3]">Settings → Channels</strong>{' '}
                  and remove or rotate your saved WhatsApp credentials. You can also revoke app
                  access directly in your Meta Business Settings.
                </li>
                <li>
                  <strong className="text-[#F4F7F4]">Request full account or phone deletion:</strong>{' '}
                  Submit a deletion request via our{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('support')}
                    className="text-[#4ADE80] underline hover:text-[#22C55E]"
                  >
                    Support form
                  </button>{' '}
                  or email <span className="font-mono text-[#E1EBE3]">privacy@sendnaro.com</span>{' '}
                  with your registered business email or recipient phone number and subject{' '}
                  <span className="font-mono text-[#E1EBE3]">Data Deletion Request</span>.
                </li>
                <li>
                  <strong className="text-[#F4F7F4]">Confirmation timeline:</strong> Verified
                  deletion requests are completed within <strong className="text-[#E1EBE3]">7 business days</strong>,
                  permanently erasing stored credentials, workspace profiles, and message delivery
                  logs.
                </li>
              </ol>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-white/[0.07] bg-[#050705]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-x border-white/[0.06] px-6 py-8 text-xs text-[#7E8C81]">
          <div className="flex items-center gap-4">
            <BrandMark light />
            <span>© {new Date().getFullYear()} Sendnaro</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className="transition-colors hover:text-[#F4F7F4]"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onNavigate('privacy')}
              className="transition-colors hover:text-[#F4F7F4]"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => onNavigate('terms')}
              className="transition-colors hover:text-[#F4F7F4]"
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => onNavigate('data-deletion')}
              className="transition-colors hover:text-[#F4F7F4]"
            >
              Data Deletion
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
