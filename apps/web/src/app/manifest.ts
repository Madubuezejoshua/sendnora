import type { MetadataRoute } from 'next';
import { BRAND } from '@invoicetap/shared';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.productName,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: BRAND.colors.primary,
    icons: [{ src: '/brand/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
