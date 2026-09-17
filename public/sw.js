// Klown Pay service worker.
// Purpose: make the app shell load fast on weak signal and show a friendly
// offline page for page loads. It does NOT make payments work offline — the
// charge itself always needs the network. This SW never caches API responses
// and always passes /api/* straight through to the network.

const VERSION = 'klown-v1';
const STATIC_CACHE = VERSION + '-static';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/klown-logo.png', '/icon-192.png', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const c = await caches.open(STATIC_CACHE);
      await c.addAll(PRECACHE);
    } catch (e) { /* a missing precache asset must never block install */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event && event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;      // third-party (Paystack etc.) — untouched
  if (url.pathname.startsWith('/api/')) return;          // live data / payments — always network

  // Hashed, immutable build output: cache-first (the URL changes when the file does).
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/_build/')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Page loads: network-first so a new deploy is always picked up; fall back to the
  // offline page only when the network is truly unreachable.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstDoc(req));
    return;
  }

  // Other same-origin static (logo, icons, images, fonts): serve cached fast, refresh in background.
  event.respondWith(staleWhileRevalidate(req));
});

async function cacheFirst(req) {
  const c = await caches.open(STATIC_CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) c.put(req, res.clone());
  return res;
}

async function networkFirstDoc(req) {
  try {
    return await fetch(req);
  } catch (e) {
    const c = await caches.open(STATIC_CACHE);
    const off = await c.match(OFFLINE_URL);
    return off || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(STATIC_CACHE);
  const hit = await c.match(req);
  const fetching = fetch(req)
    .then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; })
    .catch(() => hit);
  return hit || fetching;
}
