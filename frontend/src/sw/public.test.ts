import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activatePublicCache, publicResponse } from "./public";
const network = vi.fn();
const match = vi.fn();
const put = vi.fn();
const remove = vi.fn();
beforeEach(() => {
  vi.stubGlobal("__PUBLIC_CACHE_VERSION__", "new");
  vi.stubGlobal("__PUBLIC_SHELL__", ["/index.html", "/assets/app.js"]);
  vi.stubGlobal("self", { location: { origin: "https://festival.test" } });
  vi.stubGlobal("fetch", network);
  vi.stubGlobal("caches", {
    open: vi.fn().mockResolvedValue({ match, put }),
    keys: vi.fn().mockResolvedValue(["public-site-old", "public-site-new", "signage-shell-v1"]),
    delete: remove,
  });
  put.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
function event(path: string, init?: RequestInit) {
  return {
    request: new Request(`https://festival.test${path}`, init),
    waitUntil: vi.fn(),
  } as unknown as FetchEvent;
}
it("invalidates only older public caches", async () => {
  await activatePublicCache();
  expect(remove.mock.calls).toEqual([["public-site-old"]]);
});
it("never handles writes, private APIs or authenticated requests", () => {
  for (const e of [
    event("/api/registrations", { method: "POST" }),
    event("/api/me"),
    event("/api/settings", { headers: { Authorization: "Bearer test" } }),
  ]) {
    expect(publicResponse(e)).toBeUndefined();
  }
  expect(network).not.toHaveBeenCalled();
});
it("serves saved public data immediately and revalidates without failing offline", async () => {
  const cached = new Response("saved");
  match.mockResolvedValue(cached);
  network.mockRejectedValue(new Error("offline"));
  const e = event("/api/faq/active?locale=nl");
  expect(await publicResponse(e)).toBe(cached);
  expect(e.waitUntil).toHaveBeenCalled();
});
it("does not replace good data with a server failure", async () => {
  network.mockResolvedValue(new Response("failure", { status: 503 }));
  await publicResponse(event("/api/settings"));
  expect(put).not.toHaveBeenCalled();
});
it("timestamps successful responses", async () => {
  network.mockResolvedValue(new Response("{}"));
  await publicResponse(event("/api/settings"));
  expect(put.mock.calls[0]![1]!.headers.get("x-public-cached-at")).toBeTruthy();
});
