import { expect, test } from "@playwright/test";

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage", "millesime"]) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      test(`${theme} admin venue plan at ${width}px (${colorScheme})`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript((selected) => {
          localStorage.setItem("champagnefestival:visualTheme", selected);
          localStorage.setItem("PARAGLIDE_LOCALE", "en");
        }, theme);
        await page.goto("/venue-plan?edition=march-2027&table=table-01");

        const canvas = page.locator('[data-slot="venue-plan-canvas"]').first();
        await expect(canvas).toBeVisible();
        // Static look comes from owned CSS; only per-layout geometry stays inline.
        expect(await canvas.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
          "repeating-linear-gradient",
        );
        expect(await canvas.evaluate((el) => el.style.aspectRatio)).toBe("50 / 80");

        const selected = canvas.locator('[aria-current="location"]');
        await expect(selected).toHaveCount(1);
        await expect(selected).toContainText("T1");
        // Table positions still use the documented x/y percentage contract.
        expect(await selected.evaluate((el) => el.style.left)).toBe("20%");
        expect(await selected.evaluate((el) => el.style.top)).toBe("30%");

        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        const path = testInfo.outputPath("venue-plan.png");
        await page.screenshot({ path });
        await testInfo.attach("admin venue plan", { path, contentType: "image/png" });
      });
    }
  }
}
