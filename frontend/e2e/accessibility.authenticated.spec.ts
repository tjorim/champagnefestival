import { expect, test } from "@playwright/test";
import { AXE_SCENARIOS, expectNoAxeViolations, prepareScenario } from "./axe";

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

for (const route of ADMIN_ROUTES) {
  test.describe(`axe: ${route.path} (authenticated)`, () => {
    for (const scenario of AXE_SCENARIOS) {
      test(scenario.name, async ({ page }) => {
        await prepareScenario(page, scenario);
        await page.goto(route.path);
        await expect(page.locator(route.ready)).toBeVisible();
        await expect(page.locator(route.settled).first()).toBeVisible();
        // Not "networkidle": the admin shell keeps live-update requests in flight.
        await page.waitForLoadState("load");
        await expectNoAxeViolations(page, route.path, scenario);
      });
    }
  });
}
