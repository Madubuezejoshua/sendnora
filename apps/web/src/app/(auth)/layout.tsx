import Link from 'next/link';
import { Wordmark } from '@/components/brand/wordmark';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/30 flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" aria-label="Sendnaro home" className="mb-8">
        <Wordmark />
      </Link>
      <div className="border-border bg-card shadow-card w-full max-w-sm rounded-lg border p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}
