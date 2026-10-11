// Minimal service worker: exists only to receive Web Push events and relay
// them as OS notifications. No caching/offline strategy is implemented —
// this app is not an offline-first PWA, so a fetch handler would add risk
// (stale responses) without a corresponding benefit.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'InvoiceTap', body: event.data.text() };
  }

  const { title, body, url } = payload;
  event.waitUntil(
    self.registration.showNotification(title || 'InvoiceTap', {
      body,
      // No dedicated PNG notification icon has been produced yet (only
      // placeholder brand SVGs exist) — omitted rather than pointing at a
      // 404, so the browser falls back to its own default.
      data: { url: url || '/dashboard' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
