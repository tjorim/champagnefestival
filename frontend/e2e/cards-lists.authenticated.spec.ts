import { expect, test } from "@playwright/test";

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage", "millesime"]) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      test(`${theme} cards and lists at ${width}px (${colorScheme})`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript((selected) => {
          localStorage.setItem("champagnefestival:visualTheme", selected);
          localStorage.setItem("PARAGLIDE_LOCALE", "en");
        }, theme);
        await page.goto("/check-in?id=reg-01#token=mock-token-reg-01");
        await expect(page.getByText("Alice Dupont", { exact: true })).toBeVisible();
        const card = page.locator('[data-slot="card"]').filter({ hasText: "Alice Dupont" });
        await expect(card).toBeVisible();
        await expect(card.getByRole("list").first()).toBeVisible();
        await expect(card.getByRole("listitem").first()).toBeVisible();
        await expect(page.locator(".card, .list-group, .list-group-item")).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        const publicPath = testInfo.outputPath("public-cards.png");
        await page.screenshot({ path: publicPath });
        await testInfo.attach("public cards", { path: publicPath, contentType: "image/png" });
        await page.goto("/admin");
        await expect(page.locator("#admin.admin-authenticated")).toBeVisible();
        await expect(page.locator('#admin [data-slot="card"]').first()).toBeVisible();
        await expect(page.locator(".card, .list-group, .list-group-item")).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        const adminPath = testInfo.outputPath("admin-cards.png");
        await page.screenshot({ path: adminPath });
        await testInfo.attach("admin cards", { path: adminPath, contentType: "image/png" });
      });
    }
  }
}
