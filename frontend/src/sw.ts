/// <reference lib="webworker" />
export {};

import { registerPushHandlers } from "./sw/push";

declare const self: ServiceWorkerGlobalScope;

// This is the site's one production service worker (see
// docs/decisions/941-web-push-foundation.md for the shared-worker contract).
// It exists partly so the site meets PWA installability criteria — a
// registered service worker is one of the requirements browsers check before
// offering "Add to Home Screen" / install — and now also carries #941's Web
// Push handlers (./sw/push.ts), added as its own module per the
// additive-handler contract rather than inline here. It still does no
// caching and queues nothing: #937 (offline web check-in) was explicitly
// descoped to require live connectivity, and this worker doesn't change
// that. A future feature that needs real caching adds its own
// versioned-cache-name module, following the same contract.

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

registerPushHandlers();
