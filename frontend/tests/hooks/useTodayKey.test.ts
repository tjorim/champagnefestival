import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTodayKey } from "@/hooks/useTodayKey";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTodayKey", () => {
  it("returns today's local date key", () => {
    vi.setSystemTime(new Date(2027, 2, 6, 14, 30));

    const { result } = renderHook(() => useTodayKey());

    expect(result.current).toBe("2027-03-06");
  });

  it("rolls over when the local date changes", () => {
    vi.setSystemTime(new Date(2027, 2, 6, 23, 59, 0));

    const { result } = renderHook(() => useTodayKey());
    expect(result.current).toBe("2027-03-06");

    // A dashboard left open across midnight must not keep filtering on the
    // previous day.
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(result.current).toBe("2027-03-07");
  });

  it("keeps rolling over on subsequent days", () => {
    vi.setSystemTime(new Date(2027, 2, 6, 23, 59, 0));

    const { result } = renderHook(() => useTodayKey());

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(result.current).toBe("2027-03-07");

    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    expect(result.current).toBe("2027-03-08");
  });
});
