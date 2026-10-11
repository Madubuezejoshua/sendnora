import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        primary: 'border-transparent bg-primary text-primary-foreground',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/15 text-warning',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/**
 * Maps document statuses to a badge variant + label. Central place so a new
 * status can't be shown inconsistently across the app.
 */
const STATUS_BADGE_MAP: Record<string, { variant: BadgeProps['variant']; label: string }> = {
  DRAFT: { variant: 'default', label: 'Draft' },
  SENT: { variant: 'outline', label: 'Sent' },
  ISSUED: { variant: 'outline', label: 'Issued' },
  VIEWED: { variant: 'outline', label: 'Viewed' },
  ACCEPTED: { variant: 'success', label: 'Accepted' },
  PAID: { variant: 'success', label: 'Paid' },
  PARTIALLY_PAID: { variant: 'warning', label: 'Partially paid' },
  OVERDUE: { variant: 'destructive', label: 'Overdue' },
  REJECTED: { variant: 'destructive', label: 'Rejected' },
  EXPIRED: { variant: 'destructive', label: 'Expired' },
  VOID: { variant: 'destructive', label: 'Void' },
  CANCELLED: { variant: 'default', label: 'Cancelled' },
  CONVERTED: { variant: 'success', label: 'Converted' },
  ACTIVE: { variant: 'success', label: 'Active' },
  PAUSED: { variant: 'warning', label: 'Paused' },
  ENDED: { variant: 'default', label: 'Ended' },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const entry = STATUS_BADGE_MAP[status] ?? { variant: 'default' as const, label: status };
  return (
    <Badge variant={entry.variant} className={className}>
      {entry.label}
    </Badge>
  );
}
