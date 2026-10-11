import { prisma, type NotificationType } from '@invoicetap/database';
import { sendPushToUser } from './push.service.js';

export interface CreateNotificationInput {
  userId: string;
  workspaceId?: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Deep link included in the browser push payload (e.g. `/invoices/:id`). Not stored on the Notification row itself. */
  url?: string;
}

/**
 * Single entry point for creating an in-app notification. Always writes
 * the Notification row (powers the bell icon / notifications list);
 * additionally fires a browser push if the user has one or more active
 * subscriptions and VAPID is configured — see push.service.ts, which
 * no-ops quietly when it isn't. Never throws for the push half failing.
 */
export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data as never,
    },
  });

  await sendPushToUser(input.userId, {
    title: input.title,
    body: input.body,
    url: input.url,
  }).catch(() => {});

  return notification;
}
