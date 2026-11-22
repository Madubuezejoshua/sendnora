import { useEffect, useState } from 'react';
import {
  Terminal,
  KeyRound,
  Activity,
  Settings,
  Zap,
  Shield,
  LogOut,
  CheckCircle2,
  Circle,
  ExternalLink,
  Gauge,
} from 'lucide-react';
import { apiRequest, type SessionUser } from '../lib/api';
import { BrandMark } from './BrandMark';
import { PlaygroundPanel } from './PlaygroundPanel';
import { KeysView } from './KeysView';
import { DeliveriesView } from './DeliveriesView';
import { SettingsView } from './SettingsView';
import { ActivationView } from './ActivationView';
import { AdminView } from './AdminView';
import { PerformanceView } from './PerformanceView';

export type ConsoleTab =
  | 'integration'
  | 'keys'
  | 'deliveries'
  | 'settings'
  | 'activation'
  | 'performance'
  | 'admin';

interface OverviewData {
  business: {
    id: string;
    name: string;
    contactEmail: string;
    currency: string;
    suspendedAt?: string;
    suspendedReason?: string;
  };
  metrics: {
    totalDeliveries: number;
    deliveredCount: number;
    failedCount: number;
    queuedCount: number;
    activeKeys: number;
    webhookEndpoints: number;
  };
  activation: {
    liveAllowed: boolean;
    billingRequired: boolean;
  };
  checklist: { id: string; label: string; done: boolean }[];
}

