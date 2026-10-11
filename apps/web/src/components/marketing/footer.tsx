import Link from 'next/link';
import { BRAND } from '@invoicetap/shared';

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/templates', label: 'Templates' },
      { href: '/security', label: 'Security' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms of Service' },
      { href: '/refund-policy', label: 'Refund Policy' },
      { href: '/cookie-policy', label: 'Cookie Policy' },
      { href: '/acceptable-use', label: 'Acceptable Use' },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-border bg-muted/30 border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">
              {BRAND.shortName[0]}
            </span>
            <span>{BRAND.productName}</span>
          </Link>
          <p className="text-muted-foreground mt-3 max-w-xs text-sm">{BRAND.tagline}</p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground text-sm"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-border text-muted-foreground border-t px-4 py-6 text-center text-xs sm:px-6">
        © {new Date().getFullYear()} {BRAND.productName}. All rights reserved.
      </div>
    </footer>
  );
}
