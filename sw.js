/* Easy Fahrstundenplaner – Service Worker
   Macht die App installierbar (iPhone/Android) und startet sie auch bei schlechtem Netz.
   Strategie: immer zuerst aus dem Netz laden (damit Updates sofort ankommen),
   nur wenn das Netz fehlt, die zuletzt geladene Version aus dem Speicher nehmen.
   Daten (Supabase) werden NIE zwischengespeichert. */
const CACHE = "fsp-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "config.js", "legal.js", "logo.svg", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // Supabase & CDN: normal laden
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined))
    .then((hit) => hit || Response.error())));
});
