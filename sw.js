/* Grayxon Academy · Web Push Service Worker v47 · dedupe + portal-relative deep links */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function resolveTarget(data) {
  const nested = data?.record || data?.notification?.data || data?.data || {};
  const page = String(data?.link_page || data?.linkPage || nested?.link_page || nested?.linkPage || data?.page || nested?.page || '').toLowerCase();
  const raw = data?.link_target || data?.linkTarget || nested?.link_target || nested?.linkTarget || data?.url || nested?.url || data?.notification?.data?.url || page || '';
  const value = String(raw || '');
  const uuidMatch = value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  // Battle IDs are resolved by the portal after restoring the session; never treat them as LIVE IDs.
  if (page === 'event-match') return `./portal.html?grayxonPush=1&page=event-match&target=${encodeURIComponent(value)}#events`;

  // Payment routes take priority over UUID matching (which used to assume LIVE).
  if (page === 'payments' || value.toLowerCase() === 'payments' || data?.type === 'payment' || nested?.type === 'payment') {
    const target = uuidMatch ? value : String(data?.link_target || nested?.link_target || data?.target || nested?.target || '');
    const targetQuery = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target) ? `&target=${encodeURIComponent(target)}` : '';
    return `./portal.html?grayxonPush=1&page=payments${targetQuery}#payments`;
  }
  if (!value) return './portal.html';
  if (uuidMatch) return `./portal.html?grayxonPush=1&page=live-training&target=${encodeURIComponent(value)}#live-training/${value}`;
  if (/^live-training$/i.test(value)) return './portal.html?grayxonPush=1&page=live-training#live-training';
  if (/^missions?$/i.test(value)) return './portal.html?grayxonPush=1&page=missions#missions';
  if (/^(training|formation)$/i.test(value)) return './portal.html?grayxonPush=1&page=training#training';
  if (/^(manager|admin|profile|space|home|benefits|auth|announcements)$/i.test(value)) {
    const p = value.toLowerCase();
    return `./portal.html?grayxonPush=1&page=${encodeURIComponent(p)}#${p}`;
  }
  if (value.startsWith('#')) return `./portal.html${value}`;
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  return './portal.html';
}

function getPushParts(data) {
  const title = String(data?.title || data?.notification?.title || 'Grayxon');
  const body = String(data?.body || data?.message || data?.notification?.body || 'Tienes una novedad en Grayxon.');
  const target = resolveTarget(data);
  const nested = data?.record || data?.notification?.data || data?.data || {};
  const id = data?.notification_id || data?.notificationId || data?.id || nested?.id || data?.record?.id || '';
  // The DB notification ID is preferred; title/body/route is a fallback for
  // Edge Function payloads which omit it. Only a short duplicate window is used.
  const fingerprint = id ? `id:${String(id)}` : `msg:${title}|${body}|${target}`;
  const notificationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '')) ? String(id) : '';
  return { title, body, target, fingerprint, notificationId };
}

function shortHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

// Persist signatures in IndexedDB because service workers may be terminated
// between duplicate push events. Two copies of one push within 15 seconds are
// treated as one; different destinations remain distinct.
function isDuplicatePush(fingerprint, ttlMs = 15000) {
  return new Promise((resolve) => {
    if (!self.indexedDB) { resolve(false); return; }
    let request;
    try { request = indexedDB.open('grayxon-push-dedupe-v47', 1); }
    catch (_) { resolve(false); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('seen')) db.createObjectStore('seen', { keyPath: 'key' });
    };
    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      let transaction;
      try { transaction = db.transaction('seen', 'readwrite'); }
      catch (_) { db.close(); resolve(false); return; }
      const store = transaction.objectStore('seen');
      const key = shortHash(fingerprint);
      let duplicate = false;
      const get = store.get(key);
      get.onsuccess = () => {
        const now = Date.now();
        const previous = get.result;
        if (previous && now - Number(previous.at || 0) < ttlMs) {
          duplicate = true;
        } else {
          store.put({ key, at: now });
        }
        try {
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const item = cursor.result;
            if (!item) return;
            if (now - Number(item.value.at || 0) > 120000) item.delete();
            item.continue();
          };
        } catch (_) {}
      };
      transaction.oncomplete = () => { db.close(); resolve(duplicate); };
      transaction.onerror = transaction.onabort = () => { db.close(); resolve(false); };
    };
  });
}

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; }
    catch (_) { data = { title: 'Grayxon', body: event.data ? event.data.text() : '' }; }
    const { title, body, target, fingerprint, notificationId } = getPushParts(data);
    if (await isDuplicatePush(fingerprint)) {
      // Avoid a second banner/sound when the same underlying event is delivered twice.
      return;
    }
    const suppliedTag = data?.tag || data?.notification?.tag;
    const tag = suppliedTag ? String(suppliedTag) : `grayxon-${shortHash(fingerprint)}`;
    const icon = data.icon || './assets/grayxon-logo.png';
    const badge = data.badge || './assets/grayxon-logo.png';
    await self.registration.showNotification(title, {
      body, icon, badge, data: { url: target, notificationId }, tag,
      renotify: false, silent: false, requireInteraction: false
    });
  })());
});

function askClientToNavigate(client, absoluteUrl, notificationId = '', timeoutMs = 6500) {
  return new Promise(resolve => {
    let done = false;
    let timer;
    let channel;
    const finish = result => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { channel?.port1?.close(); } catch (_) {}
      resolve(result || null);
    };
    try {
      channel = new MessageChannel();
      channel.port1.onmessage = event => finish(event.data || null);
      timer = setTimeout(() => finish(null), timeoutMs);
      client.postMessage({ type: 'GRAYXON_NOTIFICATION_NAVIGATE_REQUEST', url: absoluteUrl, notificationId }, [channel.port2]);
    } catch (_) { finish(null); }
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const notificationData = event.notification?.data || {};
  const target = notificationData.url || './portal.html';
  const notificationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(notificationData.notificationId || ''))
    ? String(notificationData.notificationId) : '';
  event.waitUntil((async () => {
    const destination = new URL(target, self.registration.scope);
    // On cold launch, the portal reads this row ID after it restores the Supabase session.
    if (notificationId) destination.searchParams.set('grayxonNotificationId', notificationId);
    const absolute = destination.href;
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const inScopeClients = clientsList.filter(client => client.url && client.url.startsWith(self.registration.scope));

    // Reuse the authenticated Grayxon window and dispatch the same DB notification
    // through openNotification(), exactly like clicking it inside the bell panel.
    const attempts = await Promise.all(inScopeClients.map(async client => ({
      client,
      result: await askClientToNavigate(client, absolute, notificationId, 6500)
    })));
    for (const attempt of attempts) {
      if (attempt.result?.authenticated && attempt.result?.handled) {
        try { await attempt.client.focus(); } catch (_) {}
        return;
      }
    }

    // If there is an existing window that cannot handle the message, keep the
    // exact notification ID in the URL for app startup/login recovery.
    for (const client of inScopeClients) {
      try {
        const navigated = await client.navigate(absolute);
        if (navigated) { await navigated.focus(); return; }
      } catch (_) {}
    }
    if (self.clients.openWindow) await self.clients.openWindow(absolute);
  })());
});
