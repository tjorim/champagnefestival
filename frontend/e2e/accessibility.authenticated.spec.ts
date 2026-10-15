import { expect, test } from "@playwright/test";
import {
  AXE_THEMES,
  expectNoAxeViolations,
  prepareScenario,
  scenariosForTheme,
  seedVisualTheme,
} from "./axe";

/**
 * Page-level axe scans of the admin shell, run logged in as the dev-bypass
 * admin (see auth.setup.ts). Public routes are in accessibility.spec.ts.
 */
const ADMIN_ROUTES: readonly {
  path: string;
  ready: string;
  settled: string;
}[] = [
  // The registrations table is the dashboard's default view; wait for its mock rows so the
  // scan never runs against a half-loaded page.
  {
    path: "/admin",
    ready: "section#admin.admin-authenticated",
    settled: "text=alice@moet.com",
  },
];

// Only /admin exists today, so it is scanned in every visual theme.
for (const theme of AXE_THEMES) {
  for (const route of ADMIN_ROUTES) {
    test.describe(`axe: ${route.path} (authenticated) [${theme.value}]`, () => {
      for (const scenario of scenariosForTheme(theme)) {
        test(scenario.name, async ({ page }) => {
          await prepareScenario(page, scenario);
          await seedVisualTheme(page, theme.value);
          await page.goto(route.path);
          await expect(page.locator("html")).toHaveAttribute("data-visual-theme", theme.value);
          await expect(page.locator(route.ready)).toBeVisible();
          await expect(page.locator(route.settled).first()).toBeVisible();
          // Not "networkidle": the admin shell keeps live-update requests in flight.
          await page.waitForLoadState("load");
          await expectNoAxeViolations(page, route.path, scenario, theme.value);
        });
      }
    });
  }
}
