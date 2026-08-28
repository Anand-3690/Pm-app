// Bump this string on any deploy where you want caches fully cleared.
// The build hash in filenames handles JS/CSS; this covers the SW's own cache.
const CACHE_NAME = 'pm-app-v2';
const PRECACHE_URLS = ['/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  // Do NOT auto-skipWaiting here — we let the page decide when to activate,
  // so the user isn't reloaded mid-action. The page posts SKIP_WAITING.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// The page can tell a waiting worker to activate immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const req = event.request;
  const url = new URL(req.url);

  // Never cache API / auth / realtime — always hit network.
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('api.sevak.live') ||
    url.pathname.includes('/auth/') ||
    url.pathname.includes('/realtime/') ||
    req.headers.get('RSC') === '1' ||                  // Next RSC navigation payloads
    url.search.includes('_rsc')                        // RSC query param
  ) {
    return; // let the browser handle it normally
  }

  // Navigations (HTML): network-first, fall back to cache, then offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('/offline'))
        )
    );
    return;
  }

  // Static assets (hashed JS/CSS/images): cache-first is safe because the
  // filename changes when content changes. Falls through to network on miss.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      });
    })
  );
});

// ─────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS — add these two listeners to public/sw.js.
// They were dropped when the service worker was rewritten for
// auto-update. Without them, pushes arrive but are never shown.
//
// The worker sends: { title, body, url }
// ─────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'SEVAK', body: event.data.text() };
  }

  const title = payload.title || 'SEVAK';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/dashboard' },
    tag: payload.url || 'sevak',   // collapses duplicate notifications for the same target
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If a window is already open, focus it and navigate.
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window.
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});