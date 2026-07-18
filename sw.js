/*
 * Europe 2027 trip site — service worker.
 * Strategy chosen for a reference site used OVERSEAS by non-technical travellers:
 *   - Page (navigation): NETWORK-FIRST. Online => always the freshest itinerary.
 *     Offline => the last-seen copy. This means the site can NEVER "trap" someone
 *     on a stale version while they have signal — the #1 PWA footgun, avoided.
 *   - Static assets (icons/manifest): stale-while-revalidate (instant + self-updating).
 *   - Cross-origin requests (e.g. Google Maps links): passed straight through, never cached.
 * Bump CACHE_VERSION to force a clean re-cache on next visit.
 */
const CACHE_VERSION = 'v2-2026-07-18';
const CACHE = 'europe2027-' + CACHE_VERSION;

const CORE = [
  './',
  './index.html',
  './breisach-walking-tour.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('europe2027-') && k !== CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Optional kill-switch: page can postMessage('SKIP_WAITING') to activate an update immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through untouched

  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // NETWORK-FIRST: fresh when online, cached fallback when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // STATIC ASSETS: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
