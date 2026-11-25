// 3W · Fotos de campo — guarda o app no celular para abrir sem internet.
const CACHE = 'fotos3w-v1';
const ARQS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // API do Google passa direto
  e.respondWith(caches.open(CACHE).then(async c => {
    const chave = req.mode === 'navigate' ? './index.html' : req;
    const guardado = await c.match(chave);
    const rede = fetch(req).then(r => { if (r && r.ok) c.put(chave, r.clone()); return r; }).catch(() => null);
    return guardado || (await rede) || new Response('Sem internet e o app ainda não foi guardado. Abra uma vez com internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
