self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  // No caching strategy — this SW exists only to satisfy the PWA manifest.
  // Do not intercept fetch; let all requests go to the network normally.
});
