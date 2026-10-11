import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  alternates: { canonical: '/cookie-policy' },
};

export default function CookiePolicyPage() {
  return (
    <LegalPage title="Cookie Policy" updatedAt="2026-09-14">
      <h2>Essential cookies</h2>
      <p>
        We use a session cookie to keep you signed in and a cookie to remember your active
        workspace. These are required for the app to function and cannot be disabled while using the
        product.
      </p>
      <h2>No third-party tracking cookies</h2>
      <p>
        This build of the product does not include any analytics or advertising trackers. If that
        changes in the future, this policy will be updated to disclose it and, where required,
        request consent.
      </p>
      <h2>Local storage</h2>
      <p>
        The browser app may use local storage for per-device UI preferences (such as a collapsed
        sidebar state). This data stays on your device.
      </p>
    </LegalPage>
  );
}
