export interface DeliveryRow {
  id: string;
  kind: string;
  channel: string;
  status: string;
  environment: string;
  simulated: boolean;
  to: string;
  template: string;
  error: { code: string; message: string | null } | null;
  attempts: number;
  invoiceNumber: string | null;
  externalOrderId: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}

export const STATUS_VARIANT: Record<
  string,
  'success' | 'warning' | 'destructive' | 'default' | 'outline'
> = {
  delivered: 'success',
  read: 'success',
  sent: 'success',
  provider_accepted: 'success',
  sandbox_simulated: 'outline',
  queued: 'default',
  processing: 'default',
  retrying: 'warning',
  failed: 'destructive',
  blocked: 'destructive',
  expired: 'destructive',
};
