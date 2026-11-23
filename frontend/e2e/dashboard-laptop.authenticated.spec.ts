import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
});

test("registration workflow columns fit and optional columns remain configurable", async ({
  page,
}) => {
  await page.goto("/admin?section=registrations");
  await expect(page.locator("#admin.admin-authenticated")).toBeVisible({ timeout: 30_000 });
  const table = page.getByRole("table");
  for (const name of ["Status", "Payment", "Check-in", "Actions"]) {
    await expect(table.getByRole("columnheader", { name, exact: true })).toBeInViewport();
  }
  const scrollArea = page.locator('[data-slot="table-container"]').filter({ has: table });
  await expect
    .poll(() => scrollArea.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBe(0);
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  const hallLayout = page.getByRole("menuitemcheckbox", { name: "Hall Layout" });
  await expect(hallLayout).not.toBeChecked();
  await hallLayout.click();
  await page.keyboard.press("Escape");
  await expect(table.getByRole("columnheader", { name: "Hall Layout" })).toBeVisible();
});

test("large floor plan opens in view and can switch to full-size editing", async ({ page }) => {
  await page.goto("/admin?section=floor-plans");
  await expect(page.locator("#admin.admin-authenticated")).toBeVisible({ timeout: 30_000 });
  const rooms = page.getByRole("combobox", { name: "Rooms", exact: true });
  const events = page.getByRole("combobox", { name: "Event", exact: true });
  const actualSize = page.getByRole("button", { name: "Actual size" });
  const plan = page.getByRole("region", { name: "Hall 5", exact: true });
  const canvas = plan.locator('div[aria-label="Hall 5"]');
  await expect(canvas).toBeInViewport({ ratio: 0.5 });
  const toolbarTop = (await rooms.boundingBox())!.y;
  for (const control of [events, actualSize]) {
    await expect(control).toBeVisible();
    expect(Math.abs((await control.boundingBox())!.y - toolbarTop)).toBeLessThan(5);
  }
  await actualSize.click();
  await expect(page.getByRole("button", { name: "Fit plan" })).toBeVisible();
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBeGreaterThan(800);
  await page.getByRole("button", { name: "Fit plan" }).click();
  await expect(canvas).toBeInViewport({ ratio: 0.5 });
});

test("admin headings, header and empty review fit the laptop layout", async ({ page }) => {
  await page.goto("/admin?section=home");
  await expect(page.locator("#admin.admin-authenticated")).toBeVisible({ timeout: 30_000 });
  const header = page.locator(".standalone-navbar");
  await expect(header).toHaveAttribute("data-theme-mode", "dark");
  await expect(header.getByText("Admin Dashboard")).toHaveCount(0);
  const title = page.getByRole("heading", { name: "My tasks", level: 1 });
  const group = page.getByRole("heading", { name: "Bookings and arrivals", level: 2 });
  await expect(title).toHaveCSS("font-size", "24px");
  await expect(group).toHaveCSS("font-size", "18px");

  await page.getByRole("button", { name: "Programme", exact: true }).click();
  await expect(page.getByRole("button", { name: "Editions", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Organisations", exact: true }).click();
  const emptyQueue = page.getByText("No changes awaiting review.", { exact: true });
  await expect(emptyQueue).toBeVisible();
  const queueLine = emptyQueue.locator("..");
  const refresh = queueLine.getByRole("button", { name: "Refresh", exact: true });
  const heading = queueLine.getByRole("heading", { name: "Changes awaiting review" });
  const top = (await refresh.boundingBox())!.y;
  expect(Math.abs((await emptyQueue.boundingBox())!.y - top)).toBeLessThan(12);
  expect(Math.abs((await heading.boundingBox())!.y - top)).toBeLessThan(12);
});
