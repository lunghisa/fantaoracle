// FantaOracle service worker — volutamente minimale.
// Strategia network-first: l'app si aggiorna SEMPRE dalla rete quando c'è
// connessione (mai versioni stantie); la cache serve solo come fallback
// offline per la shell. Le richieste cross-origin (Supabase, CDN) non
// vengono toccate.
//
// Da agosto 2026 la root "/" è la landing di marketing e l'app vive su
// "/app": in cache va la shell dell'app, non la landing.
const CACHE = 'fantaoracle-shell-v2';
const APP_SHELL = '/app';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => e.waitUntil(
  // Butta le cache vecchie (la v1 conteneva l'app sotto la chiave "/").
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isAppShell = req.mode === 'navigate' && url.pathname.indexOf('/app') === 0;
  e.respondWith(
    fetch(req).then(res => {
      if (isAppShell && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(APP_SHELL, copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      req.mode === 'navigate'
        ? caches.match(APP_SHELL).then(m => m || Response.error())
        : caches.match(req).then(m => m || Response.error())
    )
  );
});
