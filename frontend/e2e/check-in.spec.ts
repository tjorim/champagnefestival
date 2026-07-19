import { test, expect } from "@playwright/test";

test.describe("Check-in flow", () => {
  test("shows scan prompt and manual search panel without URL params", async ({ page }) => {
    await page.goto("/check-in");

    // Page title should be visible
    await expect(page.locator("#checkin-title")).toBeVisible();

    // Scan prompt alert should appear (there may be multiple alerts; any is fine)
    await expect(page.getByRole("alert").first()).toBeVisible();

    // Manual search section should be present
    await expect(page.locator("#manual-checkin-search")).toBeVisible();
  });

  test("loads registration details from URL params", async ({ page }) => {
    await page.goto("/check-in?id=reg-01&token=mock-token-reg-01");

    // Registration card should show the guest name
    await expect(page.locator("text=Alice Dupont")).toBeVisible({ timeout: 10_000 });

    // Event title should be visible
    await expect(page.locator("text=Grand Opening")).toBeVisible();
  });

  test("check-in button is visible for unchecked guest", async ({ page }) => {
    await page.goto("/check-in?id=reg-01&token=mock-token-reg-01");

    // Wait for the registration to load
    await expect(page.locator("text=Alice Dupont")).toBeVisible({ timeout: 10_000 });

    // Check-in button should be present and enabled
    const checkInButton = page.getByRole("button", { name: /check.?in|inchecken/i });
    await expect(checkInButton).toBeVisible();
    await expect(checkInButton).toBeEnabled();
  });

  test("completing check-in shows success state", async ({ page }) => {
    await page.goto("/check-in?id=reg-01&token=mock-token-reg-01");

    await expect(page.locator("text=Alice Dupont")).toBeVisible({ timeout: 10_000 });

    // Click check-in button
    const checkInButton = page.getByRole("button", { name: /check.?in|inchecken/i });
    await checkInButton.click();

    // Success alert should appear
    await expect(
      page.getByRole("status").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows error for invalid registration ID", async ({ page }) => {
    await page.goto("/check-in?id=nonexistent&token=bad-token");

    // An error alert should appear
    await expect(page.getByRole("alert")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("back to site link navigates home", async ({ page }) => {
    await page.goto("/check-in");

    const backLink = page.locator('a[href="/"]');
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL("/");
  });
});
