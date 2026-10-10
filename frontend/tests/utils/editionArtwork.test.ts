import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEditionHeroImage } from "@/hooks/useEditionHeroImage";
import { editionShareImage, managedArtwork } from "@/utils/editionArtwork";

const path = (letter: string) => `/uploads/editions/${letter.repeat(32)}-${letter.repeat(64)}.jpg`;

describe("managedArtwork", () => {
  it("accepts only paths the backend stores", () => {
    expect(managedArtwork(path("a"))).toBe(path("a"));
    for (const value of [
      null,
      undefined,
      "",
      "/images/flyer.jpg",
      "https://example.com/x.jpg",
      "/uploads/editions/../secret.jpg",
      `/uploads/editions/${"a".repeat(32)}-${"b".repeat(64)}.png`,
      `${path("a")}"); background: url(//evil`,
    ]) {
      expect(managedArtwork(value)).toBeNull();
    }
  });
});

describe("editionShareImage", () => {
  it("prefers the sharing image, then the hero, else null", () => {
    expect(editionShareImage({ shareImage: path("a"), heroImage: path("b") })).toBe(path("a"));
    expect(editionShareImage({ shareImage: null, heroImage: path("b") })).toBe(path("b"));
    expect(editionShareImage({})).toBeNull();
  });
});

describe("useEditionHeroImage", () => {
  afterEach(() => document.documentElement.style.removeProperty("--edition-hero-image"));
  const variable = () => document.documentElement.style.getPropertyValue("--edition-hero-image");

  it("publishes a managed hero as a CSS variable and removes it again", () => {
    const { rerender, unmount } = renderHook(({ hero }) => useEditionHeroImage(hero), {
      initialProps: { hero: path("a") as string | null },
    });
    expect(variable()).toBe(`url("${path("a")}")`);

    rerender({ hero: null });
    expect(variable()).toBe("");

    rerender({ hero: path("b") });
    unmount();
    expect(variable()).toBe("");
  });

  it("ignores unmanaged paths so they never reach CSS", () => {
    renderHook(() => useEditionHeroImage("https://evil.example/x.jpg"));
    expect(variable()).toBe("");
  });
});
