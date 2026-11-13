// Service worker simples: guarda os arquivos do app para abrir rápido.
// Nunca guarda chamadas ao Supabase (dados sempre atualizados).
const CACHE = 'midia-moriah-v3';
const ARQUIVOS = ['./', './index.html', './style.css', './app.js', './mensagens.js', './config.js', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase e CDN passam direto
  // Rede primeiro; se estiver sem internet, usa o que foi guardado.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});

// Preparado para a Fase 3 (notificações push)
self.addEventListener('push', (e) => {
  let dados = {};
  try { dados = e.data ? e.data.json() : {}; } catch (_) { dados = { title: 'Mídia Moriah', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(dados.title || 'Mídia Moriah', {
    body: dados.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png'
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abertas) {
      if ('focus' in c) { await c.focus(); c.postMessage({ tipo: 'abrir-sino' }); return; }
    }
    await self.clients.openWindow('./?abrir=sino');
  })());
});
