const CACHE = '24-climatizaciones-v11';
const ASSETS = [
  './',
  './index.html',
  './icon.svg',
  './manifest.webmanifest',
  './assets/brands/ariston.svg',
  './assets/brands/bgh.svg',
  './assets/brands/carrier.svg',
  './assets/brands/daikin.svg',
  './assets/brands/electrolux.svg',
  './assets/brands/hitachi.svg',
  './assets/brands/lg.svg',
  './assets/brands/midea.svg',
  './assets/brands/philco.svg',
  './assets/brands/rheem.svg',
  './assets/brands/samsung.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(() => null));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => cached)));
});
