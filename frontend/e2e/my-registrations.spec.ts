import { test, expect } from "@playwright/test";

test.describe("Guest self-service (/my-registrations)", () => {
  test("shows email request form when no token in URL", async ({ page }) => {
    await page.goto("/my-registrations");

    // Page title should be visible
    await expect(page.locator("#my-registrations-title")).toBeVisible();

    // Email input should be present
    await expect(page.locator("#my-registrations-email")).toBeVisible();
  });

  test("submitting a valid email shows confirmation", async ({ page }) => {
    await page.goto("/my-registrations");

    // Fill in a valid email
    await page.locator("#my-registrations-email").fill("alice@moet.com");

    // Submit the form
    await page.getByRole("button", { name: /email me a secure link|mail mij een veilige link/i }).click();

    // Confirmation/info alert should appear
    await expect(
      page.getByRole("status").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("submitting an invalid email shows an error", async ({ page }) => {
    await page.goto("/my-registrations");

    await page.locator("#my-registrations-email").fill("not-an-email");
    await page.getByRole("button", { name: /email me a secure link|mail mij een veilige link/i }).click();

    await expect(page.getByRole("alert").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("shows registrations when a valid token is provided", async ({ page }) => {
    // Any non-empty token is accepted by the MSW mock
    await page.goto("/my-registrations?token=mock-token-reg-01");

    // Should show at least one registration card
    await expect(page.locator(".card").first()).toBeVisible({ timeout: 10_000 });

    // Event titles from seed data should be present
    await expect(page.locator("text=Grand Opening")).toBeVisible();
  });

  test("request new link button resets to email form", async ({ page }) => {
    await page.goto("/my-registrations?token=mock-token-reg-01");

    // Wait for registrations to load
    await expect(page.locator(".card").first()).toBeVisible({ timeout: 10_000 });

    // Click the "request new link" button
    const resetButton = page.getByRole("button", {
      name: /request another secure link|nog een veilige link aanvragen/i,
    });
    await resetButton.click();

    // Should return to the email form
    await expect(page.locator("#my-registrations-email")).toBeVisible({ timeout: 5_000 });
  });

  test("back to site link navigates home", async ({ page }) => {
    await page.goto("/my-registrations");

    const backLink = page.locator('a[href="/"]');
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL("/");
  });
});
