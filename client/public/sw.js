/* SaathYaan Service Worker — offline shell + safe caching */
const CACHE = "saathyaan-v1";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/offline.html",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => null))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Strategy: network-first for navigation/app shell, cache-first for static,
// never cache API calls (they carry auth + live data).
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and API/webhooks
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/socket.io/")) return;

  // Leaflet + OSM tile cross-origin requests — cache them opportunistically
  if (url.hostname.includes("tile.openstreetmap.org") || url.hostname.includes("tile.thunderforest.com")) {
    e.respondWith(
      caches.match(e.request).then((hit) =>
        hit ||
        fetch(e.request)
          .then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open("saathyaan-tiles").then((c) => c.put(e.request, clone));
            }
            return res;
          })
          .catch(() => caches.match("/offline.html") || new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // App navigation: network-first, fall back to cached shell or offline page
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put("/", clone));
          return res;
        })
        .catch(() =>
          caches.match("/").catch(() => caches.match("/offline.html"))
        )
    );
    return;
  }

  // Other static assets (JS/CSS hashed by Vite; cache-first)
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok && url.origin === location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
    )
  );
});