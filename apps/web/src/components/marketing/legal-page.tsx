import { BRAND } from '@invoicetap/shared';

export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">Last updated: {updatedAt}</p>
      <div className="prose prose-sm text-foreground [&_p]:text-muted-foreground [&_li]:text-muted-foreground mt-8 max-w-none [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
      <p className="border-warning/30 bg-warning/5 text-muted-foreground mt-10 rounded-lg border p-4 text-xs">
        This page is template content and has not been reviewed by a lawyer in any specific
        jurisdiction. Have it reviewed before relying on it for a live product handling real
        customer data — see DATA_ROOM_CHECKLIST.md in the repository.
      </p>
      <p className="text-muted-foreground mt-4 text-xs">
        Questions? Contact us at {BRAND.supportEmail}.
      </p>
    </div>
  );
}
