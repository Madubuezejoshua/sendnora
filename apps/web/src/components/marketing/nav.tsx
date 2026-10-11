'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Button, cn } from '@sendnaro/ui';
import { Wordmark } from '@/components/brand/wordmark';

const LINKS = [
  { href: '/docs', label: 'API docs' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Support' },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <header className="border-border bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Sendnaro home" onClick={() => setOpen(false)}>
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
              className={cn(
                'text-muted-foreground hover:text-foreground text-sm font-medium transition-colors',
                pathname === link.href && 'text-foreground',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Start testing</Link>
          </Button>
        </div>

        <button
          type="button"
          className="focus-visible:ring-ring rounded-md p-2 focus-visible:outline-none focus-visible:ring-2 md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="border-border bg-background border-t px-4 py-4 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="hover:bg-accent rounded-md px-3 py-2.5 text-sm font-medium"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex gap-2">
              <Button variant="outline" asChild className="flex-1">
                <Link href="/login" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
              <Button asChild className="flex-1">
                <Link href="/register" onClick={() => setOpen(false)}>
                  Start testing
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
