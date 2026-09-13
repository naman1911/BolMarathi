// Offline shell. The page and its assets are cached on install; the phrase
// sheet is fetched fresh when the network is there and served from cache
// when it is not, so edits reach the app but never break it.
const CACHE = 'bolpath-v2';
const SHELL = ['./', './index.html', './manifest.json', './icon.svg', './phrases.csv'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
    await c.add('./corpus.csv').catch(() => {}); // optional second tier
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('.csv')) {
    e.respondWith(
      fetch(e.request).then(r => {
        caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok && (url.origin === location.origin || url.hostname.includes('gstatic') || url.hostname.includes('googleapis'))) {
        caches.open(CACHE).then(c => c.put(e.request, r.clone()));
      }
      return r;
    }))
  );
});
