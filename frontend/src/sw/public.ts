/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;
declare const __PUBLIC_CACHE_VERSION__: string;
declare const __PUBLIC_SHELL__: string[];
export const PUBLIC_CACHE_PREFIX = "public-site-";
const cacheName = () => PUBLIC_CACHE_PREFIX + __PUBLIC_CACHE_VERSION__;
const endpoints = [
  "/api/editions/active",
  "/api/faq/active",
  "/api/announcements/active",
  "/api/settings",
];

export async function installPublicCache() {
  const cache = await caches.open(cacheName());
  await cache.addAll(__PUBLIC_SHELL__);
  // Initial page requests can precede worker control. Warm all supported locales.
  await Promise.allSettled(
    [
      "/api/editions/active?edition_type=festival",
      "/api/settings",
      ...["nl", "fr", "en"].flatMap((locale) => [
        `/api/faq/active?locale=${locale}`,
        `/api/announcements/active?locale=${locale}`,
      ]),
    ].map((url) => refresh(cache, new Request(new URL(url, self.location.origin)))),
  );
}

export async function activatePublicCache() {
  await Promise.all(
    (await caches.keys())
      .filter((name) => name.startsWith(PUBLIC_CACHE_PREFIX) && name !== cacheName())
      .map((name) => caches.delete(name)),
  );
}

async function refresh(cache: Cache, request: Request) {
  const response = await fetch(request);
  if (response.ok) {
    const headers = new Headers(response.headers);
    headers.set("x-public-cached-at", new Date().toISOString());
    const saved = new Response(await response.clone().blob(), { status: response.status, headers });
    await cache.put(request, saved).catch(() => {});
  }
  return response;
}

export function publicResponse(event: FetchEvent): Promise<Response> | undefined {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.headers.has("Authorization")
  )
    return;
  const api = endpoints.includes(url.pathname);
  const navigation = request.mode === "navigate" && /^\/(?:nl\/?|fr\/?|en\/?)?$/.test(url.pathname);
  const asset = __PUBLIC_SHELL__.includes(url.pathname);
  if (!api && !navigation && !asset) return;
  return (async () => {
    let cache: Cache;
    try {
      cache = await caches.open(cacheName());
    } catch {
      return fetch(request);
    }
    const key = navigation ? "/index.html" : request;
    const cached = await cache.match(key, { ignoreVary: true });
    if (!api && cached) return cached;
    const live = refresh(cache, request);
    if (cached) {
      event.waitUntil(
        live.then(
          () => {},
          () => {},
        ),
      );
      return cached;
    }
    return live;
  })();
}
