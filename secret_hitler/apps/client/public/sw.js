const CACHE='secret-hitler-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/secret_hitler/','/secret_hitler/icon-192.png','/secret_hitler/icon-512.png'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('secret-hitler-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 // Never intercept realtime traffic, private payloads, external resources or writes.
 if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('socket.io')||!url.pathname.startsWith('/secret_hitler/'))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put('/secret_hitler/',copy));}return response;}).catch(()=>caches.match('/secret_hitler/')));return;
 }
 if(/\.(js|css|png|svg|webmanifest)$/.test(url.pathname))event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put(req,copy));}return response;})));
});
