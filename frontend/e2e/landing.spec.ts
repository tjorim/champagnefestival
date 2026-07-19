import { test, expect } from "@playwright/test";

test.describe("Public landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the app to hydrate past the initial loading state
    await page.waitForLoadState("networkidle");
  });

  test("welcome section is visible", async ({ page }) => {
    const welcome = page.locator("main#main-content #welcome");
    await expect(welcome).toBeVisible();
    await expect(welcome.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("header is rendered", async ({ page }) => {
    await expect(page.locator("header, nav.navbar")).toBeVisible();
  });

  test("navigation links are present", async ({ page }) => {
    // Navigation links are anchors in the header
    const nav = page.locator("header, nav.navbar");
    await expect(nav.locator("a")).not.toHaveCount(0);
  });

  test("schedule section is reachable via navigation", async ({ page }) => {
    const scheduleLink = page.locator('a[href="#schedule"]').first();
    await expect(scheduleLink).toBeVisible();
    await scheduleLink.click();
    await expect(page.locator("#schedule")).toBeInViewport();
  });

  test("contact section is reachable via navigation", async ({ page }) => {
    const contactLink = page.locator('a[href="#contact"]').first();
    await expect(contactLink).toBeVisible();
    await contactLink.click();
    await expect(page.locator("#contact")).toBeInViewport();
  });

  test("faq section exists on page", async ({ page }) => {
    await expect(page.locator("#faq")).toBeVisible();
  });

  test("footer is rendered", async ({ page }) => {
    await expect(page.locator("footer")).toBeVisible();
  });
});
