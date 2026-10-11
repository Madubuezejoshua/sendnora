import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Terms',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updatedAt="2026-10-11">
      <h2>The service</h2>
      <p>
        Sendnaro provides an API and console for generating invoices and receipts, verifying phone numbers by WhatsApp, and delivering transactional
        messages by WhatsApp and Telegram. It is not an accounting system, a CRM or a marketing platform.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Send transactional messages only: invoices, receipts, verification codes, and order or payment updates a customer would expect.</li>
        <li>Only message people who have agreed to receive them, and record that permission through the API&apos;s consent fields.</li>
        <li>No bulk or promotional campaigns, spam, phishing, deceptive links, or content that breaks the rules of WhatsApp or Telegram.</li>
        <li>Keep API keys on your server. You are responsible for activity under your keys.</li>
      </ul>

      <h2>Sandbox and live</h2>
      <p>
        The sandbox is for testing and simulates delivery; sandbox documents are not real transactions and are deleted after a short period. Live
        sending needs a connected channel and follows the access rules shown in the console and on the pricing page.
      </p>

      <h2>Third-party platforms</h2>
      <p>
        WhatsApp messages are sent through your own WhatsApp Business account, and you must follow Meta&apos;s terms, message template and consent rules.
        Meta may charge you and may limit or block sending. Telegram messages follow Telegram&apos;s bot rules. We do not control these platforms and cannot
        guarantee that a message will be delivered, read, or delivered on time.
      </p>

      <h2>One-time activation</h2>
      <p>
        If the platform requires an activation payment, it is a single licence payment for the business, not a subscription, and it does not cover
        provider charges. Access is confirmed only after the payment is verified with the payment provider. A refund or a reversed payment can withdraw
        the activation.
      </p>

      <h2>Availability and suspension</h2>
      <p>
        The service is provided as is, without a promise of uninterrupted availability. We may suspend a business that breaks these terms or the rules of
        the platforms it uses.
      </p>
    </LegalPage>
  );
}
