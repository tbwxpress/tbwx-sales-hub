/**
 * TBWX Sales Hub — Service Worker
 *
 * Cache strategy:
 *   /api/*          → NETWORK-ONLY (real-time data, never cached)
 *   /_next/static/* → CACHE-FIRST  (immutable hashed assets)
 *   images          → CACHE-FIRST  (long-lived)
 *   HTML pages      → NETWORK-FIRST with cache fallback
 *
 * Push handler (Wave C hook):
 *   Wave C will send Web Push payloads to this SW.
 *   Expected payload shape: { title, body, url, icon, badge, tag }
 *   The push handler below is ready to receive them.
 */

const CACHE_NAME = 'tbwx-saleshub-v1';

const APP_SHELL = [
  '/',
  '/today',
  '/inbox',
  '/leads',
  '/manifest.webmanifest',
];

// ─── Install ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Best-effort — some shell URLs may 401 before login; ignore failures.
      return Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // API routes — always network, never cache.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Immutable static assets (_next/static) and images — cache-first.
  if (
    url.pathname.startsWith('/_next/static/') ||
    /\.(png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML navigation — network-first, fallback to cache.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }
});

// ─── Push (Wave C hook) ───────────────────────────────────────────────────────
//
// Wave C will fire Web Push notifications by posting JSON payloads to the
// VAPID endpoint. This handler parses the payload and shows the notification.
// Expected shape: { title, body, url, icon, badge, tag }
//
// To extend: add actions, vibrate, or renotify fields inside showNotification().

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'TBWX Sales Hub', body: event.data.text() };
  }

  const {
    title = 'TBWX Sales Hub',
    body = '',
    url = '/today',
    icon = '/icon-192.png',
    badge = '/icon-192.png',
    tag = 'tbwx-notification',
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: { url },
    })
  );
});

// ─── Notification Click ───────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/today';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing window that already has the target URL open.
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
