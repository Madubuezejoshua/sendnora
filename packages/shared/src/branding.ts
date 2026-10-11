/**
 * Centralized product branding.
 *
 * "InvoiceTap" is a working name — the whole product must be renameable by
 * editing this one file (plus swapping the logo/favicon assets referenced
 * here). Nothing outside this module should hardcode the product name,
 * support email, or social handles. See HANDOVER.md for the full rebrand
 * checklist.
 */
export const BRAND = {
  productName: 'InvoiceTap',
  shortName: 'InvoiceTap',
  legalEntityName: 'InvoiceTap',
  tagline: 'Invoices, quotes and receipts your customers can pay in minutes.',
  description:
    'InvoiceTap helps freelancers and small businesses create professional invoices and quotes, get paid online, and share documents instantly over WhatsApp and email.',
  domain: 'invoicetap.app',
  supportEmail: 'support@invoicetap.app',
  salesEmail: 'hello@invoicetap.app',
  socials: {
    twitter: '',
    linkedin: '',
    instagram: '',
  },
  colors: {
    primary: '#0F172A', // deep navy/slate
    accent: '#10B981', // emerald/teal success
    warning: '#F59E0B', // amber
    destructive: '#EF4444', // red
  },
  logo: {
    lightPath: '/brand/logo-light.svg',
    darkPath: '/brand/logo-dark.svg',
    iconPath: '/brand/icon.svg',
  },
} as const;

export type Brand = typeof BRAND;
