import { useEffect, useState } from 'react';
import { apiRequest, setSessionToken, type SessionUser } from './lib/api';
import { MarketingSite, type MarketingPage } from './components/MarketingSite';
import { AuthModal } from './components/AuthModal';
import { ConsoleWorkspace } from './components/ConsoleWorkspace';
import { PublicReceiptView } from './components/PublicReceiptView';

type AppView = 'marketing' | 'console' | 'receipt';

export default function App() {
  const [view, setView] = useState<AppView>('marketing');
  const [marketingPage, setMarketingPage] = useState<MarketingPage>('home');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [user, setUser] = useState<SessionUser | null>(null);
  const [sandboxKey, setSandboxKey] = useState('');
  const [adminClaimRequired, setAdminClaimRequired] = useState(false);
  const [adminEmailHint, setAdminEmailHint] = useState('admin@sendnaro.com');
  const [receiptToken, setReceiptToken] = useState<string | null>(null);

  useEffect(() => {
    // Check if opened directly on a public receipt URL (/receipt/:token)
    const match = /^\/receipt\/([A-Za-z0-9_-]+)$/.exec(window.location.pathname);
    if (match) {
      setReceiptToken(match[1]!);
      setView('receipt');
    }

    apiRequest<{
      authenticated: boolean;
      user: SessionUser | null;
      adminClaimRequired: boolean;
      adminEmailHint: string;
    }>('/api/auth/status').then((res) => {
      if (res.ok && res.data) {
        setAdminClaimRequired(res.data.adminClaimRequired);
        setAdminEmailHint(res.data.adminEmailHint);
        if (res.data.authenticated && res.data.user) {
          setUser(res.data.user);
        }
      }
    });
  }, []);

  const handleAuthenticated = (signedInUser: SessionUser, starterKey?: string) => {
    setUser(signedInUser);
    if (starterKey) setSandboxKey(starterKey);
    if (signedInUser.isPlatformAdmin) setAdminClaimRequired(false);
    setShowAuthModal(false);
    setView('console');
  };

  const handleInstantSandbox = async () => {
    const res = await apiRequest<{
      token: string;
      user: SessionUser;
      starterSandboxKey?: string;
    }>('/api/auth/sandbox-demo', { method: 'POST' });
    if (res.ok && res.data) {
      setSessionToken(res.data.token);
      handleAuthenticated(res.data.user, res.data.starterSandboxKey);
    } else {
      setShowAuthModal(true);
    }
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
        onNavigate={setMarketingPage}
        onOpenAuth={() => setShowAuthModal(true)}
        onInstantSandbox={handleInstantSandbox}
        isAuthenticated={Boolean(user)}
        onOpenConsole={() => setView('console')}
      />

      {showAuthModal && (
        <AuthModal
          adminClaimRequired={adminClaimRequired}
          adminEmailHint={adminEmailHint}
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={handleAuthenticated}
        />
      )}
    </>
  );
}
