import { test, expect } from "@playwright/test";

test.describe("Guest registration", () => {
  test("registration section is visible on the landing page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const section = page.locator("#registrations");
    await expect(section).toBeVisible();

    // CTA button should be rendered
    const regButton = section.locator("button[type='button']").first();
    await expect(regButton).toBeVisible();
  });

  test("registration CTA button is disabled when no registrable events", async ({ page }) => {
    // The MSW mock edition has events with registrations_open_from in the future,
    // so the button is correctly disabled in the pre-festival period.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const regButton = page.locator("#registrations button[type='button']").first();
    await expect(regButton).toBeVisible();
    await expect(regButton).toBeDisabled();
  });

  test("POST /api/registrations returns 201 with mock data", async ({ page }) => {
    // Use page.evaluate so the fetch runs inside the browser context where
    // the MSW service worker intercepts it (page.request bypasses the SW).
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E Test User",
          email: "e2e@example.com",
          phone: "+32471000001",
          event_id: "event-01",
          guest_count: 2,
          notes: "Playwright E2E test",
          pre_orders: [],
          honeypot: "",
          form_start_time: new Date().toISOString(),
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(201);
    const body = result.body as Record<string, unknown>;
    expect(body.id).toBeTruthy();
    expect(body.status).toBe("pending");
    expect(body.check_in_token).toBeTruthy();
  });
});
