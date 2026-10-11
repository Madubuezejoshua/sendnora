import { StatusBadge } from '@sendnaro/ui';
import { apiFetch } from '@/lib/api-client';

interface WebhookEvent {
  id: string;
  provider: string;
  status: string;
  signatureValid: boolean;
  createdAt: string;
  processedAt: string | null;
  errorMessage: string | null;
}

export default async function AdminWebhookEventsPage() {
  const { items } = await apiFetch<{ items: WebhookEvent[] }>('/admin/webhook-events?pageSize=50');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Payment webhook events</h1>
      <p className="text-muted-foreground text-sm">
        Every inbound Paystack/Flutterwave webhook, with its idempotent processing status. Check
        here first if a merchant reports a payment that didn&apos;t reflect.
      </p>
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-2">Provider</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Signature</th>
              <th className="px-4 py-2">Received</th>
              <th className="px-4 py-2">Error</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {items.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2">{e.provider}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={e.status} />
                </td>
                <td className="px-4 py-2">{e.signatureValid ? 'Valid' : 'Invalid'}</td>
                <td className="px-4 py-2">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="text-destructive max-w-[240px] truncate px-4 py-2">
                  {e.errorMessage ?? ''}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-4 py-8 text-center">
                  No webhook events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
