import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Acceptable Use Policy',
  alternates: { canonical: '/acceptable-use' },
};

export default function AcceptableUsePage() {
  return (
    <LegalPage title="Acceptable Use Policy" updatedAt="2026-09-14">
      <h2>Prohibited uses</h2>
      <ul>
        <li>
          Issuing fraudulent invoices, quotes, or receipts, or impersonating another business or
          individual.
        </li>
        <li>Using the service to facilitate money laundering or any illegal transaction.</li>
        <li>Sending unsolicited bulk messages (spam) via email or WhatsApp integrations.</li>
        <li>Attempting to circumvent plan limits, rate limits, or security controls.</li>
        <li>Uploading malicious files or attempting to compromise the security of the platform.</li>
        <li>Reverse-engineering the service beyond what applicable law permits.</li>
      </ul>
      <h2>Enforcement</h2>
      <p>
        Violations may result in content removal, feature restriction, or account
        suspension/termination, at our discretion.
      </p>
    </LegalPage>
  );
}
