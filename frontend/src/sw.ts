/// <reference lib="webworker" />
export {};

import { registerPushHandlers } from "./sw/push";

declare const self: ServiceWorkerGlobalScope;

import { signageResponse } from "./sw/signage";

// Shared production worker: push and public signage caching only.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// The signage module only handles public GET requests.
self.addEventListener("fetch", (event) => {
  event.respondWith(signageResponse(event.request) ?? fetch(event.request));
});

registerPushHandlers();
