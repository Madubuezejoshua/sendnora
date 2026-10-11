import { Router } from 'express';
import { workspacesRouter } from './modules/workspaces/workspaces.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { productsRouter } from './modules/products/products.routes.js';
import { quotesRouter } from './modules/quotes/quotes.routes.js';
import { invoicesRouter } from './modules/invoices/invoices.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { receiptsRouter } from './modules/receipts/receipts.routes.js';
import { expensesRouter } from './modules/expenses/expenses.routes.js';
import { recurringInvoicesRouter } from './modules/recurring-invoices/recurring-invoices.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { filesRouter, localFilesRouter } from './modules/files/files.routes.js';
import { publicRouter } from './modules/public/public.routes.js';
import { cronRouter } from './modules/cron/cron.routes.js';
import { contactRouter, supportTicketsRouter } from './modules/contact/contact.routes.js';
import { telegramWebhookRouter } from './modules/telegram/telegram-webhook.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { sendnaroV1Router } from './sendnaro/v1/routes.js';
import { sendnaroConsoleRouter } from './sendnaro/console/routes.js';
import { sendnaroAdminRouter } from './sendnaro/billing/admin.routes.js';
import { sendnaroBillingRouter } from './sendnaro/billing/billing.routes.js';

/**
 * /api/v1       Public product API (API-key auth) plus the unauthenticated public surfaces.
 *               NOTE: routers that call `router.use(requireAuth, ...)` without a path guard EVERY
 *               request reaching them, so anything unauthenticated is mounted first and the
 *               v1 router (which owns the 404/error handlers) is mounted LAST.
 * /api/console  Session-token endpoints used by the console (business, keys, deliveries, billing, admin).
 * /api/legacy/v1 The previous manual-invoicing endpoints, retained read/write for existing data and clients.
 */
export const apiV1Router = Router();
apiV1Router.use(publicRouter);
apiV1Router.use(cronRouter);
apiV1Router.use(contactRouter);
apiV1Router.use(localFilesRouter);
apiV1Router.use(telegramWebhookRouter);
apiV1Router.use(sendnaroV1Router);

export const consoleRouter = Router();
consoleRouter.use(sendnaroAdminRouter);
consoleRouter.use(adminRouter); // pre-existing platform admin views (users, workspaces, support) // '/admin/*' only; mounted before the path-less guards below
consoleRouter.use(sendnaroBillingRouter);
consoleRouter.use(sendnaroConsoleRouter);
consoleRouter.use(workspacesRouter);

export const legacyRouter = Router();
legacyRouter.use(customersRouter);
legacyRouter.use(productsRouter);
legacyRouter.use(quotesRouter);
legacyRouter.use(invoicesRouter);
legacyRouter.use(paymentsRouter);
legacyRouter.use(receiptsRouter);
legacyRouter.use(expensesRouter);
legacyRouter.use(recurringInvoicesRouter);
legacyRouter.use(dashboardRouter);
legacyRouter.use(reportsRouter);
legacyRouter.use(notificationsRouter);
legacyRouter.use(filesRouter);
legacyRouter.use(supportTicketsRouter);
