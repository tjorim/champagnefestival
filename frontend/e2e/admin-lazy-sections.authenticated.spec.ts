import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// This suite uses the repository's Vite/MSW server to observe actual module requests.
// Context routes include the worker's passthrough requests, unlike page routes.
const analyticsModule = "**/src/components/admin/AnalyticsDashboard.tsx*";
const attendanceChart = "Guests registered and checked in per edition, chronological";

async function expectRegistrations(page: import("@playwright/test").Page) {
  await expect(page.locator("#admin.admin-authenticated")).toBeVisible();
  await expect(page.getByText("alice@moet.com", { exact: true }).first()).toBeVisible();
}

test("downloads secondary tools only on selection and keeps navigation usable while loading", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const requested: string[] = [];
  page.context().on("request", (request) => requested.push(request.url()));
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = false;
  await page.context().route(analyticsModule, async (route) => {
    intercepted = true;
    await pending;
    await route.continue();
  });
  try {
    await page.goto("/admin");
    await expectRegistrations(page);
    for (const module of [
      "AnalyticsDashboard",
      "LayoutEditor",
      "ContentManagement",
      "SignageChannels",
    ]) {
      expect(requested.some((url) => url.includes(`/admin/${module}.tsx`))).toBe(false);
    }
    await page.getByRole("button", { name: "Analytics", exact: true }).click();
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.locator(".admin-content-pane .admin-skeleton")).toBeVisible();
    await expect(page.locator('.admin-content-pane [data-slot="skeleton"]').first()).toBeVisible();
    await page.getByRole("button", { name: /^Registrations/ }).click();
    await expectRegistrations(page);
    release();
    await page.getByRole("button", { name: "Analytics", exact: true }).click();
    await expect(page.getByRole("img", { name: attendanceChart, exact: true })).toBeVisible();
    await expect(page.locator(".admin-content-pane .admin-skeleton")).toHaveCount(0);
  } finally {
    release();
  }
});

test("contains a failed chunk download and recovers after reloading", async ({ page }) => {
  test.setTimeout(60_000);
  await page.context().route(analyticsModule, (route) => route.abort("failed"));
  await page.goto("/admin");
  await expectRegistrations(page);
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  const error = page.getByRole("alert").filter({ hasText: "This section could not be loaded." });
  await expect(error).toBeVisible();
  await expect(error).not.toContainText("Failed to fetch");
  expect(
    (await new AxeBuilder({ page }).include(".admin-content-pane").analyze()).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: /^Registrations/ }).click();
  await expectRegistrations(page);
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(error).toBeVisible();
  await page.context().unroute(analyticsModule);
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.getByRole("button", { name: "Reload page", exact: true }).click(),
  ]);
  await expectRegistrations(page);
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(page.getByRole("img", { name: attendanceChart, exact: true })).toBeVisible();
});

test("opens content, editions, venue and floor-plan tools from the sidebar", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/admin");
  await expectRegistrations(page);
  await page.getByRole("button", { name: "Organisations", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Organisations/ })).toBeVisible();
  await page.getByRole("button", { name: "Festival Editions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Festival Editions", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Venues & Rooms", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add venue", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Floor Plans", exact: true }).click();
  await expect(page.getByRole("group", { name: "Rooms", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Registrations/ }).click();
  await expectRegistrations(page);
});
