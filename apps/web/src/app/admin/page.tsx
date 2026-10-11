import { StatCard } from '@sendnaro/ui';
import { apiFetch } from '@/lib/api-client';

interface Overview {
  users: number;
  businesses: number;
  activeKeys: number;
  entitlements: { source: string; count: number }[];
  deliveriesLast7Days: { environment: string; status: string; count: number }[];
  deadJobs: number;
}

export default async function AdminOverviewPage() {
  const { data } = await apiFetch<{ data: Overview }>('/admin/overview');
  const live = data.deliveriesLast7Days.filter((d) => d.environment === 'live');
  const total = (rows: typeof live) => rows.reduce((n, r) => n + r.count, 0);
  const failed = live.filter((d) => ['failed', 'blocked', 'expired'].includes(d.status));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Platform overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={String(data.users)} />
        <StatCard label="Businesses" value={String(data.businesses)} />
        <StatCard label="Active API keys" value={String(data.activeKeys)} />
        <StatCard label="Stuck jobs (dead)" value={String(data.deadJobs)} />
      </div>
      <section className="border-border rounded-lg border p-5" aria-labelledby="live-deliveries">
        <h2 id="live-deliveries" className="font-semibold">
          Live deliveries, last 7 days
        </h2>
        {live.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">No live deliveries yet.</p>
        ) : (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {live.map((d) => (
              <div key={d.status} className="flex justify-between">
                <dt className="text-muted-foreground">{d.status}</dt>
                <dd>{d.count}</dd>
              </div>
            ))}
            <div className="border-border col-span-full flex justify-between border-t pt-2 font-medium">
              <dt>Total / not delivered</dt>
              <dd>
                {total(live)} / {total(failed)}
              </dd>
            </div>
          </dl>
        )}
      </section>
      <section className="border-border rounded-lg border p-5" aria-labelledby="entitlements">
        <h2 id="entitlements" className="font-semibold">
          Activated businesses
        </h2>
        {data.entitlements.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">None. Billing may be off, in which case no activation is needed.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {data.entitlements.map((e) => (
              <li key={e.source} className="flex justify-between">
                <span className="text-muted-foreground">{e.source.toLowerCase()}</span>
                <span>{e.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
