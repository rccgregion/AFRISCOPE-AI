/*
 * AfriScope AI service worker.
 *
 * Version is intentional: bumping it replaces older workers on the next load
 * (old caches are deleted in `activate`). API responses are NEVER cached —
 * workspace, auth and realtime traffic must always hit the network.
 *
 * Strategy:
 *   /api/*            -> network only (no cache read, no cache write)
 *   navigation        -> network first, cached shell only as offline fallback
 *   hashed /assets/*  -> cache first (immutable, content-addressed)
 *   everything else   -> network first
 */
const VERSION = 'afriscope-v4-2026-10';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(['/', '/favicon.svg']))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

const isApi = (url) => url.pathname.startsWith('/api/');
const isAsset = (url) => url.pathname.startsWith('/assets/');
const isNavigation = (request) => request.mode === 'navigate';

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // API traffic: never touch the cache.
  if (isApi(url)) {
    return;
  }

  if (isNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match('/')
            .then((cached) => cached || Response.error()),
        ),
    );
    return;
  }

  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Static files (demo CSVs, favicon, etc.): network first.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
