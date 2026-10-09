import { expect, test, type Locator } from "@playwright/test";

// Exclude focus outlines: selection must change the theme surface itself.
async function tabSurface(tab: Locator) {
  return tab.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.color, style.backgroundColor, style.backgroundImage, style.borderBottomColor];
  });
}

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage", "millesime"]) {
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
      const inactiveSurface = await tabSurface(tabs.nth(1));
      await tabs.first().focus();
      await page.keyboard.press("ArrowRight");
      await expect(tabs.nth(1)).toBeFocused();
      await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
      await expect.poll(() => tabSurface(tabs.nth(1))).not.toEqual(inactiveSurface);
      await page.keyboard.press("ArrowLeft");
      await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "false");
      await expect.poll(() => tabSurface(tabs.nth(1))).toEqual(inactiveSurface);
      await page.keyboard.press("ArrowRight");
      const panelId = await tabs.nth(1).getAttribute("aria-controls");
      expect(panelId).toBeTruthy();
      await expect(page.locator(`[id="${panelId}"]`)).toBeVisible();
      const faq = page.locator('#faq [data-slot="accordion-trigger"]').first();
      const chevron = faq.locator("svg");
      await expect(chevron).toHaveCSS("transform", "none");
      await faq.focus();
      await page.keyboard.press("Enter");
      await expect(faq).toHaveAttribute("aria-expanded", "true");
      await expect(chevron).toHaveCSS("transform", "matrix(-1, 0, 0, -1, 0, 0)");
      await page.keyboard.press("Enter");
      await expect(faq).toHaveAttribute("aria-expanded", "false");
      await expect(chevron).toHaveCSS("transform", "none");
      await page.keyboard.press("Enter");
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
