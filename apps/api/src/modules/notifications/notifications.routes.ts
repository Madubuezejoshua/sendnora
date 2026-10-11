import { Router } from 'express';
import { prisma } from '@sendnaro/database';
import {
  paginationQuerySchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  type PaginationQuery,
} from '@sendnaro/shared';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { paginate, toSkipTake } from '../../services/pagination.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/notifications',
  validateQuery(paginationQuerySchema),
  async (req, res, next) => {
    try {
      const query = req.query as unknown as PaginationQuery;
      const where = { userId: req.auth!.userId };
      const [items, totalItems, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          ...toSkipTake(query),
          orderBy: { createdAt: 'desc' },
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId: req.auth!.userId, readAt: null } }),
      ]);
      res.json({ ...paginate(items, totalItems, query), unreadCount });
    } catch (err) {
      next(err);
    }
  },
);

notificationsRouter.post('/notifications/:id/read', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.auth!.userId },
      data: { readAt: new Date() },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post('/notifications/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post(
  '/notifications/push-subscribe',
  validateBody(pushSubscribeSchema),
  async (req, res, next) => {
    try {
      const { endpoint, keys } = req.body;
      await prisma.pushSubscription.upsert({
        where: { endpoint },
        create: { userId: req.auth!.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
        update: { userId: req.auth!.userId, p256dh: keys.p256dh, auth: keys.auth },
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

notificationsRouter.delete(
  '/notifications/push-subscribe',
  validateBody(pushUnsubscribeSchema),
  async (req, res, next) => {
    try {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: req.body.endpoint, userId: req.auth!.userId },
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
