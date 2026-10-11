import type { Metadata } from 'next';
import { Card } from '@invoicetap/ui';

export const metadata: Metadata = {
  title: 'Invoice Templates',
  description: 'Modern, Classic and Minimal PDF templates for your quotes, invoices and receipts.',
  alternates: { canonical: '/templates' },
};

const TEMPLATES = [
  {
    key: 'MODERN',
    name: 'Modern',
    description: 'A bold colored header band in your brand color — clean and contemporary.',
  },
  {
    key: 'CLASSIC',
    name: 'Classic',
    description: 'A traditional, black-and-white layout with clear section dividers.',
  },
  {
    key: 'MINIMAL',
    name: 'Minimal',
    description: 'Generous whitespace and understated typography for a refined look.',
  },
];

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Document templates</h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-xl">
          Every quote, invoice and receipt renders as a polished, downloadable PDF. Choose the
          template that matches your brand from your workspace settings.
        </p>
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {TEMPLATES.map((t) => (
          <Card key={t.key} className="overflow-hidden">
            <div className="bg-muted/40 flex aspect-[3/4] flex-col gap-2 p-4">
              <div
                className={
                  t.key === 'MODERN' ? 'bg-primary h-10 rounded' : 'bg-foreground/10 h-6 rounded'
                }
              />
              <div className="bg-foreground/10 mt-2 h-3 w-2/3 rounded" />
              <div className="bg-foreground/10 h-3 w-1/2 rounded" />
              <div className="mt-4 flex-1 space-y-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bg-foreground/10 h-2.5 rounded" />
                ))}
              </div>
            </div>
            <div className="p-4">
              <h2 className="font-semibold">{t.name}</h2>
              <p className="text-muted-foreground mt-1 text-sm">{t.description}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
