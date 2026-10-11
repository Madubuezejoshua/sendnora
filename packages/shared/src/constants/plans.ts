/**
 * Centralized plan definitions and entitlements.
 *
 * This is the single source of truth for plan limits. The database seeds
 * `SubscriptionPlan` rows from this file (see packages/database/prisma/seed.ts)
 * so limits can be tuned via the admin panel later without a code deploy,
 * but the values here are what ships by default and what the API falls
 * back to if a plan record is ever missing a limit.
 *
 * Enforcement always happens server-side — see apps/api/src/modules/billing.
 */
export const PLAN_CODES = ['FREE', 'STARTER', 'BUSINESS', 'AGENCY'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export interface PlanLimits {
  /** -1 means unlimited (subject to fair-use enforcement described in the plan). */
  invoicesPerMonth: number;
  customers: number;
  teamMembers: number;
  workspaces: number;
  recurringInvoices: boolean;
  documentTemplates: number;
  customNumbering: boolean;
  onlinePayments: boolean;
  emailDelivery: boolean;
  paymentReminders: boolean;
  reports: 'basic' | 'advanced' | 'none';
  expenses: boolean;
  dataExports: boolean;
  whiteLabel: boolean;
  prioritySupport: boolean;
}

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  description: string;
  monthlyPriceMinorUnits: number;
  yearlyPriceMinorUnits: number;
  currency: string;
  limits: PlanLimits;
}

export const PLANS: Record<PlanCode, PlanDefinition> = {
  FREE: {
    code: 'FREE',
    name: 'Free',
    description: 'Try InvoiceTap with a small number of invoices and customers.',
    monthlyPriceMinorUnits: 0,
    yearlyPriceMinorUnits: 0,
    currency: 'USD',
    limits: {
      invoicesPerMonth: 5,
      customers: 3,
      teamMembers: 1,
      workspaces: 1,
      recurringInvoices: false,
      documentTemplates: 1,
      customNumbering: false,
      onlinePayments: false,
      emailDelivery: false,
      paymentReminders: false,
      reports: 'none',
      expenses: false,
      dataExports: false,
      whiteLabel: false,
      prioritySupport: false,
    },
  },
  STARTER: {
    code: 'STARTER',
    name: 'Starter',
    description: 'For freelancers and small businesses billing regularly.',
    monthlyPriceMinorUnits: 900_00,
    yearlyPriceMinorUnits: 9000_00,
    currency: 'USD',
    limits: {
      invoicesPerMonth: 100,
      customers: -1,
      teamMembers: 1,
      workspaces: 1,
      recurringInvoices: false,
      documentTemplates: 3,
      customNumbering: false,
      onlinePayments: true,
      emailDelivery: true,
      paymentReminders: true,
      reports: 'basic',
      expenses: false,
      dataExports: false,
      whiteLabel: false,
      prioritySupport: false,
    },
  },
  BUSINESS: {
    code: 'BUSINESS',
    name: 'Business',
    description: 'For growing teams that need recurring billing and reporting.',
    monthlyPriceMinorUnits: 2900_00,
    yearlyPriceMinorUnits: 29000_00,
    currency: 'USD',
    limits: {
      invoicesPerMonth: -1,
      customers: -1,
      teamMembers: 5,
      workspaces: 1,
      recurringInvoices: true,
      documentTemplates: -1,
      customNumbering: true,
      onlinePayments: true,
      emailDelivery: true,
      paymentReminders: true,
      reports: 'advanced',
      expenses: true,
      dataExports: true,
      whiteLabel: false,
      prioritySupport: true,
    },
  },
  AGENCY: {
    code: 'AGENCY',
    name: 'Agency',
    description: 'For agencies and accountants managing multiple client businesses.',
    monthlyPriceMinorUnits: 7900_00,
    yearlyPriceMinorUnits: 79000_00,
    currency: 'USD',
    limits: {
      invoicesPerMonth: -1,
      customers: -1,
      teamMembers: -1,
      workspaces: -1,
      recurringInvoices: true,
      documentTemplates: -1,
      customNumbering: true,
      onlinePayments: true,
      emailDelivery: true,
      paymentReminders: true,
      reports: 'advanced',
      expenses: true,
      dataExports: true,
      whiteLabel: true,
      prioritySupport: true,
    },
  },
};

export const DEFAULT_PLAN: PlanCode = 'FREE';

/** Fair-use ceiling applied to "-1 (unlimited)" invoice quotas to prevent abuse. */
export const FAIR_USE_INVOICE_CEILING_PER_MONTH = 2000;

export function getPlanLimits(code: PlanCode): PlanLimits {
  return PLANS[code].limits;
}

export function isWithinInvoiceQuota(code: PlanCode, invoicesIssuedThisMonth: number): boolean {
  const limit = getPlanLimits(code).invoicesPerMonth;
  if (limit === -1) {
    return invoicesIssuedThisMonth < FAIR_USE_INVOICE_CEILING_PER_MONTH;
  }
  return invoicesIssuedThisMonth < limit;
}

export function isWithinCustomerQuota(code: PlanCode, currentCustomerCount: number): boolean {
  const limit = getPlanLimits(code).customers;
  if (limit === -1) return true;
  return currentCustomerCount < limit;
}

export function isWithinTeamMemberQuota(code: PlanCode, currentMemberCount: number): boolean {
  const limit = getPlanLimits(code).teamMembers;
  if (limit === -1) return true;
  return currentMemberCount < limit;
}
