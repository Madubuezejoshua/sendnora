import type { MetadataRoute } from 'next';
import { BRAND } from '@sendnaro/shared';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.productName,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: '/console',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: BRAND.colors.primary,
    // Icons are added once final artwork is configured in packages/shared/src/branding.ts.
    icons: BRAND.assets.icon ? [{ src: BRAND.assets.icon, sizes: 'any' }] : [],
  };
}
