import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updatedAt="2026-09-14">
      <h2>What we collect</h2>
      <p>
        Account information (name, email), business information you provide (business name, address,
        tax ID), customer records you create, and usage data necessary to operate the service (login
        events, IP address for security purposes).
      </p>
      <h2>How we use it</h2>
      <ul>
        <li>To provide and operate the invoicing, quoting and payment features you use.</li>
        <li>
          To send transactional emails (invoice delivery, payment confirmations, security alerts).
        </li>
        <li>To detect and prevent fraud, abuse, and security incidents.</li>
      </ul>
      <h2>What we don&apos;t do</h2>
      <p>
        We do not sell your data. We do not share customer records you create with third parties
        except the service providers necessary to operate the product (e.g. your chosen payment
        gateway, when you initiate a payment).
      </p>
      <h2>Data retention</h2>
      <p>
        Your data is retained for as long as your account is active. You may request an export or
        deletion of your workspace&apos;s data by contacting support.
      </p>
      <h2>Your rights</h2>
      <p>
        Depending on your jurisdiction, you may have rights to access, correct, export, or delete
        your personal data. Contact us to exercise these rights.
      </p>
    </LegalPage>
  );
}
