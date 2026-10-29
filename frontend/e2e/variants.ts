// The theme specs check structure, not colour contrast (the axe scans cover that), so each
// theme runs a wide light and a narrow dark variant instead of the full width × scheme grid.
// That still exercises both widths and both schemes.
export const THEME_VARIANTS = [
  { width: 1440, colorScheme: "light" },
  { width: 390, colorScheme: "dark" },
] as const;
