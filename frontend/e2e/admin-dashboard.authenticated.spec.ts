import { test, expect } from "@playwright/test";

/**
 * Runs under the "chromium-admin" project (see playwright.config.ts), which
 * loads storageState produced by e2e/auth.setup.ts — no Keycloak redirect,
 * no login form. Demonstrates the pattern for future authenticated admin
 * e2e coverage; name new files `*.authenticated.spec.ts` to opt in.
 */
test.describe("Admin dashboard (authenticated)", () => {
  test("loads straight into the authenticated layout, no login prompt", async ({ page }) => {
    await page.goto("/admin");

    await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /log.?in|sign.?in|aanmelden/i }),
    ).toHaveCount(0);
  });
});
