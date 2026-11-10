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

// Notifications (Web Push, migration 0199 and supabase/functions/push-notify).
// The payload is { title, body, url, tag }; it never carries message text.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Tarbiyyah Global Academy", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Tarbiyyah Global Academy", {
      body: data.body || "",
      icon: "/app-icon-192.png",
      badge: "/app-icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
