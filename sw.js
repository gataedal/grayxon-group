/* Grayxon Academy · Web Push Service Worker v43 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function encodePushTarget(data) {
  const payload = {
    id: data.id || data.notification_id || data.notificationId || null,
    type: data.type || data.notification?.type || null,
    link_page: data.link_page || data.linkPage || data.notification?.data?.link_page || null,
    link_target: data.link_target || data.linkTarget || data.notification?.data?.link_target || data.url || data.notification?.data?.url || null,
    related_week_start: data.related_week_start || data.relatedWeekStart || data.notification?.data?.related_week_start || null,
    related_week_end: data.related_week_end || data.relatedWeekEnd || data.notification?.data?.related_week_end || null
  };
  if (!payload.type && !payload.link_page && !payload.link_target) return null;
  try {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000));
    return `/#push/${btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`;
  } catch (_) { return null; }
}

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    data = { title: 'Grayxon', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || data.notification?.title || 'Grayxon';
  const body = data.body || data.message || data.notification?.body || 'Tienes una novedad en Grayxon.';
  const universalTarget = encodePushTarget(data);
  const target = universalTarget || data.link_target || data.linkTarget || data.url || data.notification?.data?.link_target || data.notification?.data?.url || './';
  const icon = data.icon || './assets/grayxon-logo.png';
  const badge = data.badge || './assets/grayxon-logo.png';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon,
    badge,
    data: { url: target },
    tag: data.tag || 'grayxon-notification',
    renotify: true,
    requireInteraction: false
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || './';
  const absolute = new URL(target, self.location.origin).href;

  event.waitUntil((async () => {
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
