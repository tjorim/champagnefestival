import definitions from "./visualThemes.json";

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

export const VISUAL_THEMES = definitions as readonly VisualThemeDefinition[];

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
