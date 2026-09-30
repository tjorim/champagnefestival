import { expect, test } from "@playwright/test";

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage"]) {
  for (const width of [1440, 390]) {
    test(`${theme} public widgets at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((selected) => {
        localStorage.setItem("champagnefestival:visualTheme", selected);
        localStorage.setItem("PARAGLIDE_LOCALE", "en");
      }, theme);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-visual-theme", theme);
      const language = page.getByRole("button", { name: "Select language" });
      await language.focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("menu")).toBeVisible();
      const languagePath = testInfo.outputPath(`${theme}-${width}-language.png`);
      await page.screenshot({ path: languagePath });
      await testInfo.attach("language menu", { path: languagePath, contentType: "image/png" });
      // The public menu must inherit the visitor theme, not the fixed admin scope.
      await expect(page.locator('[data-theme-scope="admin"] [role="menu"]')).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(language).toBeFocused();
      if (width < 992 && theme !== "classic") {
        const menuButton = page.locator(".site-menu-button");
        await menuButton.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        const navigationPath = testInfo.outputPath(`${theme}-${width}-navigation.png`);
        await page.screenshot({ path: navigationPath });
        await testInfo.attach("mobile navigation", {
          path: navigationPath,
          contentType: "image/png",
        });
        await page.keyboard.press("Escape");
        await expect(menuButton).toBeFocused();
      }
      const tabs = page.locator("#schedule").getByRole("tab");
      await expect(tabs.first()).toBeVisible();
      await tabs.first().focus();
      await page.keyboard.press("ArrowRight");
      await expect(tabs.nth(1)).toBeFocused();
      await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("#schedule").getByRole("tabpanel")).toBeVisible();
      const faq = page.locator('#faq [data-slot="accordion-trigger"]').first();
      await faq.focus();
      await page.keyboard.press("Enter");
      await expect(faq).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator('#faq [data-slot="accordion-content"]')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const screenshotPath = testInfo.outputPath(`${theme}-${width}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await testInfo.attach(`${theme}-${width}`, {
        path: screenshotPath,
        contentType: "image/png",
      });
      await page.goto("/privacy");
      await expect(page.getByRole("main")).toBeVisible();
    });
  }
}
