import { test, expect } from "@playwright/test";

test.describe("Guest registration", () => {
  test("registration section is visible on the landing page", async ({ page }) => {
    await page.goto("/");

    const section = page.locator("#registrations");
    await expect(section).toBeVisible();

    // CTA button should be rendered
    const regButton = section.getByRole("button", { name: /register now|registreer nu/i });
    await expect(regButton).toBeVisible();
  });

  test("registration CTA button is disabled when no registrable events", async ({ page }) => {
    // The MSW mock edition has events with registrations_open_from in the future,
    // so the button is correctly disabled in the pre-festival period.
    await page.goto("/");

    const regButton = page
      .locator("#registrations")
      .getByRole("button", { name: /register now|registreer nu/i });
    await expect(regButton).toBeVisible();
    await expect(regButton).toBeDisabled();
  });

  test("registration form can be submitted when registrations are open", async ({ page }) => {
    // Move the browser clock to when registrations are open (events open 2027-01-01)
    await page.clock.setFixedTime(new Date("2027-02-01T12:00:00Z"));

    await page.goto("/");

    // CTA button should now be enabled
    const regButton = page
      .locator("#registrations")
      .getByRole("button", { name: /register now|registreer nu/i });
    await expect(regButton).toBeEnabled();
    await regButton.click();

    // Fill in the form
    await page.locator("#res-name").fill("E2E Test User");
    await page.locator("#res-email").fill("e2e@example.com");
    await page.locator("#res-phone").fill("+32471000001");
    await page.locator("#res-guests").fill("2");

    // Submit
    await page
      .getByRole("button", { name: /submit registration|registratie indienen/i })
      .click();

    // Success alert should appear inside the modal
    await expect(page.locator(".modal").getByRole("alert")).toBeVisible({ timeout: 10_000 });
  });
});
