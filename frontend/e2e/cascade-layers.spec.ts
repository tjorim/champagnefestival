import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const themes = ["refresh", "classic", "riviera", "cuvee", "remuage"];

async function waitForTheme(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => !!document.querySelector<HTMLLinkElement>("#visual-theme-stylesheet")?.sheet,
      ),
    )
    .toBe(true);
}

/** Style rules that sit outside every cascade layer beat all layered CSS. */
async function unlayeredStyleRules(page: Page) {
  return page.evaluate(() =>
    [...document.styleSheets].flatMap((sheet) => {
      try {
        return [...sheet.cssRules]
          .filter((rule) => rule instanceof CSSStyleRule)
          .map((rule) => `${sheet.href ?? "inline"}: ${(rule as CSSStyleRule).selectorText}`);
      } catch {
        return []; // cross-origin font stylesheet
      }
    }),
  );
}

for (const theme of themes) {
  test(`utilities override owned and theme CSS without !important under ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript((variant) => {
      localStorage.setItem("champagnefestival:visualTheme", variant);
    }, theme);
    await page.goto("/");
    await expect(page.locator("#welcome")).toBeVisible();
    await waitForTheme(page);

    const result = await page.evaluate(() => {
      // `.site-brand` is owned CSS (font-size in the components layer); `text-xs`
      // is a plain utility. A utility wins from the later layer.
      const probe = document.createElement("span");
      probe.className = "site-brand";
      document.body.append(probe);
      const owned = getComputedStyle(probe).fontSize;
      probe.classList.add("text-xs");
      const withUtility = getComputedStyle(probe).fontSize;
      const flatten = (rules: CSSRuleList): CSSRule[] =>
        [...rules].flatMap((rule) =>
          "cssRules" in rule ? [rule, ...flatten((rule as CSSGroupingRule).cssRules)] : [rule],
        );
      const rulesOf = (sheet: CSSStyleSheet) => {
        try {
          return flatten(sheet.cssRules);
        } catch {
          return []; // cross-origin font stylesheet
        }
      };
      const important = [...document.styleSheets].some((sheet) =>
        rulesOf(sheet).some(
          (rule) =>
            rule instanceof CSSStyleRule &&
            rule.selectorText === ".text-xs" &&
            rule.style.getPropertyPriority("font-size") === "important",
        ),
      );
      probe.remove();
      return { owned, withUtility, important };
    });
    expect(result.owned).not.toBe("12px");
    expect(result.withUtility).toBe("12px");
    expect(result.important).toBe(false);
  });

  test(`no unlayered author CSS and no Bootstrap under ${theme}`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.addInitScript((variant) => {
      localStorage.setItem("champagnefestival:visualTheme", variant);
    }, theme);
    await page.goto("/");
    await expect(page.locator("#welcome")).toBeVisible();
    await waitForTheme(page);

    expect(await unlayeredStyleRules(page)).toEqual([]);
    expect(requests.filter((url) => /bootstrap/i.test(url))).toEqual([]);
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--bs-blue"),
      ),
    ).toBe("");
    expect(await page.locator("html").getAttribute("data-bs-theme")).toBeNull();
  });
}
