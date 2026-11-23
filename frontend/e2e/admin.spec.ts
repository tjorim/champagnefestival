import { test, expect } from "@playwright/test";

test.describe("Admin dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
    await page.goto("/admin");
    await expect(page.locator("#admin-title")).toBeVisible();
  });

  test("admin login heading and dark header are visible", async ({ page }) => {
    await expect(page.locator("#admin-title")).toBeVisible();
    await expect(page.locator("nav.standalone-navbar")).toHaveAttribute("data-theme-mode", "dark");
  });

  test("back to site link is available", async ({ page }) => {
    const backLink = page.locator('a[href="/en"]');
    await expect(backLink).toBeVisible();
  });

  test("shows login prompt when not authenticated", async ({ page }) => {
    // When unauthenticated, the admin dashboard shows a login button/form
    await expect(
      page.getByRole("button", { name: /log.?in|sign.?in|aanmelden/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("back to site link navigates home", async ({ page }) => {
    const backLink = page.locator('a[href="/en"]');
    await backLink.click();
    await expect(page).toHaveURL("/en");
  });
});
