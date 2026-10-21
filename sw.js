/* Service worker : l'app se charge même sans réseau (réseau d'abord, copie locale en secours). */
const VERSION = 'cartes-v2';
const FICHIERS = ['./', 'index.html', 'styles.css', 'app.js', 'logique.js', 'manifest.webmanifest',
                  'vendor/katex/katex.min.js', 'vendor/katex/katex.min.css', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    const copie = r.clone();
    caches.open(VERSION).then(c => c.put(e.request, copie));
    return r;
  }).catch(() => caches.match(e.request)));
});
