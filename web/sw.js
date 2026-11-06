// Traça service worker: the app opens even with weak signal.
// Terrain and other fixed files are kept once fetched (their URLs carry a content hash);
// the page and daily data always try the network first and fall back to the last copy.
const VERSION = '__VERSION__';
const SHELL = `shell-${VERSION}`, DATA = 'data-v1';
const SHELL_FILES = ['./', 'index.html', 'site.css', 'runtime.js', 'd3.min.js', 'app.js', 'manifest.webmanifest', 'about.html', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// one copy per file: drop older versions of the same path before storing the new one
const store = async (c, req, r) => { await c.delete(req, { ignoreSearch: true }); await c.put(req, r); };
const networkFirst = async (req, cacheName) => {
  const c = await caches.open(cacheName);
  try {
    const r = await fetch(req);
    if (r.ok) await store(c, req, r.clone());
    return r;
  } catch (e) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
};
const cacheFirst = async (req) => {
  const c = await caches.open(DATA);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) await store(c, req, r.clone());
  return r;
};
const FIXED = /\/data\/(terrain|terrain_rossland|glaciers|trips|avalanche_paths|documented_avalanches|t30_[a-z]+_\d_\d|t5_[a-z]+_\d_\d)\.json$/;
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
  if (FIXED.test(u.pathname) && u.search) { e.respondWith(cacheFirst(e.request)); return; }
  if (u.pathname.includes('/data/')) { e.respondWith(networkFirst(e.request, DATA)); return; }
  e.respondWith(networkFirst(e.request, SHELL));
});
