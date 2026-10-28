import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNow } from "@/hooks/useNow";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("advances at the requested cadence and releases its timer", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-31T23:59:59Z"));
  const { result, unmount } = renderHook(() => useNow(1000));
  const before = result.current;
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current).toBe(before + 1000);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("refreshes immediately when a background page becomes visible", () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useNow());
  const before = result.current;
  vi.setSystemTime(before + 120_000);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(result.current).toBe(before + 120_000);
});
