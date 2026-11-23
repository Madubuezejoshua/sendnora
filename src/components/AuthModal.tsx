import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { apiRequest, setSessionToken, type SessionUser } from '../lib/api';
import { BrandMark } from './BrandMark';

type AuthMode = 'signin' | 'register';

export function AuthModal({
  initialMode = 'signin',
  onClose,
  onAuthenticated,
}: {
  initialMode?: AuthMode;
  onClose: () => void;
  onAuthenticated: (user: SessionUser, starterSandboxKey?: string) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [phone, setPhone] = useState('');
  const [currency, setCurrency] = useState<'NGN' | 'USD' | 'GBP' | 'EUR'>('NGN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCountryChange = (c: string) => {
    setCountry(c);
    if (c === 'Nigeria') {
      setCurrency('NGN');
    } else {
      setCurrency('USD');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    if (mode === 'signin') {
      const res = await apiRequest<{ token: string; user: SessionUser }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setBusy(false);
      if (res.ok && res.data) {
        setSessionToken(res.data.token);
        onAuthenticated(res.data.user);
      } else {
        setError(res.error?.message || 'Sign in failed');
      }
      return;
    }

    const res = await apiRequest<{
      token: string;
      user: SessionUser;
      starterSandboxKey?: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: { name, email, password, businessName, country, phone, currency },
    });
    setBusy(false);
    if (res.ok && res.data) {
      setSessionToken(res.data.token);
      onAuthenticated(res.data.user, res.data.starterSandboxKey);
    } else {
      setError(res.error?.message || 'Could not create business account');
    }
  };

  const inputClass =
    'mt-1.5 w-full rounded-lg border border-white/12 bg-[#070A08] px-3.5 py-2 text-sm text-[#F4F7F4] placeholder:text-[#5F6B61] focus:border-[#22C55E] focus:outline-none';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sendnaro console sign in"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0C100D] p-7 shadow-2xl">
        <div className="flex items-center justify-between">
          <BrandMark light />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="rounded-md p-1.5 text-[#7F8D82] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Segmented Auth Mode Switcher */}
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-white/[0.07] bg-[#070A08] p-1">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              mode === 'signin'
                ? 'bg-[#171F19] text-[#F4F7F4]'
                : 'text-[#89968C] hover:text-[#F4F7F4]'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              mode === 'register'
                ? 'bg-[#171F19] text-[#F4F7F4]'
                : 'text-[#89968C] hover:text-[#F4F7F4]'
            }`}
          >
            Create business
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === 'signin' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#A8B3AA]">Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@business.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#A8B3AA]">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className={inputClass}
                />
              </div>
            </>
          )}

          {mode === 'register' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Your name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tunde Adeyemi"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Country</label>
                  <select
                    value={country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className={inputClass}
                  >
                    <option value="Nigeria">Nigeria (₦60k–₦100k/yr)</option>
                    <option value="United States">United States ($200/yr)</option>
                    <option value="United Kingdom">United Kingdom ($200/yr)</option>
                    <option value="Canada">Canada ($200/yr)</option>
                    <option value="Other">Other Country ($200/yr)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">Business name</label>
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Acme Logistics Ltd"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A8B3AA]">
                    WhatsApp phone
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+2348012345678"
                    className={`${inputClass} font-mono text-xs`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A8B3AA]">Work email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dev@acmelogistics.com"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A8B3AA]">
                  Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a strong password"
                  className={inputClass}
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[#22C55E] px-4 py-2.5 text-sm font-semibold text-[#050705] transition-colors hover:bg-[#16A34A] disabled:opacity-60"
          >
            {busy
              ? 'Verifying...'
              : mode === 'signin'
                ? 'Sign in to console'
                : 'Create business account'}
          </button>
        </form>
      </div>
    </div>
  );
}
