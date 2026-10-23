import type { DetachedWindowAPI } from "happy-dom";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeVisualTheme, useVisualTheme } from "@/hooks/useVisualTheme";

const { happyDOM } = window as unknown as { happyDOM: DetachedWindowAPI };
const originalColorScheme = happyDOM.settings.device.prefersColorScheme;

function getThemeColor(mode: "dark" | "light"): string | null {
  return (
    document
      .querySelector<HTMLMetaElement>(
        `meta[name="theme-color"][media="(prefers-color-scheme: ${mode})"]`,
      )
      ?.getAttribute("content") ?? null
  );
}

describe("useVisualTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.visualTheme;
    delete document.documentElement.dataset.themeMode;
    document.getElementById("visual-theme-stylesheet")?.remove();
    const stylesheet = document.createElement("link");
    stylesheet.id = "visual-theme-stylesheet";
    document.head.appendChild(stylesheet);
    document.head.insertAdjacentHTML(
      "beforeend",
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#100f0d" data-testid="theme-dark" />' +
        '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbf4e6" data-testid="theme-light" />',
    );
  });

  afterEach(() => {
    document.querySelectorAll('meta[data-testid^="theme-"]').forEach((meta) => meta.remove());
    document.getElementById("visual-theme-stylesheet")?.remove();
    vi.restoreAllMocks();
    happyDOM.settings.device.prefersColorScheme = originalColorScheme;
  });

  it("initializes a stored Remuage selection", () => {
    window.localStorage.setItem("champagnefestival:visualTheme", "remuage");

    initializeVisualTheme();

    expect(document.documentElement.dataset.visualTheme).toBe("remuage");
    expect(document.documentElement.dataset.themeMode).toBe("light");
    expect(document.getElementById("visual-theme-stylesheet")?.getAttribute("href")).toBe(
      "/themes/theme-remuage.css",
    );
    expect(getThemeColor("dark")).toBe("#edf1f5");
    expect(getThemeColor("light")).toBe("#edf1f5");
  });

  it.each(["light", "dark"] as const)(
    "falls back to the %s system theme for invalid storage",
    (scheme) => {
      window.localStorage.setItem("champagnefestival:visualTheme", "unknown");
      happyDOM.settings.device.prefersColorScheme = scheme;

      initializeVisualTheme();

      expect(document.documentElement.dataset.visualTheme).toBe("refresh");
      expect(document.documentElement.dataset.themeMode).toBe(scheme);
      expect(getThemeColor("dark")).toBe("#100f0d");
      expect(getThemeColor("light")).toBe("#fbf4e6");
    },
  );

  it("prefers the valid pre-paint dataset over local storage", () => {
    document.documentElement.dataset.visualTheme = "remuage";
    window.localStorage.setItem("champagnefestival:visualTheme", "classic");

    const { result } = renderHook(() => useVisualTheme());

    expect(result.current.variant).toBe("remuage");
  });

  it("updates state, DOM, stylesheet, browser color, and persistence", () => {
    happyDOM.settings.device.prefersColorScheme = "dark";
    const { result } = renderHook(() => useVisualTheme());

    act(() => result.current.setVariant("remuage"));

    const stylesheet = document.getElementById("visual-theme-stylesheet");
    expect(result.current.variant).toBe("remuage");
    expect(document.documentElement.dataset.visualTheme).toBe("remuage");
    expect(document.documentElement.dataset.themeMode).toBe("light");
    expect(stylesheet?.getAttribute("href")).toBe("/themes/theme-remuage.css");
    expect(getThemeColor("light")).toBe("#edf1f5");
    expect(window.localStorage.getItem("champagnefestival:visualTheme")).toBe("remuage");

    act(() => result.current.setVariant("refresh"));

    expect(document.getElementById("visual-theme-stylesheet")).toBe(stylesheet);
    expect(document.documentElement.dataset.themeMode).toBe("dark");
    expect(getThemeColor("dark")).toBe("#100f0d");
    expect(getThemeColor("light")).toBe("#fbf4e6");
  });

  it("continues when local storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => initializeVisualTheme()).not.toThrow();
    expect(document.documentElement.dataset.visualTheme).toBe("refresh");

    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const { result } = renderHook(() => useVisualTheme());

    expect(() => act(() => result.current.setVariant("remuage"))).not.toThrow();
    expect(result.current.variant).toBe("remuage");
  });
});
