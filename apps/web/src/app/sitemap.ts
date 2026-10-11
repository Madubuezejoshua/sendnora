import type { MetadataRoute } from 'next';

const MARKETING_PATHS = [
  '',
  '/features',
  '/pricing',
  '/templates',
  '/security',
  '/faq',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/refund-policy',
  '/cookie-policy',
  '/acceptable-use',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return MARKETING_PATHS.map((path) => ({
    url: `${appUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.6,
  }));
}
