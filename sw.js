// Molecule Lab service worker: keeps the whole app on the device so drawing, 3D and
// the calculated facts work offline. Naming lookups (PubChem, OPSIN) always go to the network.
// Bump VERSION whenever any file below changes, so phones pick up the new copy.
const VERSION = 'molecule-lab-v15';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './openchemlib.js',
  './chair.js',
  './namer.js',
  './reactivity.js',
  './reagents.js',
  './predict.js',
  './reactions-ui.js',
  './mech-view.js',
  './mech-templates.js',
  './data/mech-text.json',
  './data/reagents.json',
  './data/rules.json',
  './resources.json',
  './3Dmol-min.js',
  './fonts/pixelify-sans-latin-400-normal.woff2',
  './fonts/pixelify-sans-latin-600-normal.woff2',
  './fonts/vt323-latin-400-normal.woff2',
  './fonts/press-start-2p-latin-400-normal.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('molecule-lab-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // PubChem / OPSIN: network only

  // Pages: try the network first so updates show up, fall back to the cached app offline.
  if (req.mode === 'navigate'){
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }
  // Everything else (libraries, fonts, icons): cache first, it's large and versioned.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok){ const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
