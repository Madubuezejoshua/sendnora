import { Router } from 'express';
import { drainOutbox } from '../../sendnaro/jobs.js';
import { runRetention } from '../../sendnaro/maintenance.js';
import { requireCronSecret } from '../../middleware/cron-auth.js';
import { logger } from '../../config/logger.js';
import { sweepOverdueInvoices } from '../invoices/invoices.service.js';
import { runDueRecurringInvoices } from '../recurring-invoices/recurring-invoices.service.js';
import { processPendingReminders } from '../reminders/reminders.service.js';

/**
 * Scheduled-job endpoints, triggered by an external scheduler (Railway
 * cron, GitHub Actions on a schedule, or any HTTP-capable cron) rather
 * than an in-process timer — keeps the API stateless and horizontally
 * scalable. Each endpoint is safe to call more often than strictly
 * necessary: every operation here is idempotent (re-running finds nothing
 * new to do rather than double-processing).
 */
export const cronRouter = Router();
cronRouter.use('/cron', requireCronSecret);

cronRouter.all('/cron/outbox', async (_req, res, next) => {
  try {
    res.json({ data: await drainOutbox({ limit: 50, maxRounds: 10 }) });
  } catch (err) {
    next(err);
  }
});

cronRouter.all('/cron/maintenance', async (_req, res, next) => {
  try {
    res.json({ data: await runRetention() });
  } catch (err) {
    next(err);
  }
});

cronRouter.all('/cron/overdue-sweep', async (_req, res, next) => {
  try {
    const count = await sweepOverdueInvoices();
    logger.info({ count }, 'Cron: overdue sweep complete');
    res.json({ data: { invoicesMarkedOverdue: count } });
  } catch (err) {
    next(err);
  }
});

cronRouter.all('/cron/recurring-invoices', async (_req, res, next) => {
  try {
    const result = await runDueRecurringInvoices();
    logger.info(result, 'Cron: recurring invoices run complete');
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

cronRouter.all('/cron/reminders', async (_req, res, next) => {
  try {
    const result = await processPendingReminders();
    logger.info(result, 'Cron: reminders run complete');
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
