import { expect, test } from "@playwright/test";
import {
  AXE_SCENARIOS,
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

/**
 * Every section of the admin sidebar, not just the default Registrations view: each one is
 * a different screen with its own tables, forms and badges. Sections are read from the
 * sidebar so a new one is covered without editing this list.
 */
for (const scenario of AXE_SCENARIOS) {
  test(`axe: every admin section (authenticated) [${scenario.name}]`, async ({ page }) => {
    test.setTimeout(240_000);
    const menu = page.locator('[data-sidebar="menu-button"], [data-sidebar="menu-sub-button"]');

    await prepareScenario(page, scenario);
    await page.goto("/admin");
    await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
    await expect(page.locator("text=alice@moet.com").first()).toBeVisible();

    const openNavigation = async () => {
      if (scenario.name === "narrow") {
        await page.locator('[data-sidebar="trigger"]').click();
      }
    };
    await openNavigation();

    // Open every collapsed group so its sections are reachable.
    for (let attempt = 0; attempt < 8; attempt++) {
      const collapsed = menu.and(page.locator('[aria-expanded="false"]')).first();
      if ((await collapsed.count()) === 0) break;
      await collapsed.click();
    }

    const sections = menu.and(page.locator(":not([aria-expanded])"));
    const labels = (await sections.allTextContents()).map((label) => label.trim());
    expect(labels.length).toBeGreaterThan(10);

    for (const label of labels) {
      await sections.filter({ hasText: label }).first().click();
      await expect(page.locator(".admin-content-pane .admin-skeleton")).toHaveCount(0);
      await expectNoAxeViolations(page, `/admin (${label})`, scenario);
      await openNavigation();
    }
  });
}
