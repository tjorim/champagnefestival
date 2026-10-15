import { expect, test } from "@playwright/test";
import {
  AXE_THEMES,
  DEFAULT_AXE_THEME,
  expectNoAxeViolations,
  prepareScenario,
  scenariosForTheme,
  seedVisualTheme,
} from "./axe";

/**
 * Page-level axe scans of the public routes (the jest-axe unit tests cover
 * components). The authenticated routes live in accessibility.authenticated.spec.ts
 * so they run under the logged-in project. Contrast beyond what axe detects and
 * screen-reader behavior are out of scope.
 *
 * Every route is scanned in the default theme; routes marked `allThemes` are also scanned in
 * every other visual theme (see AXE_THEMES in axe.ts).
 */
const PUBLIC_ROUTES: readonly { path: string; ready: string; allThemes?: boolean }[] = [
  { path: "/", ready: "main#main-content #welcome", allThemes: true },
  { path: "/privacy", ready: "main, h1" },
  { path: "/me", ready: "#my-account-title" },
  { path: "/check-in", ready: "#checkin-title", allThemes: true },
];

for (const theme of AXE_THEMES) {
  for (const route of PUBLIC_ROUTES) {
    if (theme.value !== DEFAULT_AXE_THEME && !route.allThemes) continue;
    test.describe(`axe: ${route.path} [${theme.value}]`, () => {
      for (const scenario of scenariosForTheme(theme)) {
        test(scenario.name, async ({ page }) => {
          await prepareScenario(page, scenario);
          await seedVisualTheme(page, theme.value);
          await page.goto(route.path);
          await expect(page.locator("html")).toHaveAttribute("data-visual-theme", theme.value);
          await expect(page.locator(route.ready).first()).toBeVisible();
          await page.waitForLoadState("networkidle");
          await expectNoAxeViolations(page, route.path, scenario, theme.value);
        });
      }
    });
  }
}
