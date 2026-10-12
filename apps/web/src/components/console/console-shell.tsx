'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge, cn } from '@sendnaro/ui';
import { Wordmark } from '@/components/brand/wordmark';
import { UserMenu } from '@/components/app/user-menu';

const NAV = [
  { href: '/console', label: 'Integration', exact: true },
  { href: '/console/keys', label: 'API keys' },
  { href: '/console/deliveries', label: 'Deliveries' },
  { href: '/console/settings', label: 'Settings' },
  { href: '/console/activation', label: 'Activation' },
];

export function ConsoleShell({
  businessName,
  role,
  userName,
  userEmail,
  isPlatformAdmin,
  children,
}: {
  businessName: string;
  role: string;
  userName: string;
  userEmail: string;
  isPlatformAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="bg-background focus:ring-ring sr-only rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:ring-2"
      >
        Skip to content
      </a>
      <header className="border-border bg-background sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/console" aria-label="Sendnaro console home">
              <Wordmark />
            </Link>
            <span
              className="text-muted-foreground hidden truncate text-sm sm:block"
              title={businessName}
            >
              {businessName}
            </span>
            {role === 'WORKSPACE_OWNER' || role === 'WORKSPACE_ADMIN' ? null : (
              <Badge variant="outline">read only</Badge>
            )}
          </div>
          <UserMenu name={userName} email={userEmail} isPlatformAdmin={isPlatformAdmin} />
        </div>
        <nav
          aria-label="Console"
          className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 sm:px-5"
        >
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
                  active
                    ? 'border-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
