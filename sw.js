/* Easy Fahrstundenplaner – Service Worker
   Macht die App installierbar (iPhone/Android) und startet sie auch bei schlechtem Netz.
   Strategie: immer zuerst aus dem Netz laden (damit Updates sofort ankommen),
   nur wenn das Netz fehlt, die zuletzt geladene Version aus dem Speicher nehmen.
   Daten (Supabase) werden NIE zwischengespeichert. */
const CACHE = "fsp-v15";
const SHELL = ["./", "index.html", "style.css", "app.js", "config.js", "legal.js", "logo.svg", "logo-license.svg", "logo-license-plain.svg", "logo-license-wheel.svg", "logo-license-blue.svg", "logo-road-check.svg", "logo-wheel-clock.svg", "logo-calendar-road.svg", "logo-e-lanes.svg", "logo-curve.svg", "logo-w-e-serif.svg", "logo-w-e-futura.svg", "logo-w-e-lanes.svg", "logo-w-road-check.svg", "logo-w-wheel-clock.svg", "logo-w-seal.svg", "logo-n-e-arrow.svg", "logo-n-traffic-e.svg", "logo-n-pin.svg", "logo-n-cal-wheel.svg", "logo-n-sign.svg", "logo-n-e-geo.svg", "manifest.webmanifest",
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
