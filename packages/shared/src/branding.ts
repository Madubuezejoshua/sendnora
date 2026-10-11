/**
 * Centralized product branding. Nothing outside this module should hardcode the product name,
 * domain or colours.
 *
 * LOGO / FAVICON SLOTS: until final artwork is supplied the UI renders a restrained text wordmark.
 * To install artwork, drop the files in apps/web/public/brand/ and set the paths below
 * (for example `logo: '/brand/logo.svg'`, `icon: '/brand/icon.png'`, `favicon: '/brand/favicon.ico'`).
 * No other code change is needed.
 */
export const BRAND = {
  productName: 'Sendnaro',
  shortName: 'Sendnaro',
  /** Intended production domain. Writing it here does not mean it is deployed or configured. */
  domain: 'sendnaro.com',
  tagline: 'Customer messages, delivered automatically.',
  description:
    'Connect your website or app to send invoices, WhatsApp verification codes, and order updates through one API.',
  colors: {
    primary: '#0B1B33',
    accent: '#0E9F6E',
    warning: '#B45309',
    destructive: '#DC2626',
  },
  /** Configurable artwork slots. `null` means "use the text wordmark". */
  assets: {
    logo: null as string | null,
    icon: null as string | null,
    favicon: null as string | null,
  },
} as const;

export type Brand = typeof BRAND;
