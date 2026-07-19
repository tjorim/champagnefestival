import { useCallback, useState } from "react";
import {
  DEFAULT_VISUAL_THEME,
  getVisualThemeDefinition,
  isVisualThemeVariant,
  type VisualThemeVariant,
} from "@/config/visualThemes";

export type { VisualThemeVariant } from "@/config/visualThemes";

const STORAGE_KEY = "champagnefestival:visualTheme";
const STYLESHEET_ID = "visual-theme-stylesheet";

interface UseVisualThemeResult {
  variant: VisualThemeVariant;
  setVariant: (next: VisualThemeVariant) => void;
}

function readStoredVariant(): VisualThemeVariant {
  if (typeof document !== "undefined" && document.documentElement.dataset.visualTheme) {
    const current = document.documentElement.dataset.visualTheme;
    if (isVisualThemeVariant(current)) return current;
  }

  if (typeof window === "undefined") return DEFAULT_VISUAL_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isVisualThemeVariant(stored)) return stored;
  } catch {
    // Storage may be unavailable (disabled, sandboxed iframe); fall back to the default variant.
  }
  return DEFAULT_VISUAL_THEME;
}

/**
 * Creates/updates the swappable theme `<link>`. Must be called from module-level code in
 * main.tsx (after the bootstrap CSS import), not from an early inline <head> script — appending
 * this early would put it before Vite's bootstrap stylesheet in the cascade, letting Bootstrap's
 * same-specificity rules (e.g. `.navbar-brand`) silently win over our overrides.
 */
function applyBrowserThemeColors(variant: VisualThemeVariant): void {
  const { themeColors } = getVisualThemeDefinition(variant);
  const darkMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]',
  );
  const lightMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][media="(prefers-color-scheme: light)"]',
  );

  darkMeta?.setAttribute("content", themeColors.dark);
  lightMeta?.setAttribute("content", themeColors.light);
}

function applyVisualTheme(variant: VisualThemeVariant): void {
  const definition = getVisualThemeDefinition(variant);
  document.documentElement.dataset.visualTheme = variant;

  let stylesheet = document.getElementById(STYLESHEET_ID) as HTMLLinkElement | null;
  if (!stylesheet) {
    stylesheet = document.createElement("link");
    stylesheet.id = STYLESHEET_ID;
    stylesheet.rel = "stylesheet";
    document.head.appendChild(stylesheet);
  }
  stylesheet.href = `/themes/theme-${variant}.css`;
  applyBrowserThemeColors(variant);

  if (definition.bootstrapMode !== "system") {
    document.documentElement.dataset.bsTheme = definition.bootstrapMode;
    return;
  }

  const isLight =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
      : false;
  document.documentElement.dataset.bsTheme = isLight ? "light" : "dark";
}

/** Call once at module top level in main.tsx, after the bootstrap CSS import, to load the stored variant. */
export function initializeVisualTheme(): void {
  applyVisualTheme(readStoredVariant());
}

export function useVisualTheme(): UseVisualThemeResult {
  const [variant, setVariantState] = useState<VisualThemeVariant>(readStoredVariant);

  const setVariant = useCallback((next: VisualThemeVariant) => {
    setVariantState(next);
    applyVisualTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable; the choice just won't persist across reloads.
    }
  }, []);

  return { variant, setVariant };
}
