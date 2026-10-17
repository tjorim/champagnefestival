import { describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { exportArchive, offlineHtml, renderSlideImages } from "./export";
import type { Playlist } from "./types";

vi.mock("html-to-image", () => ({
  toBlob: vi.fn().mockRejectedValue(new Error("Capture failed")),
}));
const playlist: Playlist = {
  epoch: "2026-10-01T00:00:00Z",
  revision: "v1",
  slides: [
    {
      id: "one",
      kind: "notice",
      duration: 7,
      text: "Notice",
      title: null,
      image: null,
      icon: null,
      organization: null,
      template: {
        background: { kind: "color", color: "#000000", end_color: "#000000", image: null },
        layers: [],
      },
    },
  ],
};

describe("signage export", () => {
  it("packages the same PNG bytes in both export formats and freezes timing", () => {
    const images = { "slides/001.png": new Uint8Array([1, 2, 3]) };
    const labels = { start: "Start", setup: "Offline" };
    const bundle = unzipSync(exportArchive(playlist, images, true, labels));
    const onlyImages = unzipSync(exportArchive(playlist, images, false, labels));
    expect(onlyImages).toEqual(images);
    expect(bundle["slides/001.png"]).toEqual(images["slides/001.png"]);
    expect(JSON.parse(strFromU8(bundle["playlist.json"]!))).toEqual({
      revision: "v1",
      epoch: playlist.epoch,
      slides: [{ duration: 7, image: "slides/001.png" }],
    });
  });
  it("escapes labels and embedded JSON so exported content cannot inject scripts", () => {
    const html = offlineHtml(
      { revision: "</script><script>alert(1)</script>", epoch: playlist.epoch, slides: [] },
      "<img src=x>",
      "<script>bad</script>",
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("<title>&lt;img src=x&gt;</title>");
    expect(html).toContain("\\u003c/script>");
  });
  it("rejects unavailable assets instead of creating incomplete slides", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    try {
      await expect(
        renderSlideImages({
          ...playlist,
          slides: [{ ...playlist.slides[0]!, image: "/missing.png" }],
        }),
      ).rejects.toThrow("Export image unavailable");
      expect(document.querySelector(".site-signage-export")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("cleans up its render root on capture failure", async () => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    await expect(renderSlideImages(playlist)).rejects.toThrow("Capture failed");
    expect(document.querySelector(".site-signage-export")).toBeNull();
  });
});
