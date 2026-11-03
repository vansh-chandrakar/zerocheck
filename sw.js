const V = 'zerocheck-v1';
const ASSETS = ['./', 'index.html', 'style.css', 'themes.js', 'config.js', 'tracker.js', 'app.js', 'focus.js', 'music.js', 'calc.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Same-origin files: serve from cache, refresh in the background. Music and other sites are left to the browser.
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || u.pathname.includes('/music/')) return;
  e.respondWith(caches.open(V).then(async (c) => {
    const hit = await c.match(r);
    const net = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
