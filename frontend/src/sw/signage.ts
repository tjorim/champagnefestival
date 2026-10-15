/// <reference lib="webworker" />
export {};
declare const self: ServiceWorkerGlobalScope;
const CACHE = "signage-shell-v1";

/** Additive, GET-only cache. Never caches authentication or administrative APIs. */
export function signageResponse(request: Request): Promise<Response> | undefined {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const navigation = request.mode === "navigate" && url.pathname.startsWith("/signage/");
  const asset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/themes/") ||
    url.pathname.startsWith("/uploads/") ||
    url.pathname.startsWith("/images/");
  if (!navigation && !asset) return;
  return (async () => {
    let cache: Cache;
    try {
      cache = await caches.open(CACHE);
    } catch {
      return fetch(request);
    }
    try {
      const response = await fetch(request);
      if (!response.ok) {
        const cached = await cache.match(request, { ignoreVary: true });
        if (cached) return cached;
      }
      if (response.ok) {
        try {
          await cache.put(request, response.clone());
        } catch {
          /* Quota or disabled storage must not break live playback. */
        }
      }
      return response;
    } catch (error) {
      // Public immutable files can vary on Origin at the static server.
      // Prewarming and module loads send different Origin headers.
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;
      throw error;
    }
  })();
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "signage-cache" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(
        event.data.urls.slice(0, 2000).map(async (value: string) => {
          const url = new URL(value, self.location.origin);
          if (
            url.origin !== self.location.origin ||
            !(
              url.pathname.startsWith("/signage/") ||
              url.pathname.startsWith("/assets/") ||
              url.pathname.startsWith("/themes/") ||
              url.pathname.startsWith("/uploads/") ||
              url.pathname.startsWith("/images/")
            )
          )
            return;
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
        }),
      );
    })(),
  );
});
