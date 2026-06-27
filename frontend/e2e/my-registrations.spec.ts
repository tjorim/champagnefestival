import { test, expect } from "@playwright/test";

test.describe("Guest self-service (/my-registrations)", () => {
  test("shows email request form when no token in URL", async ({ page }) => {
    await page.goto("/my-registrations");
    await page.waitForLoadState("networkidle");

    // Page title should be visible
    await expect(page.locator("#my-registrations-title, h2")).toBeVisible();

    // Email input should be present
    await expect(page.locator('input[type="email"], #my-registrations-email')).toBeVisible();
  });

  test("submitting a valid email shows confirmation", async ({ page }) => {
    await page.goto("/my-registrations");
    await page.waitForLoadState("networkidle");

    // Fill in a valid email
    await page.fill('input[type="email"], #my-registrations-email', "alice@moet.com");

    // Submit the form
    await page.click('button[type="submit"]');

    // Confirmation/info alert should appear
    await expect(
      page.locator("[role='status'], .alert-info").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("submitting an invalid email shows an error", async ({ page }) => {
    await page.goto("/my-registrations");
    await page.waitForLoadState("networkidle");

    await page.fill('input[type="email"], #my-registrations-email', "not-an-email");
    await page.click('button[type="submit"]');

    await expect(page.locator("[role='alert'], .alert-danger").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("shows registrations when a valid token is provided", async ({ page }) => {
    // Any non-empty token is accepted by the MSW mock
    await page.goto("/my-registrations?token=mock-token-reg-01");
    await page.waitForLoadState("networkidle");

    // Should show at least one registration card
    await expect(page.locator(".card").first()).toBeVisible({ timeout: 10_000 });

    // Event titles from seed data should be present
    await expect(page.locator("text=Grand Opening")).toBeVisible();
  });

  test("request new link button resets to email form", async ({ page }) => {
    await page.goto("/my-registrations?token=mock-token-reg-01");
    await page.waitForLoadState("networkidle");

    // Wait for registrations to load
    await expect(page.locator(".card").first()).toBeVisible({ timeout: 10_000 });

    // Click the "request new link" button
    const resetButton = page.locator("button").filter({ hasText: /new link|request/i }).last();
    await resetButton.click();

    // Should return to the email form
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5_000 });
  });

  test("back to site link navigates home", async ({ page }) => {
    await page.goto("/my-registrations");
    await page.waitForLoadState("networkidle");

    const backLink = page.locator('a[href="/"]');
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL("/");
  });
});
