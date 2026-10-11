import type { Metadata } from 'next';
import { BRAND } from '@sendnaro/shared';
import { ContactForm } from './contact-form';

export const metadata: Metadata = {
  title: 'Support',
  description: `Get in touch with the ${BRAND.productName} team.`,
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Support</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Questions or a problem with an integration? Send a message. Include the request_id from any API error so we can find it.
      </p>
      <div className="mt-8">
        <ContactForm />
      </div>
    </div>
  );
}
