import { describe, expect, it } from "vitest";
import { safeRoomColor } from "@/utils/layoutUtils";

describe("safeRoomColor", () => {
  it.each(["#fff", "#FFC107", "#6c757d", "#4a90d9cc"])("keeps hex color %s", (color) => {
    expect(safeRoomColor(color)).toBe(color);
  });

  it.each([
    "red",
    "rgb(0, 0, 0)",
    "var(--x)",
    "#ggg",
    "#12345",
    "#1234567890",
    "#fff; background: url(x)",
    " #fff",
    "",
  ])("falls back for %j", (color) => {
    expect(safeRoomColor(color)).toBe("var(--surface-border)");
  });

  it("falls back for missing colors and honors a custom fallback", () => {
    expect(safeRoomColor(undefined)).toBe("var(--surface-border)");
    expect(safeRoomColor(null)).toBe("var(--surface-border)");
    expect(safeRoomColor("nope", "inherit")).toBe("inherit");
  });
});
