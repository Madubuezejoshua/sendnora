import type { Metadata } from 'next';
import { Lock, ShieldCheck, KeyRound, Eye, Server, FileWarning } from 'lucide-react';
import { Card } from '@invoicetap/ui';

export const metadata: Metadata = {
  title: 'Security',
  description: 'How InvoiceTap protects your business and customer data.',
  alternates: { canonical: '/security' },
};

const CONTROLS = [
  {
    icon: Lock,
    title: 'Password security',
    description:
      'Passwords are hashed with Argon2id, the OWASP-recommended algorithm — never stored or logged in plain text.',
  },
  {
    icon: KeyRound,
    title: 'Two-factor authentication',
    description:
      'Optional TOTP-based 2FA with single-use recovery codes for account takeover protection.',
  },
  {
    icon: ShieldCheck,
    title: 'Tenant isolation',
    description:
      "Every business workspace is isolated at the database and API layer — automated tests verify one workspace can never read another's data.",
  },
  {
    icon: Server,
    title: 'Encrypted secrets',
    description:
      'Payment provider credentials you connect are encrypted at rest with AES-256-GCM and never displayed again after saving.',
  },
  {
    icon: Eye,
    title: 'Audit logging',
    description:
      'Sensitive actions — payments, void/refund, ownership transfers — are recorded in an audit trail.',
  },
  {
    icon: FileWarning,
    title: 'Webhook verification',
    description:
      'Payment webhooks are cryptographically verified and re-checked against the provider directly before anything is marked paid.',
  },
];

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Security & trust</h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-xl">
          Your business and customer data deserves to be handled carefully. Here&apos;s how we
          approach it.
        </p>
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {CONTROLS.map((c) => (
          <Card key={c.title} className="p-6">
            <c.icon className="text-primary size-6" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">{c.title}</h2>
            <p className="text-muted-foreground mt-1.5 text-sm">{c.description}</p>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground mx-auto mt-12 max-w-2xl text-center text-sm">
        Found a security issue? We&apos;d appreciate a private report — see our vulnerability
        disclosure process at{' '}
        <a href="mailto:security@invoicetap.app" className="underline underline-offset-2">
          security@invoicetap.app
        </a>
        .
      </p>
    </div>
  );
}
