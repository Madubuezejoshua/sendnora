/* eslint-disable @next/next/no-img-element */
import { BRAND } from '@sendnaro/shared';
import { cn } from '@sendnaro/ui';

/**
 * Text wordmark until final artwork is supplied. When `BRAND.assets.logo` is set (see
 * packages/shared/src/branding.ts) the image is used instead; no other change is required.
 */
export function Wordmark({ className }: { className?: string }) {
  if (BRAND.assets.logo) {
    return (
      <img
        src={BRAND.assets.logo}
        alt={BRAND.productName}
        className={cn('h-7 w-auto', className)}
      />
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-0.5 text-lg font-semibold tracking-tight',
        className,
      )}
    >
      {BRAND.productName}
      <span aria-hidden="true" className="bg-success size-1.5 rounded-full" />
    </span>
  );
}
