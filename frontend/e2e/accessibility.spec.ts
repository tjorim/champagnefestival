import { expect, test } from "@playwright/test";
import { AXE_SCENARIOS, expectNoAxeViolations, prepareScenario } from "./axe";

/**
 * Page-level axe scans of the public routes (the jest-axe unit tests cover
 * components). The authenticated routes live in accessibility.authenticated.spec.ts
 * so they run under the logged-in project. Contrast beyond what axe detects and
 * screen-reader behavior are out of scope.
 */
const PUBLIC_ROUTES: readonly { path: string; ready: string }[] = [
  { path: "/", ready: "main#main-content #welcome" },
  { path: "/privacy", ready: "main, h1" },
  { path: "/me", ready: "#my-account-title" },
  { path: "/check-in", ready: "#checkin-title" },
];

for (const route of PUBLIC_ROUTES) {
  test.describe(`axe: ${route.path}`, () => {
    for (const scenario of AXE_SCENARIOS) {
      test(scenario.name, async ({ page }) => {
        await prepareScenario(page, scenario);
        await page.goto(route.path);
        await expect(page.locator(route.ready).first()).toBeVisible();
        await page.waitForLoadState("networkidle");
        await expectNoAxeViolations(page, route.path, scenario);
      });
    }
  });
}
