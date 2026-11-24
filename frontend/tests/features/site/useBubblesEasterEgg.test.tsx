import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBubblesEasterEgg } from "@/features/site/useBubblesEasterEgg";

const STORAGE_KEY = "champagnefestival:bubbles";

function type(text: string) {
  for (const key of text) {
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    });
  }
}

describe("useBubblesEasterEgg", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("starts off and remembers the choice in local storage", () => {
    const { result } = renderHook(() => useBubblesEasterEgg());
    expect(result.current.showBubbles).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("starts on when the stored choice is on", () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    const { result } = renderHook(() => useBubblesEasterEgg());
    expect(result.current.showBubbles).toBe(true);
  });

  it("toggles when 'bubbles' is typed", () => {
    const { result } = renderHook(() => useBubblesEasterEgg());
    type("bubbles");
    expect(result.current.showBubbles).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
    type("bubbles");
    expect(result.current.showBubbles).toBe(false);
  });

  it("ignores typing inside a form field", () => {
    const { result } = renderHook(() => useBubblesEasterEgg());
    const input = document.createElement("input");
    document.body.append(input);
    for (const key of "bubbles") {
      act(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    }
    input.remove();
    expect(result.current.showBubbles).toBe(false);
  });

  it("toggles after five quick brand taps but not when the taps are spread out", () => {
    const { result } = renderHook(() => useBubblesEasterEgg());
    for (let tap = 0; tap < 4; tap += 1) act(() => result.current.handleBrandClick());
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    act(() => result.current.handleBrandClick());
    expect(result.current.showBubbles).toBe(false);

    for (let tap = 0; tap < 4; tap += 1) act(() => result.current.handleBrandClick());
    expect(result.current.showBubbles).toBe(true);
  });
});
