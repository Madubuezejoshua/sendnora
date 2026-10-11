'use client';

import * as React from 'react';
import { apiBrowserFetch } from '@/lib/api-browser';

export type PushSupportState = 'unsupported' | 'unconfigured' | 'default' | 'granted' | 'denied';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Wraps the browser Push API + our /notifications/push-subscribe endpoint.
 * Returns 'unconfigured' rather than throwing when VAPID isn't set up for
 * this deployment — push is an optional enhancement, never required.
 */
export function usePushSubscription() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = React.useState<PushSupportState>('default');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      setState('unsupported');
      return;
    }
    if (!vapidPublicKey) {
      setState('unconfigured');
      return;
    }
    setState(
      Notification.permission === 'granted'
        ? 'granted'
        : Notification.permission === 'denied'
          ? 'denied'
          : 'default',
    );
  }, [vapidPublicKey]);

  const subscribe = React.useCallback(async () => {
    if (!vapidPublicKey || state === 'unsupported') return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'default');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = subscription.toJSON();

      await apiBrowserFetch('/notifications/push-subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setState('granted');
    } finally {
      setBusy(false);
    }
  }, [vapidPublicKey, state]);

  const unsubscribe = React.useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await apiBrowserFetch('/notifications/push-subscribe', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, subscribe, unsubscribe };
}
