import { expect, test } from "@playwright/test";
import { legacyStyleChanges } from "./style-coexistence";

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage"]) {
  test(`Tailwind coexists with Bootstrap under ${theme}`, async ({ page }) => {
    await page.addInitScript((variant) => {
      localStorage.setItem("champagnefestival:visualTheme", variant);
    }, theme);
    await page.goto("/");
    await expect(page.locator("#welcome")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const link = document.querySelector<HTMLLinkElement>("#visual-theme-stylesheet");
          return !!link?.sheet;
        }),
      )
      .toBe(true);

    const result = await page.evaluate(() => {
      const button = document.createElement("button");
      button.className = "btn btn-primary p-4";
      button.textContent = "Cascade probe";
      document.body.append(button);
      const legacyPadding = getComputedStyle(button).paddingTop;
      button.classList.add("tw:p-0");
      const utilityPadding = getComputedStyle(button).paddingTop;
      button.remove();
      return { legacyPadding, utilityPadding };
    });
    expect(result.legacyPadding).not.toBe("0px");
    expect(result.utilityPadding).toBe("0px");

    // A prefixed stylesheet must have no effect on existing markup. Compare
    // computed properties with/without it, keeping the same DOM/theme/API state.
    const changes = await legacyStyleChanges(page);
    expect(changes).toEqual([]);
  });
}
