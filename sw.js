// Service worker: keeps the app shell on the phone so it opens without signal. Supabase calls (another
// origin) are never cached here — offline data lives in IndexedDB (js/store.js).
// Bump the version on every release so phones pick up the new files.
const CACHE = 'cc-app-2';

const SHELL = [
  './',
  'index.html',
  'config.js',
  'manifest.webmanifest',
  'css/app.css',
  'vendor/supabase.js',
  'js/app.js',
  'js/categories.js',
  'js/context.js',
  'js/data.js',
  'js/icons.js',
  'js/idb.js',
  'js/money.js',
  'js/periods.js',
  'js/replay.js',
  'js/rueda.js',
  'js/store.js',
  'js/supabase-client.js',
  'js/ui.js',
  'js/sheets/comprado.js',
  'js/sheets/item-form.js',
  'js/sheets/purchase-form.js',
  'js/sheets/turn.js',
  'js/views/auth.js',
  'js/views/casa.js',
  'js/views/cierre.js',
  'js/views/compras.js',
  'js/views/cuentas.js',
  'js/views/instalar.js',
  'js/views/lista.js',
  'js/views/meses.js',
  'js/views/onboarding.js',
  'js/views/recetas.js',
  'js/views/rueda-setup.js',
  'js/views/rueda.js',
  'assets/fonts/figtree-latin-400-normal.woff2',
  'assets/fonts/figtree-latin-500-normal.woff2',
  'assets/fonts/figtree-latin-600-normal.woff2',
  'assets/fonts/figtree-latin-700-normal.woff2',
  'assets/fonts/bricolage-grotesque-latin-600-normal.woff2',
  'assets/fonts/bricolage-grotesque-latin-700-normal.woff2',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE && key.startsWith('cc-app-')) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase and anything else: straight to the network

  // Pages and config.js: network first (fresh deploys, new keys), cached copy when there is no signal.
  if (req.mode === 'navigate' || url.pathname.endsWith('/config.js')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) (await caches.open(CACHE)).put(req.mode === 'navigate' ? 'index.html' : req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req.mode === 'navigate' ? 'index.html' : req)) ?? Response.error();
      }
    })());
    return;
  }
  // Everything else in the shell: cache first.
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && url.pathname.match(/\.(js|css|woff2|png|svg|webmanifest)$/)) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});
