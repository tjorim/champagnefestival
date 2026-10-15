import { expect, test } from "@playwright/test";

const LIGHT_ADMIN_THEMES: ReadonlySet<string> = new Set(["cuvee", "remuage"]);

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage", "millesime"]) {
  test(`admin layout keeps all CSS in layers under ${theme}`, async ({ page }) => {
    await page.addInitScript((variant) => {
      localStorage.setItem("champagnefestival:visualTheme", variant);
    }, theme);
    await page.goto("/admin");
    await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => !!document.querySelector<HTMLLinkElement>("#visual-theme-stylesheet")?.sheet,
        ),
      )
      .toBe(true);

    const unlayered = await page.evaluate(() =>
      [...document.styleSheets].flatMap((sheet) => {
        try {
          return [...sheet.cssRules]
            .filter((rule) => rule instanceof CSSStyleRule)
            .map((rule) => (rule as CSSStyleRule).selectorText);
        } catch {
          return [];
        }
      }),
    );
    expect(unlayered).toEqual([]);

    // The admin scope is fixed whatever the public color scheme is: dark, except Cuvée and Remuage,
    // whose admin is a light ledger (the dark-mode attribute stays; their tokens carry the palette).
    const scope = page.locator("section#admin");
    await expect(scope).toHaveAttribute("data-theme-mode", "dark");
    expect(await scope.evaluate((element) => getComputedStyle(element).colorScheme)).toBe(
      LIGHT_ADMIN_THEMES.has(theme) ? "light" : "dark",
    );
  });
}
