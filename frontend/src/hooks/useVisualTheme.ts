import { useCallback, useState } from "react";

export type VisualThemeVariant = "refresh" | "classic" | "riviera" | "cuvee";

const STORAGE_KEY = "champagnefestival:visualTheme";
const STYLESHEET_ID = "visual-theme-stylesheet";

function isVisualThemeVariant(value: string | null | undefined): value is VisualThemeVariant {
  return value === "refresh" || value === "classic" || value === "riviera" || value === "cuvee";
}

function readStoredVariant(): VisualThemeVariant {
  if (typeof document !== "undefined" && document.documentElement.dataset.visualTheme) {
    const current = document.documentElement.dataset.visualTheme;
    if (isVisualThemeVariant(current)) return current;
  }

  if (typeof window === "undefined") return "refresh";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isVisualThemeVariant(stored)) return stored;
  } catch {
    // Storage may be unavailable (disabled, sandboxed iframe); fall back to the default variant.
  }
  return "refresh";
}

/**
 * Creates/updates the swappable theme `<link>`. Must be called from module-level code in
 * main.tsx (after the bootstrap CSS import), not from an early inline <head> script — appending
 * this early would put it before Vite's bootstrap stylesheet in the cascade, letting Bootstrap's
 * same-specificity rules (e.g. `.navbar-brand`) silently win over our overrides.
 */
function applyVisualTheme(variant: VisualThemeVariant): void {
  document.documentElement.dataset.visualTheme = variant;

  let stylesheet = document.getElementById(STYLESHEET_ID) as HTMLLinkElement | null;
  if (!stylesheet) {
    stylesheet = document.createElement("link");
    stylesheet.id = STYLESHEET_ID;
    stylesheet.rel = "stylesheet";
    document.head.appendChild(stylesheet);
  }
  stylesheet.href = `/themes/theme-${variant}.css`;

  if (variant === "classic") {
    document.documentElement.dataset.bsTheme = "dark";
    return;
  }

  if (variant === "riviera") {
    document.documentElement.dataset.bsTheme = "light";
    return;
  }

  if (variant === "cuvee") {
    // The page shell is dark bottle-green, but nearly all interactive content sits on
    // ivory "label" cards, so Bootstrap components should use their light defaults.
    document.documentElement.dataset.bsTheme = "light";
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

export function useVisualTheme() {
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
