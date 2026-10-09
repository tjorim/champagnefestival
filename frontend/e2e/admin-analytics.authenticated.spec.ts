import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
});

test("renders the attendance and check-in rate charts with the shared palette", async ({
  page,
}) => {
  const attendance = page.getByRole("img", {
    name: "Guests registered and checked in per edition, chronological",
  });
  await expect(attendance).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Share of registered guests who checked in, per edition, chronological",
    }),
  ).toBeVisible();

  // Series colors come from --ts-chart-1/2 in analyticsDashboard.css.
  const fills = await attendance
    .locator('path[fill*="--ts-chart-"]')
    .evaluateAll((bars) => bars.map((bar) => getComputedStyle(bar).fill));
  expect(fills).toContain("rgb(57, 135, 229)");
  expect(fills).toContain("rgb(25, 158, 112)");
});

test("hovering a legend entry dims the other series", async ({ page }) => {
  const attendance = page.getByRole("img", {
    name: "Guests registered and checked in per edition, chronological",
  });
  await expect(attendance).toBeVisible();
  const guestBars = attendance.locator('path[fill*="--ts-chart-1"]');
  await expect(guestBars.first()).toBeVisible();
  await expect(attendance).toHaveAttribute("data-ts-motion-state", "finished");

  await page.getByRole("button", { name: "Checked in" }).hover();

  await expect
    .poll(async () => guestBars.first().evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeLessThan(0.5);

  await page.mouse.move(0, 0);
  await expect
    .poll(async () => guestBars.first().evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1);
});

test("downloads the attendance chart as SVG and PNG", async ({ page }) => {
  await expect(page.getByRole("img", { name: /Guests registered and checked in/ })).toBeVisible();

  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download chart (SVG)" }).click();
  expect((await svgDownload).suggestedFilename()).toBe("attendance-chart.svg");

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download chart (PNG)" }).click();
  expect((await pngDownload).suggestedFilename()).toBe("attendance-chart.png");
});
