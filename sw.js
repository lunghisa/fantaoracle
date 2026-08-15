// FantaOracle service worker — volutamente minimale.
// Strategia network-first: l'app si aggiorna SEMPRE dalla rete quando c'è
// connessione (mai versioni stantie); la cache serve solo come fallback
// offline per la shell. Le richieste cross-origin (Supabase, CDN) non
// vengono toccate.
const CACHE = 'fantaoracle-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (req.mode === 'navigate' && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('/', copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      req.mode === 'navigate'
        ? caches.match('/').then(m => m || Response.error())
        : caches.match(req).then(m => m || Response.error())
    )
  );
});
