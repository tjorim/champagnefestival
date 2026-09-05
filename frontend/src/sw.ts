/// <reference lib="webworker" />
export {};

declare const self: ServiceWorkerGlobalScope;

// This is the site's one production service worker (see
// docs/decisions/941-web-push-foundation.md for the shared-worker contract).
// It exists solely so the site meets PWA installability criteria — a
// registered service worker is one of the requirements browsers check before
// offering "Add to Home Screen" / install. It deliberately does no caching
// and queues nothing: #937 (offline web check-in) was explicitly descoped to
// require live connectivity, and this worker doesn't change that. A future
// feature that needs real caching or push handling (e.g. #941 Web Push) adds
// its own listeners here, following that document's additive-module and
// versioned-cache-name contract, without touching the skeleton below.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Plain network passthrough — no caching, no offline fallback.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
