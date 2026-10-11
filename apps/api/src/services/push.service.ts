import webpush from 'web-push';
import { prisma } from '@sendnaro/database';
import { parseApiEnv } from '@sendnaro/config/env';
import { logger } from '../config/logger.js';

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const env = parseApiEnv();
  if (!env.VAPID_PRIVATE_KEY || !env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) {
    return false;
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Sends a browser push to every device the user has subscribed on. A dead
 * subscription (410 Gone / 404, meaning the browser unsubscribed or the
 * endpoint expired) is deleted rather than retried — pushing to it again
 * would just fail the same way forever.
 *
 * No-ops silently (not an error) when VAPID isn't configured — browser
 * push is optional, additive on top of the in-app Notification row that's
 * always created regardless. See ENVIRONMENT.md for the VAPID_* variables.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureVapidConfigured()) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          logger.error({ err, userId }, 'Failed to send push notification');
        }
      }
    }),
  );
}
