import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import BubbleBackground from "@/components/BubbleBackground";
import { RESIZE_DEBOUNCE_MS } from "@/config/constants";

vi.mock("@/components/Bubble", () => ({
  default: ({ left }: { left: number }) => <span data-testid="bubble" data-left={left} />,
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("adapts density on resize while keeping a stable animation seed", () => {
  vi.useFakeTimers();
  vi.stubGlobal("navigator", { hardwareConcurrency: 8, userAgent: "Desktop" });
  vi.stubGlobal("innerWidth", 1280);
  const { rerender, unmount } = render(<BubbleBackground />);
  expect(screen.getAllByTestId("bubble")).toHaveLength(50);
  const firstLeft = screen.getAllByTestId("bubble").at(0)?.getAttribute("data-left");
  rerender(<BubbleBackground />);
  expect(screen.getAllByTestId("bubble")[0]).toHaveAttribute("data-left", firstLeft);
  vi.stubGlobal("innerWidth", 390);
  act(() => {
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS);
  });
  expect(screen.getAllByTestId("bubble")).toHaveLength(20);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("uses the low-performance density on a small device", () => {
  vi.stubGlobal("navigator", { hardwareConcurrency: 2, userAgent: "Desktop" });
  vi.stubGlobal("innerWidth", 390);
  render(<BubbleBackground />);
  expect(screen.getAllByTestId("bubble")).toHaveLength(10);
});
