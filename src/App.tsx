import { useEffect, useState, type FormEvent } from 'react';
import { Shield } from 'lucide-react';
import { apiRequest, setSessionToken, type SessionUser } from './lib/api';
import { MarketingSite, type MarketingPage } from './components/MarketingSite';
import { AuthModal } from './components/AuthModal';
import { ConsoleWorkspace } from './components/ConsoleWorkspace';
import { PublicReceiptView } from './components/PublicReceiptView';
import { BrandMark } from './components/BrandMark';

type AppView = 'marketing' | 'console' | 'receipt' | 'admin_setup';

const PATH_TO_MARKETING_PAGE: Record<string, MarketingPage> = {
  '/': 'home',
  '/about': 'about',
  '/docs': 'docs',
  '/pricing': 'pricing',
  '/security': 'security',
  '/support': 'support',
  '/privacy': 'privacy',
  '/privacy-policy': 'privacy',
  '/terms': 'terms',
  '/data-deletion': 'data-deletion',
};

const MARKETING_PAGE_TO_PATH: Record<MarketingPage, string> = {
  home: '/',
  about: '/about',
  docs: '/docs',
  pricing: '/pricing',
  security: '/security',
  support: '/support',
  privacy: '/privacy',
  terms: '/terms',
  'data-deletion': '/data-deletion',
};

export default function App() {
  const [view, setView] = useState<AppView>('marketing');
  const [marketingPage, setMarketingPage] = useState<MarketingPage>(() => {
    const normalized = window.location.pathname.replace(/\/+$/, '') || '/';
    return PATH_TO_MARKETING_PAGE[normalized] ?? 'home';
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'register'>('signin');

  const [user, setUser] = useState<SessionUser | null>(null);
  const [sandboxKey, setSandboxKey] = useState('');
  const [adminClaimRequired, setAdminClaimRequired] = useState(false);
  const [receiptToken, setReceiptToken] = useState<string | null>(null);

  // Private owner-only setup form state (accessible only at /admin-setup)
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    const syncFromPath = () => {
      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      const receiptMatch = /^\/receipt\/([A-Za-z0-9_-]+)$/.exec(path);
      if (receiptMatch) {
        setReceiptToken(receiptMatch[1]!);
        setView('receipt');
      } else if (path === '/admin-setup') {
        setView('admin_setup');
      } else if (PATH_TO_MARKETING_PAGE[path]) {
        setMarketingPage(PATH_TO_MARKETING_PAGE[path]!);
        setView('marketing');
      }
    };

    syncFromPath();
    window.addEventListener('popstate', syncFromPath);

    apiRequest<{
      authenticated: boolean;
      user: SessionUser | null;
      adminClaimRequired: boolean;
    }>('/api/auth/status').then((res) => {
      if (res.ok && res.data) {
        setAdminClaimRequired(res.data.adminClaimRequired);
        if (res.data.authenticated && res.data.user) {
          setUser(res.data.user);
        }
      }
    });

    return () => window.removeEventListener('popstate', syncFromPath);
  }, []);

  const navigateMarketing = (next: MarketingPage) => {
    setMarketingPage(next);
    setView('marketing');
    const targetPath = MARKETING_PAGE_TO_PATH[next] || '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuthenticated = (signedInUser: SessionUser, starterKey?: string) => {
    setUser(signedInUser);
    if (starterKey) setSandboxKey(starterKey);
    if (signedInUser.isPlatformAdmin) setAdminClaimRequired(false);
    setShowAuthModal(false);
    setView('console');
  };

  const openAuth = (mode: 'signin' | 'register' = 'signin') => {
    setAuthInitialMode(mode);
    setShowAuthModal(true);
  };

  const handleSignOut = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    setSessionToken(null);
    setUser(null);
    setSandboxKey('');
    setView('marketing');
    setMarketingPage('home');
  };

  const handleOpenReceipt = (token: string) => {
    setReceiptToken(token);
    setView('receipt');
  };

  const handleAdminClaimSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSetupBusy(true);
    setSetupError(null);
    const res = await apiRequest<{ token: string; user: SessionUser }>('/api/auth/claim-admin', {
      method: 'POST',
      body: { email: setupEmail, password: setupPassword },
    });
    setSetupBusy(false);
    if (res.ok && res.data) {
      setSessionToken(res.data.token);
      window.history.replaceState({}, '', '/');
      handleAuthenticated(res.data.user);
    } else {
      setSetupError(res.error?.message || 'Unable to complete owner setup');
    }
  };

  if (view === 'admin_setup') {
    return (
      <div className="min-h-screen bg-[#050705] text-[#F4F7F4] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0B0F0C] p-7 space-y-5">
          <div className="flex items-center justify-between">
            <BrandMark light />
            <Shield className="h-4 w-4 text-[#22C55E]" />
          </div>

          {adminClaimRequired ? (
            <>
              <div>
                <h1 className="font-display text-lg font-semibold text-[#F4F7F4]">
                  Platform Owner Setup
                </h1>
                <p className="mt-1 text-xs text-[#8B988E]">
                  Create your initial Platform Owner credentials. This setup page locks permanently
                  after completion.
                </p>
              </div>
              <form onSubmit={handleAdminClaimSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Owner email</label>
                  <input
                    type="email"
                    required
                    value={setupEmail}
                    onChange={(e) => setSetupEmail(e.target.value)}
                    placeholder="owner@sendnaro.com"
                    className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#070A08] px-3.5 py-2 text-sm text-[#F4F7F4] placeholder:text-[#5F6B61] focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">
                    Password (min 10 chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={10}
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="Choose a strong password"
                    className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#070A08] px-3.5 py-2 text-sm text-[#F4F7F4] placeholder:text-[#5F6B61] focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
                {setupError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                    {setupError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={setupBusy}
                  className="w-full rounded-lg bg-[#22C55E] px-4 py-2.5 text-sm font-semibold text-[#050705] hover:bg-[#16A34A] disabled:opacity-60"
                >
                  {setupBusy ? 'Configuring...' : 'Complete setup'}
                </button>
              </form>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[#9AA69D]">
                Platform setup is already complete. Sign in with your account credentials to access
                the console.
              </p>
              <button
                type="button"
                onClick={() => {
                  window.history.replaceState({}, '', '/');
                  setView('marketing');
                  openAuth('signin');
                }}
                className="w-full rounded-lg bg-[#22C55E] px-4 py-2.5 text-sm font-semibold text-[#050705] hover:bg-[#16A34A]"
              >
                Go to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'receipt' && receiptToken) {
    return (
      <PublicReceiptView
        token={receiptToken}
        onBack={() => {
          setReceiptToken(null);
          setView(user ? 'console' : 'marketing');
        }}
      />
    );
  }

  if (view === 'console' && user) {
    return (
      <ConsoleWorkspace
        user={user}
        sandboxKey={sandboxKey}
        onChangeSandboxKey={setSandboxKey}
        onSignOut={handleSignOut}
        onViewMarketing={() => {
          setMarketingPage('docs');
          setView('marketing');
        }}
        onOpenReceipt={handleOpenReceipt}
      />
    );
  }

  return (
    <>
      <MarketingSite
        page={marketingPage}
        onNavigate={navigateMarketing}
        onOpenAuth={() => openAuth('signin')}
        onOpenRegister={() => openAuth('register')}
        isAuthenticated={Boolean(user)}
        onOpenConsole={() => setView('console')}
      />

      {showAuthModal && (
        <AuthModal
          initialMode={authInitialMode}
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={handleAuthenticated}
        />
      )}
    </>
  );
}
