import type { Metadata, Viewport } from 'next';
import { BRAND } from '@sendnaro/shared';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: `${BRAND.productName} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.productName}`,
  },
  description: BRAND.description,
  applicationName: BRAND.productName,
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    siteName: BRAND.productName,
    title: `${BRAND.productName} — ${BRAND.tagline}`,
    description: BRAND.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.productName} — ${BRAND.tagline}`,
    description: BRAND.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
