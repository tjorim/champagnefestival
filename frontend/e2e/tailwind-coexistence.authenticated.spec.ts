import { expect, test } from "@playwright/test";
import { legacyStyleChanges } from "./style-coexistence";

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage"]) {
  test(`Tailwind leaves the ${theme} admin layout unchanged`, async ({ page }) => {
    await page.addInitScript((variant) => {
      localStorage.setItem("champagnefestival:visualTheme", variant);
    }, theme);
    await page.goto("/admin");
    await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          return !!document.querySelector<HTMLLinkElement>("#visual-theme-stylesheet")?.sheet;
        }),
      )
      .toBe(true);
    expect(await legacyStyleChanges(page)).toEqual([]);
  });
}
