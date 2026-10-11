import type { Metadata } from 'next';
import { BRAND } from '@invoicetap/shared';
import { ContactForm } from './contact-form';

export const metadata: Metadata = {
  title: 'Contact',
  description: `Get in touch with the ${BRAND.productName} team.`,
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Contact us</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Questions, feedback, or need help? Send us a message and we&apos;ll respond within 1-2
        business days.
      </p>
      <div className="mt-8">
        <ContactForm />
      </div>
    </div>
  );
}
