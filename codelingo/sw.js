// Offline cache. Bump CACHE when any file changes so phones pick up the update.
const CACHE = 'codelingo-1.0.4';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'i18n.js', 'manifest.webmanifest',
  'courses/_core.js', 'courses/html.js', 'courses/css.js', 'courses/js.js',
  'courses/ts.js', 'courses/py.js', 'courses/sql.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('index.html')))
  );
});
