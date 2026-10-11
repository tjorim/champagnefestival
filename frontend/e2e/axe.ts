import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

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

/**
 * Known violations, keyed by `${route}|${scenario}` → rule ids → reason.
 * Every entry must say why it is tolerated; fix the cause and delete the entry
 * rather than extending this list. Anything not listed fails the suite.
 */
export const ALLOWED_VIOLATIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // `outline-warning` buttons set `text-warning` (#ffc107 amber) on the page
  // background, which fails 4.5:1 wherever that background is light. Dark mode and the
  // fixed-dark admin scope pass. Needs a theme-aware warning text token, not a
  // per-button override.
  // The admin shell fails color-contrast in every scenario (muted `text-subtle` text,
  // amber warning badges and the `text-highlight` lines, the sidebar group labels and
  // the signed-in account name). Only that one rule fails there; the structural rules
  // pass. Needs a semantic-color contrast pass over the admin theme scope.
  "/admin|light": {
    "color-contrast": "admin theme muted/warning/highlight colors",
  },
  "/admin|dark": {
    "color-contrast": "admin theme muted/warning/highlight colors",
  },
  "/admin|narrow": {
    "color-contrast": "admin theme muted/warning/highlight colors",
  },
  "/check-in|light": {
    "color-contrast": "outline-warning button text is amber on a light background",
  },
  "/check-in|narrow": {
    "color-contrast": "outline-warning button text is amber on a light background",
  },
};

export async function expectNoAxeViolations(
  page: Page,
  route: string,
  scenario: AxeScenario,
): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const allowed = ALLOWED_VIOLATIONS[`${route}|${scenario.name}`] ?? {};
  const violations = results.violations
    .filter((violation) => !(violation.id in allowed))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => `${node.target.join(" ")}  ${node.html.slice(0, 160)}`),
    }));
  expect(violations, `axe violations on ${route} (${scenario.name})`).toEqual([]);
}

export async function prepareScenario(page: Page, scenario: AxeScenario): Promise<void> {
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({ colorScheme: scenario.colorScheme });
}
