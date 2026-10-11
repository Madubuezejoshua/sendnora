import { StatCard } from '@invoicetap/ui';
import { apiFetch } from '@/lib/api-client';

interface PlatformStats {
  userCount: number;
  workspaceCount: number;
  invoiceCount: number;
  demoWorkspaces: number;
  planDistribution: { planCode: string; count: number }[];
}

export default async function AdminOverviewPage() {
  const { data: stats } = await apiFetch<{ data: PlatformStats }>('/admin/stats');

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Platform overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={String(stats.userCount)} />
        <StatCard label="Total workspaces" value={String(stats.workspaceCount)} />
        <StatCard label="Total invoices" value={String(stats.invoiceCount)} />
        <StatCard label="Demo workspaces" value={String(stats.demoWorkspaces)} />
      </div>
      <div className="border-border rounded-lg border p-5">
        <h2 className="font-semibold">Plan distribution</h2>
        <div className="mt-3 space-y-2 text-sm">
          {stats.planDistribution.map((p) => (
            <div key={p.planCode} className="flex justify-between">
              <span className="text-muted-foreground">{p.planCode}</span>
              <span>{p.count}</span>
            </div>
          ))}
          {stats.planDistribution.length === 0 && (
            <p className="text-muted-foreground">No active subscriptions yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
