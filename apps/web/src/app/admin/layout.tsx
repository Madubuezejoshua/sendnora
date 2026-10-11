import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BRAND } from '@sendnaro/shared';
import { auth } from '@/auth';

const ADMIN_LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/billing', label: 'Billing' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/workspaces', label: 'Businesses' },
  { href: '/admin/webhook-events', label: 'Webhook events' },
  { href: '/admin/support-tickets', label: 'Support tickets' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.isPlatformAdmin) redirect('/console');

  return (
    <div className="min-h-screen">
      <header className="border-border bg-primary text-primary-foreground border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/admin" className="font-semibold">
            {BRAND.productName} Admin
          </Link>
          <Link href="/console" className="text-sm opacity-80 hover:opacity-100">
            Back to console
          </Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-4 overflow-x-auto px-4 pb-3 text-sm sm:px-6">
          {ADMIN_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap opacity-90 hover:underline hover:opacity-100"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
