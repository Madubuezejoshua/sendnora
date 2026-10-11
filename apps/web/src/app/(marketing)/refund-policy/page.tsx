import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Refund Policy',
  alternates: { canonical: '/refund-policy' },
};

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund Policy" updatedAt="2026-09-14">
      <h2>Subscription refunds</h2>
      <p>
        If you&apos;re not satisfied within the first 14 days of a paid subscription, contact
        support for a full refund of that billing period.
      </p>
      <h2>Cancellations</h2>
      <p>
        You can cancel at any time from your billing settings. Your plan remains active until the
        end of the current billing period; we do not provide partial-period refunds for mid-cycle
        cancellations outside the 14-day window above.
      </p>
      <h2>Customer payments you collect</h2>
      <p>
        Refunds for payments your customers make to you through Paystack/Flutterwave are between you
        and your customer, processed through the relevant gateway&apos;s refund mechanism. This
        policy covers only your InvoiceTap subscription, not payments you collect from your own
        customers.
      </p>
    </LegalPage>
  );
}
