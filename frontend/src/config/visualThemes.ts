export type VisualThemeVariant = "refresh" | "classic" | "riviera" | "cuvee" | "remuage";

export type BootstrapThemeMode = "system" | "light" | "dark";

interface VisualThemeColors {
  readonly dark: string;
  readonly light: string;
}

export interface VisualThemeDefinition {
  readonly value: VisualThemeVariant;
  readonly label: string;
  readonly bootstrapMode: BootstrapThemeMode;
  readonly themeColors: VisualThemeColors;
}

export const DEFAULT_VISUAL_THEME: VisualThemeVariant = "refresh";

export const VISUAL_THEMES = [
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
] as const satisfies readonly VisualThemeDefinition[];

export function isVisualThemeVariant(value: unknown): value is VisualThemeVariant {
  return typeof value === "string" && VISUAL_THEMES.some((theme) => theme.value === value);
}

export function getVisualThemeDefinition(variant: VisualThemeVariant): VisualThemeDefinition {
  const definition = VISUAL_THEMES.find((theme) => theme.value === variant);
  if (!definition) {
    throw new Error(`Visual theme definition not found: ${variant}`);
  }
  return definition;
}
