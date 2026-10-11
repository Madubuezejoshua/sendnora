import Link from 'next/link';
import { BRAND } from '@invoicetap/shared';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/30 flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold">
        <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">
          {BRAND.shortName[0]}
        </span>
        <span>{BRAND.productName}</span>
      </Link>
      <div className="border-border bg-card shadow-card w-full max-w-sm rounded-lg border p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}
