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
import { adminRouter } from './modules/admin/admin.routes.js';
import { publicRouter } from './modules/public/public.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { cronRouter } from './modules/cron/cron.routes.js';
import { contactRouter, supportTicketsRouter } from './modules/contact/contact.routes.js';
import { telegramWebhookRouter } from './modules/telegram/telegram-webhook.routes.js';
import { apiKeysRouter } from './modules/api-keys/api-keys.routes.js';

/** Everything mounted here sits behind standardRateLimit and (individually) requireAuth/requireWorkspace as each module declares. */
export const apiV1Router = Router();

// Order matters: most routers call `router.use(requireAuth, ...)` with no path,
// which guards EVERY request that reaches them — not just their own routes.
// Anything unauthenticated (or guarded differently) must be mounted first.
apiV1Router.use(publicRouter);
apiV1Router.use(cronRouter);
apiV1Router.use(telegramWebhookRouter);
apiV1Router.use(contactRouter);
apiV1Router.use(localFilesRouter);
apiV1Router.use(adminRouter);

apiV1Router.use(workspacesRouter);
apiV1Router.use(customersRouter);
apiV1Router.use(productsRouter);
apiV1Router.use(quotesRouter);
apiV1Router.use(invoicesRouter);
apiV1Router.use(paymentsRouter);
apiV1Router.use(receiptsRouter);
apiV1Router.use(expensesRouter);
apiV1Router.use(recurringInvoicesRouter);
apiV1Router.use(dashboardRouter);
apiV1Router.use(reportsRouter);
apiV1Router.use(notificationsRouter);
apiV1Router.use(filesRouter);
apiV1Router.use(billingRouter);
apiV1Router.use(supportTicketsRouter);
apiV1Router.use(apiKeysRouter);
