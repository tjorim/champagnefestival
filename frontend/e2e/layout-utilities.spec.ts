import { expect, test } from "@playwright/test";

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage"]) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      test(`${theme} layouts at ${width}px (${colorScheme})`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript((selected) => {
          localStorage.setItem("champagnefestival:visualTheme", selected);
          localStorage.setItem("PARAGLIDE_LOCALE", "en");
        }, theme);
        await page.goto("/privacy", { waitUntil: "domcontentloaded" });
        await expect(page.locator("html")).toHaveAttribute("data-visual-theme", theme);
        await expect
          .poll(() =>
            page.evaluate(
              () => !!document.querySelector<HTMLLinkElement>("#visual-theme-stylesheet")?.sheet,
            ),
          )
          .toBe(true);
        await expect(page.getByText("Your privacy matters.")).toBeVisible();
        await expect(page.locator("#privacy-policy h1")).toBeVisible();
        const column = page.locator("#privacy-policy .site-content-column");
        await expect(column).toBeVisible();
        const header = page.locator(".standalone-navbar");
        expect(await header.evaluate((e) => getComputedStyle(e).position)).toBe("fixed");
        const headerBox = await header.boundingBox();
        const titleBox = await page.locator("#privacy-policy h1").boundingBox();
        // Allow the one-pixel header border at fractional browser dimensions.
        expect(titleBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        const publicPath = testInfo.outputPath("privacy.png");
        await page.screenshot({ path: publicPath });
        await testInfo.attach("public layout", { path: publicPath, contentType: "image/png" });

        await page.goto("/admin", { waitUntil: "domcontentloaded" });
        const login = page.getByRole("button", { name: "Login", exact: true });
        await expect(login).toBeVisible();
        await login.focus();
        await expect(login).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        const adminPath = testInfo.outputPath("admin-login.png");
        await page.screenshot({ path: adminPath });
        await testInfo.attach("admin login layout", { path: adminPath, contentType: "image/png" });
      });
    }
  }
}

test("login columns retain the 576/768/992px breakpoints", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  const login = page.getByRole("button", { name: "Login", exact: true });
  await expect(login).toBeVisible();
  for (const [width, fraction] of [
    [575, 1],
    [576, 2 / 3],
    [767, 2 / 3],
    [768, 1 / 2],
    [991, 1 / 2],
    [992, 1 / 3],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        login.evaluate((e) => {
          const column = e.parentElement!;
          return (
            column.getBoundingClientRect().width /
            column.parentElement!.getBoundingClientRect().width
          );
        }),
      )
      .toBeCloseTo(fraction, 2);
  }
});
