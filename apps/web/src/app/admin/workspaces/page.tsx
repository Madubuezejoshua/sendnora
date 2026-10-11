import { Badge, StatusBadge } from '@invoicetap/ui';
import { apiFetch } from '@/lib/api-client';

interface AdminWorkspace {
  id: string;
  name: string;
  isDemo: boolean;
  defaultCurrency: string;
  createdAt: string;
  owner: { email: string; name: string | null };
  subscription: { planCode: string; status: string } | null;
}

export default async function AdminWorkspacesPage() {
  const { items } = await apiFetch<{ items: AdminWorkspace[] }>('/admin/workspaces?pageSize=50');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Workspaces</h1>
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {items.map((w) => (
              <tr key={w.id}>
                <td className="px-4 py-2">
                  {w.name}{' '}
                  {w.isDemo && (
                    <Badge variant="warning" className="ml-2">
                      Demo
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2">{w.owner.email}</td>
                <td className="px-4 py-2">{w.subscription?.planCode ?? '—'}</td>
                <td className="px-4 py-2">
                  {w.subscription && <StatusBadge status={w.subscription.status} />}
                </td>
                <td className="px-4 py-2">{new Date(w.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
