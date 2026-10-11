import { StatusBadge } from '@sendnaro/ui';
import { apiFetch } from '@/lib/api-client';

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  emailVerified: string | null;
  isPlatformAdmin: boolean;
  createdAt: string;
}

export default async function AdminUsersPage() {
  const { items } = await apiFetch<{ items: AdminUser[] }>('/admin/users?pageSize=50');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Verified</th>
              <th className="px-4 py-2">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {items.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">
                  {u.name ?? '—'}{' '}
                  {u.isPlatformAdmin && <StatusBadge status="ACTIVE" className="ml-2" />}
                </td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.emailVerified ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
