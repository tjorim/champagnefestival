import { expect, test } from "@playwright/test";

const LEGACY = ".alert, .badge, .spinner-border, .spinner-grow";

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage", "millesime"]) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      test(`${theme} alerts, badges and spinners at ${width}px (${colorScheme})`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript((selected) => {
          localStorage.setItem("champagnefestival:visualTheme", selected);
          localStorage.setItem("PARAGLIDE_LOCALE", "en");
        }, theme);

        // Public: check-in status badges carry text, not just colour.
        await page.goto("/check-in?id=reg-01#token=mock-token-reg-01");
        await expect(page.getByText("Alice Dupont", { exact: true })).toBeVisible();
        const publicBadge = page.locator('[data-slot="badge"]').first();
        await expect(publicBadge).toBeVisible();
        expect(((await publicBadge.textContent()) ?? "").trim().length).toBeGreaterThan(0);
        await expect(page.locator(LEGACY)).toHaveCount(0);
        const publicPath = testInfo.outputPath("public-status.png");
        await page.screenshot({ path: publicPath });
        await testInfo.attach("public status components", {
          path: publicPath,
          contentType: "image/png",
        });

        // Admin: fixed-dark scope keeps readable, token-driven badges.
        await page.goto("/admin");
        await expect(page.locator("#admin.admin-authenticated")).toBeVisible();
        const adminBadge = page.locator('#admin [data-slot="badge"]').first();
        await expect(adminBadge).toBeVisible();
        expect(((await adminBadge.textContent()) ?? "").trim().length).toBeGreaterThan(0);
        await expect(page.locator(LEGACY)).toHaveCount(0);
        const colors = await adminBadge.evaluate((el) => {
          const style = getComputedStyle(el);
          return { color: style.color, background: style.backgroundColor };
        });
        expect(colors.color).not.toBe(colors.background);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        const adminPath = testInfo.outputPath("admin-status.png");
        await page.screenshot({ path: adminPath });
        await testInfo.attach("admin status components", {
          path: adminPath,
          contentType: "image/png",
        });
      });
    }
  }
}
