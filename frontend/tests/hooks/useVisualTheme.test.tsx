import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeVisualTheme, useVisualTheme } from "@/hooks/useVisualTheme";

function mockColorScheme(isLight: boolean): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === "(prefers-color-scheme: light)" ? isLight : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList,
  );
}

function getThemeColor(mode: "dark" | "light"): string | null {
  return document
    .querySelector<HTMLMetaElement>(`meta[name="theme-color"][media="(prefers-color-scheme: ${mode})"]`)
    ?.getAttribute("content") ?? null;
}

describe("useVisualTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.visualTheme;
    delete document.documentElement.dataset.bsTheme;
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
  });

  it("initializes a stored Remuage selection", () => {
    window.localStorage.setItem("champagnefestival:visualTheme", "remuage");

    initializeVisualTheme();

    expect(document.documentElement.dataset.visualTheme).toBe("remuage");
    expect(document.documentElement.dataset.bsTheme).toBe("light");
    expect(
      document.getElementById("visual-theme-stylesheet")?.getAttribute("href"),
    ).toBe("/themes/theme-remuage.css");
    expect(getThemeColor("dark")).toBe("#edf1f5");
    expect(getThemeColor("light")).toBe("#edf1f5");
  });

  it("falls back to the Refresh system theme for invalid storage", () => {
    window.localStorage.setItem("champagnefestival:visualTheme", "unknown");
    mockColorScheme(true);

    initializeVisualTheme();

    expect(document.documentElement.dataset.visualTheme).toBe("refresh");
    expect(document.documentElement.dataset.bsTheme).toBe("light");
    expect(getThemeColor("dark")).toBe("#100f0d");
    expect(getThemeColor("light")).toBe("#fbf4e6");
  });

  it("prefers the valid pre-paint dataset over local storage", () => {
    document.documentElement.dataset.visualTheme = "remuage";
    window.localStorage.setItem("champagnefestival:visualTheme", "classic");

    const { result } = renderHook(() => useVisualTheme());

    expect(result.current.variant).toBe("remuage");
  });

  it("updates state, DOM, stylesheet, browser color, and persistence", () => {
    mockColorScheme(false);
    const { result } = renderHook(() => useVisualTheme());

    act(() => result.current.setVariant("remuage"));

    const stylesheet = document.getElementById("visual-theme-stylesheet");
    expect(result.current.variant).toBe("remuage");
    expect(document.documentElement.dataset.visualTheme).toBe("remuage");
    expect(document.documentElement.dataset.bsTheme).toBe("light");
    expect(stylesheet?.getAttribute("href")).toBe("/themes/theme-remuage.css");
    expect(getThemeColor("light")).toBe("#edf1f5");
    expect(window.localStorage.getItem("champagnefestival:visualTheme")).toBe("remuage");

    act(() => result.current.setVariant("refresh"));

    expect(document.getElementById("visual-theme-stylesheet")).toBe(stylesheet);
    expect(document.documentElement.dataset.bsTheme).toBe("dark");
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
