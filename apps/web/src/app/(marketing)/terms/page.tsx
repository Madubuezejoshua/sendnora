import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Terms of Service',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updatedAt="2026-09-14">
      <h2>Using the service</h2>
      <p>
        You must provide accurate account information and are responsible for activity under your
        account, including actions taken by team members you invite.
      </p>
      <h2>Subscription plans</h2>
      <p>
        Plan limits (invoices, customers, team members) are described on our Pricing page and
        enforced automatically. Downgrading may restrict access to features you were previously
        using.
      </p>
      <h2>Payment processing</h2>
      <p>
        Online payments you collect from your customers are processed by third-party providers
        (Paystack, Flutterwave) under their own terms. We are not a party to the transaction between
        you and your customer.
      </p>
      <h2>Acceptable use</h2>
      <p>See our Acceptable Use Policy for prohibited uses of the service.</p>
      <h2>Termination</h2>
      <p>
        You may cancel your account at any time. We may suspend or terminate accounts that violate
        these terms or our Acceptable Use Policy.
      </p>
      <h2>Limitation of liability</h2>
      <p>
        The service is provided &quot;as is&quot; without warranties of any kind. To the maximum
        extent permitted by law, we are not liable for indirect, incidental, or consequential
        damages arising from your use of the service.
      </p>
    </LegalPage>
  );
}
