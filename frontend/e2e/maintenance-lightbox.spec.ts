import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { AXE_SCENARIOS, prepareScenario, seedVisualTheme, settleAnimations } from "./axe";

test.describe("maintenance flyer lightbox", () => {
  for (const scenario of AXE_SCENARIOS) {
    test(`traps focus, closes on Escape and returns focus (${scenario.name})`, async ({ page }) => {
      await prepareScenario(page, scenario);
      await seedVisualTheme(page, "refresh");
      await page.addInitScript(() => {
        localStorage.setItem("PARAGLIDE_LOCALE", "en");
        localStorage.setItem("msw:maintenance", "true");
      });
      await page.goto("/");

      const trigger = page.locator(".maintenance-page__flyer-trigger");
      await expect(trigger).toBeVisible();
      await trigger.focus();
      await page.keyboard.press("Enter");

      const dialog = page.getByRole("dialog", { name: /flyer/i });
      await expect(dialog).toBeVisible();
      // Scoped to the dialog: the preview theme switcher behind it has its own contrast
      // finding in light mode that is not part of the lightbox.
      await settleAnimations(page);
      const results = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);

      // Focus stays inside the dialog while tabbing.
      for (let i = 0; i < 3; i += 1) {
        await page.keyboard.press("Tab");
        await expect(dialog.locator(":focus")).toHaveCount(1);
      }

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  }
});
