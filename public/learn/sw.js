// TGA Portal service worker. Deliberately minimal: it makes the portal
// installable as an app and shows a friendly page when there is no internet.
// It does NOT cache the app itself, so every deploy is picked up immediately
// (the portal is served no-store; stale lessons or registers would be worse
// than no offline mode).
const OFFLINE = "/offline.html";
const CACHE = "tga-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/app-icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return; // everything else goes straight to the network
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});
