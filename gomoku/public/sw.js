// Online games always use live server state. Only the offline fallback is cached.
const CACHE='cheonwon-shell-v1';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.add('/gomoku/offline.html'))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cheonwon-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{if(e.request.mode==='navigate'&&new URL(e.request.url).pathname.startsWith('/gomoku/'))e.respondWith(fetch(e.request).catch(()=>caches.match('/gomoku/offline.html')));});
