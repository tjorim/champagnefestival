import { expect, test } from "@playwright/test";

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage"]) {
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

    // The admin scope is fixed-dark whatever the public theme is.
    const scope = page.locator("section#admin");
    await expect(scope).toHaveAttribute("data-theme-mode", "dark");
    expect(await scope.evaluate((element) => getComputedStyle(element).colorScheme)).toBe("dark");
  });
}