export function ConsoleWorkspace({
  user,
  sandboxKey,
  onChangeSandboxKey,
  onSignOut,
  onViewMarketing,
  onOpenReceipt,
}: {
  user: SessionUser;
  sandboxKey: string;
  onChangeSandboxKey: (key: string) => void;
  onSignOut: () => void;
  onViewMarketing: () => void;
  onOpenReceipt: (token: string) => void;
}) {
  const [tab, setTab] = useState<ConsoleTab>('integration');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const loadOverview = async () => {
    const res = await apiRequest<OverviewData>('/api/console/overview');
    if (res.ok && res.data) setOverview(res.data);
  };

  useEffect(() => {
    loadOverview();
  }, [refreshSignal, tab]);

  const bumpRefresh = () => setRefreshSignal((n) => n + 1);

  const navItems: { id: ConsoleTab; label: string; icon: typeof Terminal; adminOnly?: boolean }[] = [
    { id: 'integration', label: 'Integration', icon: Terminal },
    { id: 'keys', label: 'API keys', icon: KeyRound },
    { id: 'deliveries', label: 'Deliveries', icon: Activity },
    { id: 'performance', label: 'Speed & Perf', icon: Gauge },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'activation', label: 'Activation', icon: Zap },
    ...(user.isPlatformAdmin
      ? [{ id: 'admin' as const, label: 'Platform Admin', icon: Shield, adminOnly: true }]
      : []),
  ];

  const currentTitle = navItems.find((n) => n.id === tab)?.label ?? 'Integration';

  return (
    <div className="min-h-screen bg-[#050705] text-[#F4F7F4] flex">
      {/* Left Sidebar (Desktop) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-white/[0.07] lg:bg-[#080B09]">
        <div className="flex h-16 items-center border-b border-white/[0.07] px-6">
          <button
            type="button"
            onClick={onViewMarketing}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] rounded-md"
          >
            <BrandMark light />
          </button>
        </div>

        <div className="border-b border-white/[0.06] px-6 py-4">
          <p className="text-[11px] font-medium text-[#7E8C81]">Business workspace</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-[#F4F7F4]">
            {overview?.business.name ?? user.workspaceName}
          </p>
        </div>

        <nav aria-label="Console sidebar" className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#22C55E]/15 text-[#4ADE80] border border-[#22C55E]/30'
                    : 'border border-transparent text-[#8B988E] hover:bg-white/[0.04] hover:text-[#F4F7F4]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.07] p-4 space-y-2.5 text-xs">
          <div className="px-2">
            <p className="truncate font-medium text-[#F4F7F4]">{user.name}</p>
            <p className="truncate text-[#7E8C81]">{user.email}</p>
          </div>
          <div className="flex items-center justify-between gap-2 px-2 pt-1">
            <button
              type="button"
              onClick={onViewMarketing}
              className="inline-flex items-center gap-1 text-[#8B988E] hover:text-[#F4F7F4]"
            >
              Docs
              <ExternalLink className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1 text-[#8B988E] hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Breadcrumb Bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-6 border-b border-white/[0.07] bg-[#050705]/90 px-6 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <span className="lg:hidden">
              <BrandMark light />
            </span>
            <span className="hidden lg:inline text-[#6E7C71]">Console</span>
            <span className="hidden lg:inline text-[#39453B]">/</span>
            <span className="font-display font-semibold text-[#F4F7F4] truncate">
              {currentTitle}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs shrink-0">
            <span className="hidden sm:inline text-[#849287]">
              {overview?.activation.liveAllowed ? 'Live & Sandbox ready' : 'Sandbox mode'}
            </span>
            <button
              type="button"
              onClick={() => setTab('keys')}
              className="rounded-full bg-[#22C55E] px-4 py-2 text-xs font-semibold text-[#050705] hover:bg-[#16A34A] whitespace-nowrap shrink-0"
            >
              Create API key
            </button>
          </div>
        </header>

        {/* Mobile Nav Strip */}
        <div className="flex lg:hidden items-center gap-2 overflow-x-auto border-b border-white/[0.07] bg-[#080B09] px-4 py-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                tab === item.id
                  ? 'bg-[#22C55E]/15 text-[#4ADE80]'
                  : 'text-[#8B988E]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          {overview?.business.suspendedAt && (
            <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">
              <strong>Account suspended:</strong>{' '}
              {overview.business.suspendedReason || 'API sending is currently blocked by platform admin.'}
            </div>
          )}

          {tab === 'integration' && (
            <div className="space-y-8">
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F4F7F4]">
                  Integration &amp; Sandbox
                </h1>
                <p className="mt-1 text-sm text-[#9AA69D]">
                  Verify invoices, WhatsApp OTP codes, anti-phishing notification rules, and
                  Telegram customer links against the live server pipeline.
                </p>
              </div>

              {/* Metrics Strip */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  ['Total deliveries', overview?.metrics.totalDeliveries ?? 0],
                  ['Delivered', overview?.metrics.deliveredCount ?? 0],
                  ['Active API keys', overview?.metrics.activeKeys ?? 0],
                  ['Signed webhooks', overview?.metrics.webhookEndpoints ?? 0],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-white/[0.08] bg-[#0B0F0C] p-5"
                  >
                    <p className="text-xs text-[#849287]">{label}</p>
                    <p className="mt-1.5 font-display text-2xl font-semibold text-[#F4F7F4] tabular-nums">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Interactive Sandbox Playground */}
              <PlaygroundPanel
                sandboxKey={sandboxKey}
                onChangeSandboxKey={onChangeSandboxKey}
                onOpenReceipt={onOpenReceipt}
                onActivity={bumpRefresh}
              />

              {/* Onboarding Checklist */}
              {overview && (
                <div className="rounded-xl border border-white/[0.08] bg-[#0B0F0C] p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-semibold text-[#F4F7F4]">
                      Integration readiness checklist
                    </h2>
                    <span className="font-mono text-xs text-[#849287] tabular-nums">
                      {overview.checklist.filter((c) => c.done).length}/{overview.checklist.length}{' '}
                      complete
                    </span>
                  </div>
                  <ul className="mt-4 divide-y divide-white/[0.06]">
                    {overview.checklist.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 py-3 text-sm">
                        {item.done ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#22C55E]" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-[#3C493F]" />
                        )}
                        <span className={item.done ? 'text-[#F4F7F4]' : 'text-[#8B988E]'}>
                          {item.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'keys' && <KeysView onUseSandboxKey={onChangeSandboxKey} />}
          {tab === 'deliveries' && <DeliveriesView refreshSignal={refreshSignal} />}
          {tab === 'performance' && <PerformanceView sandboxKey={sandboxKey} />}
          {tab === 'settings' && <SettingsView />}
          {tab === 'activation' && <ActivationView />}
          {tab === 'admin' && user.isPlatformAdmin && <AdminView />}
        </main>
      </div>
    </div>
  );
}
