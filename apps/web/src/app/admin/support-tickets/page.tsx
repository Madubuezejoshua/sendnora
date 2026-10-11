import { StatusBadge } from '@invoicetap/ui';
import { apiFetch } from '@/lib/api-client';

interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  user: { email: string; name: string | null } | null;
  workspace: { name: string } | null;
}

export default async function AdminSupportTicketsPage() {
  const { items } = await apiFetch<{ items: SupportTicket[] }>(
    '/admin/support-tickets?pageSize=50',
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Support tickets</h1>
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">From</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Opened</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {items.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2">{t.subject}</td>
                <td className="px-4 py-2">{t.user?.email ?? '—'}</td>
                <td className="px-4 py-2">{t.priority}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-4 py-2">{new Date(t.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-4 py-8 text-center">
                  No support tickets yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
