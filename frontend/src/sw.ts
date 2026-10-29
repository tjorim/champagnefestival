/// <reference lib="webworker" />
export {};

import { installPublicCache, activatePublicCache, publicResponse } from "./sw/public";
import { registerPushHandlers } from "./sw/push";

declare const self: ServiceWorkerGlobalScope;

import { signageResponse } from "./sw/signage";

// Shared worker; public and signage caches have independent lifecycles.
self.addEventListener("install", (event) => {
  event.waitUntil(installPublicCache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activatePublicCache().then(() => self.clients.claim()));
});

// The signage module only handles public GET requests.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    publicResponse(event) ?? signageResponse(event.request) ?? fetch(event.request),
  );
});

registerPushHandlers();
