const BASE = new URL('./', self.location.href).pathname;
const PREFIX = `neon-shell:${BASE}:`;
const CACHE = `${PREFIX}v2`;
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE)
    .then(cache => cache.addAll([BASE, `${BASE}icon.svg`, `${BASE}manifest.webmanifest`]))
    .then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith(BASE) || url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/socket.io') || url.pathname === '/health') return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      void caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(event.request) ||
      (event.request.mode === 'navigate' ? await cache.match(BASE) : null) || Response.error();
  }));
});
