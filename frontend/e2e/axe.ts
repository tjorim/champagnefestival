import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import themeDefinitions from "../src/config/visualThemes.json" with { type: "json" };

/** WCAG 2.0/2.1 A and AA — the same tag set the issue and daynest use. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

export type ColorScheme = "light" | "dark";

export interface AxeScenario {
  name: string;
  colorScheme: ColorScheme;
  viewport: { width: number; height: number };
}

/** Light and dark themes at desktop width, plus a narrow phone width. */
export const AXE_SCENARIOS: readonly AxeScenario[] = [
  {
    name: "light",
    colorScheme: "light",
    viewport: { width: 1280, height: 720 },
  },
  { name: "dark", colorScheme: "dark", viewport: { width: 1280, height: 720 } },
  {
    name: "narrow",
    colorScheme: "light",
    viewport: { width: 375, height: 667 },
  },
];

export interface AxeTheme {
  value: string;
  colorMode: "system" | "light" | "dark";
}

/** The theme every route is scanned in, with all scenarios. */
export const DEFAULT_AXE_THEME = "refresh";

/**
 * Every visual theme (`src/config/visualThemes.json`). The default theme gets the full route
 * lists; the others only scan the routes marked `allThemes` in the specs, to keep CI time down.
 */
export const AXE_THEMES: readonly AxeTheme[] = themeDefinitions;

/**
 * Scenarios worth running for a theme. Only `system` themes follow the color scheme, so they
 * get light and dark; fixed-mode themes render the same either way and get one desktop scenario
 * (named after their fixed mode) plus the narrow one.
 */
export function scenariosForTheme(theme: AxeTheme): readonly AxeScenario[] {
  if (theme.colorMode === "system") return AXE_SCENARIOS;
  const fixed = AXE_SCENARIOS.find((scenario) => scenario.name === theme.colorMode);
  const narrow = AXE_SCENARIOS.find((scenario) => scenario.name === "narrow");
  return [fixed, narrow].filter((scenario): scenario is AxeScenario => scenario !== undefined);
}

/** Selects a visual theme before the first page load, the way the theme switcher persists it. */
export async function seedVisualTheme(page: Page, theme: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("champagnefestival:visualTheme", value);
  }, theme);
}

/**
 * The Cuvée and Remuage themes override the `--adm-*` tokens and backgrounds so the admin
 * content area is light, but the shared admin scope (`data-theme-scope="admin"`, always dark)
 * still feeds light text and dark card surfaces into the same area, so text, borders and inputs
 * end up light-on-light or dark-on-dark. Fixing it means deciding whether those themes get a
 * genuinely light admin scope or follow the dark one.
 */
const LIGHT_ADMIN_IN_DARK_SCOPE = {
  "color-contrast":
    "the theme skins the admin content area light inside the always-dark admin scope, so dark-scope text and surface tokens land on light surfaces",
};

/**
 * Known violations, keyed by `${theme}|${route}|${scenario}` → rule ids → reason.
 * Every entry must say why it is tolerated; fix the cause and delete the entry
 * rather than extending this list. Anything not listed fails the suite.
 */
export const ALLOWED_VIOLATIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "cuvee|/admin|light": LIGHT_ADMIN_IN_DARK_SCOPE,
  "cuvee|/admin|narrow": LIGHT_ADMIN_IN_DARK_SCOPE,
  "remuage|/admin|light": LIGHT_ADMIN_IN_DARK_SCOPE,
  "remuage|/admin|narrow": LIGHT_ADMIN_IN_DARK_SCOPE,
};

export async function expectNoAxeViolations(
  page: Page,
  route: string,
  scenario: AxeScenario,
  theme: string = DEFAULT_AXE_THEME,
): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const allowed = ALLOWED_VIOLATIONS[`${theme}|${route}|${scenario.name}`] ?? {};
  const violations = results.violations
    .filter((violation) => !(violation.id in allowed))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => `${node.target.join(" ")}  ${node.html.slice(0, 160)}`),
    }));
  expect(violations, `axe violations on ${route} (${theme}, ${scenario.name})`).toEqual([]);
}

export async function prepareScenario(page: Page, scenario: AxeScenario): Promise<void> {
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({ colorScheme: scenario.colorScheme });
}
