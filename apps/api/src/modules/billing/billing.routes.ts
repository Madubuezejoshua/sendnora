import { Router } from 'express';
import { z } from 'zod';
import { AppError, PLAN_CODES, PLANS, type PlanCode } from '@invoicetap/shared';
import { parseApiEnv } from '@invoicetap/config/env';
import { prisma } from '@invoicetap/database';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import { getActivePlanCode } from '../../services/billing.service.js';
import {
  ensurePaystackPlan,
  initializeSubscriptionCheckout,
} from '../../services/payments/paystack-subscription.provider.js';

export const billingRouter = Router();
billingRouter.use(requireAuth, requireWorkspace);

billingRouter.get('/billing/plans', async (_req, res) => {
  res.json({ data: Object.values(PLANS) });
});

billingRouter.get(
  '/billing/subscription',
  requirePermission('settings:read'),
  async (req, res, next) => {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { workspaceId: req.workspace!.workspaceId },
      });
      const planCode = await getActivePlanCode(req.workspace!.workspaceId);
      const period = new Date().toISOString().slice(0, 7);
      const usage = await prisma.usageCounter.findUnique({
        where: { workspaceId_period: { workspaceId: req.workspace!.workspaceId, period } },
      });
      res.json({
        data: {
          subscription,
          plan: PLANS[planCode],
          usage: { invoicesIssuedThisMonth: usage?.invoicesIssued ?? 0 },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Real, automated recurring billing: initializes a Paystack subscription
 * checkout for the chosen plan+interval, using the platform's own Paystack
 * account (never a workspace's configured credentials — see
 * paystack-subscription.provider.ts). On successful first charge, Paystack
 * auto-creates the recurring subscription and our webhook handler
 * (subscription-billing.service.ts) activates it; renewals and failures
 * are handled the same way going forward, with no further action needed
 * from the workspace.
 */
billingRouter.post(
  '/billing/subscription/checkout',
  requirePermission('workspace:manage'),
  validateBody(z.object({ planCode: z.enum(PLAN_CODES), interval: z.enum(['MONTHLY', 'YEARLY']) })),
  async (req, res, next) => {
    try {
      const env = parseApiEnv();
      if (!env.PAYSTACK_SECRET_KEY) {
        throw new AppError(
          'CONFLICT',
          'Online plan checkout is not configured on this platform yet.',
        );
      }
      if (req.body.planCode === 'FREE') {
        throw new AppError('VALIDATION_ERROR', 'The Free plan does not require checkout.');
      }

      const plan = PLANS[req.body.planCode as PlanCode];
      const amountMinorUnits =
        req.body.interval === 'MONTHLY' ? plan.monthlyPriceMinorUnits : plan.yearlyPriceMinorUnits;

      const paystackPlanCode = await ensurePaystackPlan({
        secretKey: env.PAYSTACK_SECRET_KEY,
        planCode: plan.code,
        interval: req.body.interval,
        amountMinorUnits,
        currency: plan.currency,
      });

      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
      const result = await initializeSubscriptionCheckout({
        secretKey: env.PAYSTACK_SECRET_KEY,
        email: user.email,
        paystackPlanCode,
        callbackUrl: `${env.NEXT_PUBLIC_APP_URL}/settings/billing`,
        metadata: {
          workspaceId: req.workspace!.workspaceId,
          planCode: plan.code,
          interval: req.body.interval,
        },
      });

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Manual plan changes — kept as a non-production fallback for local/CI
 * testing without payment credentials, and for plans with no online
 * checkout (e.g. downgrading to Free). The platform admin override in
 * modules/admin is audited and always available regardless of environment.
 */
billingRouter.post(
  '/billing/subscription/change-plan',
  requirePermission('workspace:manage'),
  validateBody(z.object({ planCode: z.enum(PLAN_CODES) })),
  async (req, res, next) => {
    try {
      const env = parseApiEnv();
      if (env.NODE_ENV === 'production') {
        throw new AppError(
          'FORBIDDEN',
          'Self-service plan changes require a configured payment provider. Contact support to upgrade.',
        );
      }
      const subscription = await prisma.subscription.update({
        where: { workspaceId: req.workspace!.workspaceId },
        data: { planCode: req.body.planCode, status: 'ACTIVE' },
      });
      res.json({ data: subscription });
    } catch (err) {
      next(err);
    }
  },
);
