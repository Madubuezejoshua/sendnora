import Link from 'next/link';
import { BRAND } from '@sendnaro/shared';
import { Wordmark } from '@/components/brand/wordmark';

const LINKS = [
  { href: '/docs', label: 'API docs' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Support' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

export function MarketingFooter() {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <Wordmark />
          <p className="text-muted-foreground mt-2 max-w-xs text-sm">{BRAND.tagline}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-border border-t">
        <p className="text-muted-foreground mx-auto max-w-6xl px-4 py-4 text-xs sm:px-6">
          &copy; {new Date().getFullYear()} {BRAND.productName}. WhatsApp is a trademark of Meta
          Platforms, Inc.; Telegram is a trademark of Telegram FZ-LLC. {BRAND.productName} is not
          affiliated with or endorsed by either company.
        </p>
      </div>
    </footer>
  );
}
