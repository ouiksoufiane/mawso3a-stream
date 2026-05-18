// Service Worker — الموسوعة ستريم
const CACHE = 'mawso3a-v3';
const STATIC = [
  '/',
  '/index.html',
  '/films.html',
  '/series.html',
  '/search.html',
  '/film-detail.html',
  '/series-detail.html',
  '/category.html',
  '/watch.html',
  '/404.html',
  '/request.html',
  '/legal.html',
  '/css/main.css',
  '/js/api.js',
  '/js/utils.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always network-first for API calls and Supabase
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    return;
  }

  // Cache-first for static assets
  if (e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached || caches.match('/404.html') || new Response('Offline', { status: 503 }));
      })
    );
  }
});
