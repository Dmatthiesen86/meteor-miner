// Offline-first service worker: the game always opens instantly from the device's cache,
// and quietly fetches updates in the background when online.
// Bump CACHE when shipping changes so devices pick them up on the next launch.
const CACHE = 'meteor-miner-v20';
const ASSETS = ['./', 'index.html', 'css/game.css', 'js/main.js', 'js/config.js', 'js/state.js',
  'js/input.js', 'js/game.js', 'js/render.js', 'js/ui.js', 'js/audio.js',
  'manifest.json', 'icon.svg'];

self.addEventListener('install', e => {
  // 'reload' skips the browser's own HTTP cache, so a new version never mixes old and new files.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (location.hostname === 'localhost') return; // local development: always serve fresh files
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
    const update = fetch(req, { cache: 'no-cache' })
      .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => undefined);
    if (cached) { e.waitUntil(update); return cached; }
    return (await update) || new Response('Offline', { status: 503 });
  }));
});
