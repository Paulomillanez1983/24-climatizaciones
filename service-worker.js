const CACHE = '24-climatizaciones-v44';
const ASSETS = [
  './',
  './index.html',
  './admin/',
  './factory/',
  './clients/',
  './portal/',
  './analytics.html',
  './googleb079afa0a804acaa.html',
  './icon.svg',
  './manifest.webmanifest',
  './robots.txt',
  './sitemap.xml',
  './llms.txt',
  './assets/flow/presupuesto-5-min.webp',
  './assets/flow/ruta-tecnico.webp',
  './assets/flow/fotos-servicio.webp',
  './assets/flow/whatsapp-solicitud.webp',
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
