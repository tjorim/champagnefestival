import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import {
  DEFAULT_VISUAL_THEME,
  VISUAL_THEMES,
  getVisualThemeDefinition,
  isVisualThemeVariant,
} from "@/config/visualThemes";

const EXPECTED_THEMES = [
  {
    value: "refresh",
    label: "New",
    bootstrapMode: "system",
    themeColors: { dark: "#100f0d", light: "#fbf4e6" },
  },
  {
    value: "classic",
    label: "Classic",
    bootstrapMode: "dark",
    themeColors: { dark: "#121212", light: "#121212" },
  },
  {
    value: "riviera",
    label: "Riviera",
    bootstrapMode: "light",
    themeColors: { dark: "#f7ecd2", light: "#f7ecd2" },
  },
  {
    value: "cuvee",
    label: "Cuvée",
    bootstrapMode: "light",
    themeColors: { dark: "#0c231d", light: "#0c231d" },
  },
  {
    value: "remuage",
    label: "Remuage",
    bootstrapMode: "light",
    themeColors: { dark: "#edf1f5", light: "#edf1f5" },
  },
] as const;

describe("visual theme registry", () => {
  it("defines the complete preview registry", () => {
    expect(DEFAULT_VISUAL_THEME).toBe("refresh");
    expect(VISUAL_THEMES).toEqual(EXPECTED_THEMES);
    expect(getVisualThemeDefinition("remuage")).toEqual(EXPECTED_THEMES[4]);
  });

  it("accepts only registered visual theme variants", () => {
    for (const theme of EXPECTED_THEMES) {
      expect(isVisualThemeVariant(theme.value)).toBe(true);
    }

    for (const value of [null, undefined, "", "REMUAGE", "unknown", 42, {}]) {
      expect(isVisualThemeVariant(value)).toBe(false);
    }
  });

  it("injects one shared pre-paint registry instead of mirrored maps", () => {
    expect(indexHtml).toContain("const THEMES = __VISUAL_THEMES__;");
    expect(indexHtml).not.toContain("THEME_MODES");
    expect(indexHtml).not.toContain("THEME_COLORS");
  });
});
