import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useNoIndex } from "./useNoIndex";

function getRobotsMeta() {
  return document.querySelector<HTMLMetaElement>('meta[name="robots"]');
}

afterEach(() => {
  getRobotsMeta()?.remove();
});

describe("useNoIndex", () => {
  it("sets noindex on mount and restores the previous content on unmount", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "robots");
    meta.setAttribute("content", "index, follow");
    document.head.appendChild(meta);

    const { unmount } = renderHook(() => useNoIndex());

    expect(getRobotsMeta()?.getAttribute("content")).toBe("noindex, nofollow");

    unmount();

    expect(getRobotsMeta()?.getAttribute("content")).toBe("index, follow");
  });

  it("creates and removes the meta tag when none existed", () => {
    expect(getRobotsMeta()).toBeNull();

    const { unmount } = renderHook(() => useNoIndex());

    expect(getRobotsMeta()?.getAttribute("content")).toBe("noindex, nofollow");

    unmount();

    expect(getRobotsMeta()).toBeNull();
  });
});
