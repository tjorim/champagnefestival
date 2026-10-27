import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoadWhenVisible from "@/components/LoadWhenVisible";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

describe("LoadWhenVisible", () => {
  let callback: ObserverCallback | null = null;
  const disconnect = vi.fn();

  beforeEach(() => {
    callback = null;
    disconnect.mockClear();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: ObserverCallback) {
          callback = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the placeholder until the visitor scrolls near, then mounts the children", () => {
    render(
      <LoadWhenVisible placeholder={<p>placeholder</p>}>
        <p>map</p>
      </LoadWhenVisible>,
    );
    expect(screen.getByText("placeholder")).toBeInTheDocument();
    expect(screen.queryByText("map")).not.toBeInTheDocument();

    act(() => callback?.([{ isIntersecting: false }]));
    expect(screen.queryByText("map")).not.toBeInTheDocument();

    act(() => callback?.([{ isIntersecting: true }]));
    expect(screen.getByText("map")).toBeInTheDocument();
    expect(screen.queryByText("placeholder")).not.toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled();
  });

  it("mounts immediately where IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(
      <LoadWhenVisible placeholder={<p>placeholder</p>}>
        <p>map</p>
      </LoadWhenVisible>,
    );
    expect(screen.getByText("map")).toBeInTheDocument();
  });
});
