// Minimal service worker — mainly here to satisfy PWA installability
// requirements. Doesn't cache anything aggressively since this app is
// live-data-driven and shouldn't serve stale prices/signals offline.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through — always hit the network, never serve cached API responses.
  event.respondWith(fetch(event.request));
});
