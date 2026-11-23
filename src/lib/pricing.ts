export type PlanId = 'starter' | 'growth' | 'global_pro';
export type BillingPreset = '1' | '2' | '3' | '12' | 'custom';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  region: 'nigeria' | 'global';
  regionLabel: string;
  currency: 'NGN' | 'USD';
  tagline: string;
  popular?: boolean;
  /** Exact total price in major units indexed by month count (1..12) */
  totalsByMonth: Record<number, number>;
  /** Monthly message allowance by duration (undefined means unlimited) */
  monthlyMessagesByMonth?: Record<number, number>;
  features: string[];
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'starter',
    name: 'Starter Plan',
    region: 'nigeria',
    regionLabel: 'Nigeria · For early-stage teams',
    currency: 'NGN',
    tagline: 'Built for solo founders and growing local stores automating WhatsApp messages.',
    totalsByMonth: {
      1: 7000,
      2: 13000,
      3: 18000,
      4: 23200,
      5: 28500,
      6: 33000,
      7: 37800,
      8: 42400,
      9: 46800,
      10: 51500,
      11: 56100,
      12: 60000,
    },
    monthlyMessagesByMonth: {
      1: 50,
      2: 60,
      3: 75,
      4: 75,
      5: 75,
      6: 85,
      7: 85,
      8: 85,
      9: 85,
      10: 90,
      11: 90,
      12: 100,
    },
    features: [
      'WhatsApp phone number verification API',
      'Encrypted Meta WhatsApp credentials',
      '120 API requests / min rate limit',
    ],
  },
  {
    id: 'growth',
    name: 'Growth Plan',
    region: 'nigeria',
    regionLabel: 'Nigeria · Most Popular · Unlimited',
    currency: 'NGN',
    tagline: 'Unlimited WhatsApp invoices and OTP verification with zero per-message Sendnaro fees.',
    popular: true,
    totalsByMonth: {
      1: 12000,
      2: 22000,
      3: 30000,
      4: 38400,
      5: 46500,
      6: 54000,
      7: 62300,
      8: 70400,
      9: 78300,
      10: 86000,
      11: 93500,
      12: 100000,
    },
    features: [
      'Automated invoices, receipts & WhatsApp OTPs',
      'Signed webhooks & Telegram customer links',
      'Up to 600 API requests / min throughput',
    ],
  },
  {
    id: 'global_pro',
    name: 'Global Pro',
    region: 'global',
    regionLabel: 'International · Non-Nigerian Businesses',
    currency: 'USD',
    tagline: 'Auto-configured for US, UK, Canada, and global workspaces during signup.',
    totalsByMonth: {
      1: 25,
      2: 46,
      3: 63,
      4: 80,
      5: 97,
      6: 114,
      7: 130,
      8: 145,
      9: 160,
      10: 174,
      11: 188,
      12: 200,
    },
    features: [
      'Multi-currency receipts (USD, GBP, EUR)',
      'Priority multi-region webhook routing',
      'Dedicated integration engineering support',
    ],
  },
];

export interface PricingQuote {
  months: number;
  currency: 'NGN' | 'USD';
  totalMajor: number;
  totalMinor: number;
  effectiveMonthlyMajor: number;
  standardMonthlyTotalMajor: number;
  savingsMajor: number;
  savingsPct: number;
  periodLabel: string;
  monthlyMessages: number | null; // null = unlimited
  totalMessages: number | null; // null = unlimited
  quotaLabel: string;
}

export function clampMonths(months: number): number {
  if (!Number.isFinite(months)) return 12;
  return Math.max(1, Math.min(12, Math.round(months)));
}

export function calculatePlanQuote(plan: PlanDefinition, rawMonths: number): PricingQuote {
  const months = clampMonths(rawMonths);
  const singleMonthRate = plan.totalsByMonth[1]!;
  const totalMajor = plan.totalsByMonth[months] ?? singleMonthRate * months;
  const standardMonthlyTotalMajor = singleMonthRate * months;
  const savingsMajor = Math.max(0, standardMonthlyTotalMajor - totalMajor);
  const savingsPct =
    standardMonthlyTotalMajor > 0
      ? Math.round((savingsMajor / standardMonthlyTotalMajor) * 100)
      : 0;
  const effectiveMonthlyMajor = totalMajor / months;

  const periodLabel =
    months === 1 ? '/ month' : months === 12 ? '/ year' : `/ ${months} months`;

  const monthlyMessages = plan.monthlyMessagesByMonth
    ? (plan.monthlyMessagesByMonth[months] ?? plan.monthlyMessagesByMonth[1]!)
    : null;
  const totalMessages = monthlyMessages !== null ? monthlyMessages * months : null;

  let quotaLabel: string;
  if (monthlyMessages === null) {
    quotaLabel =
      months === 12
        ? 'Unlimited messages for 1 full year'
        : `Unlimited messages for ${months} ${months === 1 ? 'month' : 'months'}`;
  } else if (months === 1) {
    quotaLabel = `${monthlyMessages} messages / month (invoices & OTP)`;
  } else if (months === 12) {
    quotaLabel = `${monthlyMessages} messages / month (${totalMessages!.toLocaleString('en-US')}/yr · 2× bonus)`;
  } else {
    quotaLabel = `${monthlyMessages} messages / month (${totalMessages!.toLocaleString('en-US')} total)`;
  }

  return {
    months,
    currency: plan.currency,
    totalMajor,
    totalMinor: Math.round(totalMajor * 100),
    effectiveMonthlyMajor,
    standardMonthlyTotalMajor,
    savingsMajor,
    savingsPct,
    periodLabel,
    monthlyMessages,
    totalMessages,
    quotaLabel,
  };
}

export function formatMajorPrice(amount: number, currency: 'NGN' | 'USD', showDecimals = false): string {
  const symbol = currency === 'NGN' ? '₦' : '$';
  const rounded = showDecimals ? amount : Math.round(amount);
  return `${symbol}${rounded.toLocaleString('en-US', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  })}`;
}
