self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  // Intentionally not calling clients.claim() — this SW caches nothing, so
  // taking over existing sessions mid-flight provides no benefit and can
  // disrupt in-flight requests.
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
