import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signageResponse } from "./signage";

describe("public signage worker cache", () => {
  const match = vi.fn();
  const put = vi.fn();
  const open = vi.fn();
  const network = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("self", { location: { origin: "https://festival.test" } });
    vi.stubGlobal("fetch", network);
    vi.stubGlobal("caches", { open });
    open.mockResolvedValue({ match, put });
    put.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });
  it("leaves APIs, writes and other origins to the shared worker", () => {
    expect(signageResponse(new Request("https://festival.test/api/me"))).toBeUndefined();
    expect(
      signageResponse(new Request("https://festival.test/uploads/test", { method: "POST" })),
    ).toBeUndefined();
    expect(signageResponse(new Request("https://other.test/assets/test.js"))).toBeUndefined();
    expect(open).not.toHaveBeenCalled();
  });
  it("serves warmed public assets offline despite Origin variance", async () => {
    const cached = new Response("cached script");
    network.mockRejectedValue(new Error("Offline"));
    match.mockResolvedValue(cached);
    const request = new Request("https://festival.test/assets/test.js");
    expect(await signageResponse(request)).toBe(cached);
    expect(match).toHaveBeenCalledWith(request, { ignoreVary: true });
  });
  it("uses a saved asset when the server is temporarily unavailable", async () => {
    const cached = new Response("saved script");
    network.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    match.mockResolvedValue(cached);
    expect(await signageResponse(new Request("https://festival.test/assets/test.js"))).toBe(cached);
  });
  it("keeps live requests usable when quota is exhausted", async () => {
    const live = new Response("live script");
    network.mockResolvedValue(live);
    put.mockRejectedValue(new Error("Quota"));
    expect(await signageResponse(new Request("https://festival.test/assets/test.js"))).toBe(live);
  });
  it("keeps live requests usable when storage is disabled", async () => {
    const live = new Response("live image");
    network.mockResolvedValue(live);
    open.mockRejectedValue(new Error("Storage disabled"));
    expect(await signageResponse(new Request("https://festival.test/images/logo.svg"))).toBe(live);
  });
});
