/* Easy Fahrstundenplaner – Service Worker
   Macht die App installierbar (iPhone/Android) und startet sie auch bei schlechtem Netz.
   Strategie: immer zuerst aus dem Netz laden (damit Updates sofort ankommen),
   nur wenn das Netz fehlt, die zuletzt geladene Version aus dem Speicher nehmen.
   Daten (Supabase) werden NIE zwischengespeichert. */
const CACHE = "fsp-v115";
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
  // „no-cache“: immer beim Server nachfragen, ob es eine neuere Version gibt (sonst bis zu 10 Min. alt)
  e.respondWith(fetch(req, { cache: "no-cache" }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined))
    .then((hit) => hit || Response.error())));
});

// Push-Mitteilung empfangen (vom Server „notify“) und anzeigen
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const opts = { body: d.body || "", icon: "icons/icon-192.png", data: { url: d.url || "./" } };
  if (d.tag) opts.tag = d.tag;
  e.waitUntil(self.registration.showNotification(d.title || "Easy Fahrstundenplaner", opts));
});
// Antippen der Mitteilung → App öffnen (bzw. vorhandenes Fenster nach vorn holen)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || "./");
  }));
});
