import { prisma } from '@invoicetap/database';
import {
  AppError,
  DEFAULT_PLAN,
  getPlanLimits,
  isWithinCustomerQuota,
  isWithinInvoiceQuota,
  isWithinTeamMemberQuota,
  type PlanCode,
} from '@invoicetap/shared';

/**
 * Resolves the workspace's effective plan. A workspace without a
 * Subscription row (shouldn't normally happen — one is created alongside
 * the workspace) safely falls back to FREE rather than throwing, so a
 * billing hiccup degrades to the most restrictive plan instead of an
 * outage.
 */
export async function getActivePlanCode(workspaceId: string): Promise<PlanCode> {
  const subscription = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (!subscription) return DEFAULT_PLAN;
  if (subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED') return DEFAULT_PLAN;
  return subscription.planCode as PlanCode;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function assertCanIssueInvoice(workspaceId: string): Promise<void> {
  const plan = await getActivePlanCode(workspaceId);
  const period = currentPeriod();
  const counter = await prisma.usageCounter.findUnique({
    where: { workspaceId_period: { workspaceId, period } },
  });
  const issued = counter?.invoicesIssued ?? 0;
  if (!isWithinInvoiceQuota(plan, issued)) {
    throw new AppError(
      'PLAN_LIMIT_EXCEEDED',
      `You've reached your plan's invoice limit for this month (${getPlanLimits(plan).invoicesPerMonth}). Upgrade your plan to issue more invoices.`,
    );
  }
}

export async function incrementInvoiceUsage(workspaceId: string): Promise<void> {
  const period = currentPeriod();
  await prisma.usageCounter.upsert({
    where: { workspaceId_period: { workspaceId, period } },
    create: { workspaceId, period, invoicesIssued: 1 },
    update: { invoicesIssued: { increment: 1 } },
  });
}

export async function assertCanAddCustomer(workspaceId: string): Promise<void> {
  const plan = await getActivePlanCode(workspaceId);
  const count = await prisma.customer.count({ where: { workspaceId, status: 'ACTIVE' } });
  if (!isWithinCustomerQuota(plan, count)) {
    throw new AppError(
      'PLAN_LIMIT_EXCEEDED',
      `You've reached your plan's customer limit (${getPlanLimits(plan).customers}). Upgrade your plan to add more customers.`,
    );
  }
}

export async function assertCanAddTeamMember(workspaceId: string): Promise<void> {
  const plan = await getActivePlanCode(workspaceId);
  const count = await prisma.workspaceMember.count({ where: { workspaceId, removedAt: null } });
  if (!isWithinTeamMemberQuota(plan, count)) {
    throw new AppError(
      'PLAN_LIMIT_EXCEEDED',
      `You've reached your plan's team member limit (${getPlanLimits(plan).teamMembers}). Upgrade your plan to invite more people.`,
    );
  }
}

type BooleanPlanFeature =
  | 'recurringInvoices'
  | 'onlinePayments'
  | 'emailDelivery'
  | 'paymentReminders'
  | 'expenses'
  | 'dataExports'
  | 'customNumbering'
  | 'whiteLabel';

export async function assertFeatureEnabled(
  workspaceId: string,
  feature: BooleanPlanFeature,
): Promise<void> {
  const plan = await getActivePlanCode(workspaceId);
  const limits = getPlanLimits(plan);
  if (!limits[feature]) {
    throw new AppError(
      'PLAN_LIMIT_EXCEEDED',
      `This feature is not available on your current plan. Please upgrade.`,
    );
  }
}
