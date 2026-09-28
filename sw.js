/* Grayxon Academy · Web Push Service Worker v41 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function resolveTarget(data) {
  const raw = data?.link_target || data?.linkTarget || data?.url || data?.notification?.data?.link_target || data?.notification?.data?.url || data?.link_page || data?.linkPage || '';
  if (!raw) return './';
  const value = String(raw);
  const uuid = value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  if (uuid) return `./#live-training/${uuid[0]}`;
  if (/^live-training$/i.test(value)) return './#live-training';
  if (/^missions?$/i.test(value)) return './#missions';
  if (/^(training|formation)$/i.test(value)) return './#training';
  if (/^(manager|admin|profile|space|home|benefits|auth)$/i.test(value)) return `./#${value.toLowerCase()}`;
  if (value.startsWith('#')) return `.${value}`;
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  return './';
}

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    data = { title: 'Grayxon', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || data.notification?.title || 'Grayxon';
  const body = data.body || data.message || data.notification?.body || 'Tienes una novedad en Grayxon.';
  const target = resolveTarget(data);
  const icon = data.icon || './assets/grayxon-logo.png';
  const badge = data.badge || './assets/grayxon-logo.png';
  event.waitUntil(self.registration.showNotification(title, {
    body, icon, badge,
    data: { url: target },
    tag: data.tag || 'grayxon-notification',
    renotify: true,
    requireInteraction: false
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || './';
  event.waitUntil((async () => {
    const absolute = new URL(target, self.location.origin).href;
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
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
