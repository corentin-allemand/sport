// Service worker : l'app fonctionne hors ligne.
// VERSION est réécrite par scripts/build-precache.mjs (hash du contenu de public/) :
// un nouveau hash change ce fichier, donc le navigateur installe la nouvelle version.
const VERSION = '215eb39d9efb';
const PREFIX = 'sport-';
const CACHE = `${PREFIX}${VERSION}`;
const FONTS_CACHE = `${PREFIX}fonts`;
const SCOPE = new URL('./', self.location).href;

// Toujours du réseau d'abord (contenu qui évolue), repli sur le cache.
const NETWORK_FIRST = new Set(['index.html', 'data/program.json', 'data/media.json', 'precache.json']);

const rel = (url) => (url.startsWith(SCOPE) ? url.slice(SCOPE.length).split(/[?#]/)[0] : null);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const res = await fetch('precache.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`precache.json : HTTP ${res.status}`);
    const { files = [] } = await res.json();
    const cache = await caches.open(CACHE);
    // reload : on contourne le cache HTTP pour ne pas figer un fichier périmé.
    await cache.addAll(files.map((f) => new Request(f, { cache: 'reload' })));
    // Pas de skipWaiting ici : l'app propose « Mettre à jour » quand elle est prête.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith(PREFIX) && k !== CACHE && k !== FONTS_CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
});

async function networkFirst(request, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200) {
    const cache = await caches.open(CACHE);
    cache.put(request, res.clone());
  }
  return res;
}

// Google Fonts : cache à l'exécution. Hors ligne sans cache, la police système prend le relais.
async function fonts(request) {
  const cache = await caches.open(FONTS_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  } catch {
    return new Response('', { status: 503, statusText: 'Hors ligne' });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fonts(request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Les requêtes Range (vidéo) passent par le réseau, le cache ne sait pas y répondre.
  if (request.headers.has('range')) return;

  const path = rel(url.href);
  if (path === null) return;

  if (request.mode === 'navigate' || path === '' || path === 'index.html') {
    event.respondWith(networkFirst(request, 'index.html'));
  } else if (NETWORK_FIRST.has(path)) {
    event.respondWith(networkFirst(request, path));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
