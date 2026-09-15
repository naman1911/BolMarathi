// Offline shell — the page, its modules and the lexicon. The model weights
// are not here: they are hundreds of megabytes and belong to the runtime's
// own cache, fetched on request rather than on install, because an install
// step that large would fail on the connections this is meant for.
//
// The lexicon is fetched fresh when there is a network and served from cache
// when there is not, so edits reach the app but never break it.
const CACHE = 'bolpath-v7';
const SHELL = [
  './', './index.html', './manifest.json', './icon.svg',
  './app.js', './translate.worker.js', './engine.js',
  './detect.js', './translit.js', './search.js', './csv.js',
  './lexicon.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Model weights are handled by the runtime's own cache, and they are far
  // too large to pull through here. Never touch them.
  if (url.hostname.includes('huggingface') || url.pathname.includes('.onnx')) return;
  if (url.pathname.endsWith('.json') && url.pathname.includes('lexicon')) {
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
