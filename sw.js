/* Grayxon Academy · Web Push Service Worker v40 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    data = { title: 'Grayxon', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || data.notification?.title || 'Grayxon';
  const body = data.body || data.message || data.notification?.body || 'Tienes una novedad en Grayxon.';
  const target = data.link_target || data.linkTarget || data.url || data.notification?.data?.link_target || data.notification?.data?.url || './';
  const icon = data.icon || './assets/grayxon-logo.png';
  const badge = data.badge || './assets/grayxon-logo.png';

  const options = {
    body,
    icon,
    badge,
    data: { url: target },
    tag: data.tag || 'grayxon-notification',
    renotify: true,
    requireInteraction: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || './';

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const absolute = new URL(target, self.location.origin).href;

    for (const client of clientsList) {
      if ('focus' in client) {
        try {
          if (client.url !== absolute && 'navigate' in client) await client.navigate(absolute);
        } catch (_) {}
        await client.focus();
        return;
      }
    }

    if (self.clients.openWindow) await self.clients.openWindow(absolute);
  })());
});
