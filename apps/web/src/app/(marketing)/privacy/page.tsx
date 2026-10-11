import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Privacy',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updatedAt="2026-10-11">
      <h2>Who decides what data is sent</h2>
      <p>
        A business that uses Sendnaro decides which customer details it sends through the API and is responsible for having permission to message its
        customers. Sendnaro processes that data on the business&apos;s behalf in order to generate documents and deliver messages.
      </p>

      <h2>What we process</h2>
      <ul>
        <li>Account data: name, email address, password hash, login events and sessions, and two-factor settings if enabled.</li>
        <li>Business profile: business name, contact details, website, address, tax ID, logo, invoice footer, currency and time zone.</li>
        <li>Customer details sent by a business: an external customer id, name, WhatsApp number, optional email, and the Telegram chat id once a customer connects.</li>
        <li>Document content: line items, amounts, order and payment references. Generated PDFs are stored privately and are reachable only through short-lived signed links.</li>
        <li>Delivery records: channel, status, provider message ids, attempt history and error codes, tied to a request id.</li>
        <li>Verification codes: we keep challenge metadata (recipient, purpose, attempts, expiry). The code itself is never stored, logged or returned by the live API.</li>
        <li>Channel credentials: a business&apos;s WhatsApp credentials and webhook secrets are stored encrypted and are never shown again.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Sandbox documents, files, deliveries and test recipients: 7 days by default.</li>
        <li>Verification challenge metadata: about 1 day after expiry.</li>
        <li>Idempotency records: 24 hours. Telegram link tokens: 15 minutes to use, deleted shortly after.</li>
        <li>Live delivery history and attempts: 90 days by default. Webhook event records: 30 days.</li>
        <li>Issued live documents and account records are kept while the account is active.</li>
      </ul>

      <h2>Who else handles data</h2>
      <p>
        Data is processed by the services we use to run the product: a PostgreSQL database host, private file storage, an email provider for account
        emails, and, for the channels a business enables, WhatsApp (through that business&apos;s own WhatsApp Business account) and Telegram. If activation
        payments are enabled, a payment provider processes the payment. We do not sell personal data, and we do not use generative AI to create invoices or codes.
      </p>

      <h2>Your choices</h2>
      <p>
        A customer can send /stop to the Telegram bot at any time to disconnect. Businesses can disconnect a channel, revoke keys and request export or
        deletion of their data through support.
      </p>
    </LegalPage>
  );
}
