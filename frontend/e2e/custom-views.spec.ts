import { expect, test } from "@playwright/test";

const THEMES = ["refresh", "classic", "riviera", "cuvee", "remuage"] as const;

const ANNOUNCEMENTS = [
  { id: "a", text: "Doors open", level: "info", link_url: null, link_label: null },
  { id: "b", text: "Parking full", level: "warning", link_url: null, link_label: null },
  { id: "c", text: "Closing early", level: "urgent", link_url: null, link_label: null },
];

for (const theme of THEMES) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      test(`${theme} maintenance page and theme switcher at ${width}px (${colorScheme})`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript((selected) => {
          localStorage.setItem("champagnefestival:visualTheme", selected);
          localStorage.setItem("PARAGLIDE_LOCALE", "en");
          localStorage.setItem("msw:maintenance", "true");
        }, theme);
        await page.goto("/");

        const maintenance = page.locator(".maintenance-page");
        await expect(maintenance).toBeVisible();
        // Owned stylesheet: no embedded <style> and no inline styles on the page.
        await expect(maintenance.locator("style")).toHaveCount(0);
        await expect(maintenance.locator("[style]")).toHaveCount(0);
        await expect(page.locator(".maintenance-page__title")).toHaveCSS("font-weight", "900");
        await expect(page.locator(".maintenance-page__cta")).toBeVisible();

        const switcher = page.getByRole("group", { name: /visual design preview switcher/i });
        await expect(switcher).toBeVisible();
        await expect(switcher).toHaveCSS("position", "fixed");
        await expect(switcher).not.toHaveAttribute("style", /.+/);
        if (width > 575) {
          await expect(switcher.getByRole("button", { name: /remuage/i })).toBeVisible();
        } else {
          await expect(switcher.getByRole("combobox")).toBeVisible();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );

        const path = testInfo.outputPath("maintenance.png");
        await page.screenshot({ path });
        await testInfo.attach("maintenance page", { path, contentType: "image/png" });
      });

      test(`${theme} announcement ticker seams at ${width}px (${colorScheme})`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript(
          ([selected, announcements]) => {
            localStorage.setItem("champagnefestival:visualTheme", selected);
            localStorage.setItem("PARAGLIDE_LOCALE", "en");
            localStorage.setItem("msw:announcements", announcements);
          },
          [theme, JSON.stringify(ANNOUNCEMENTS)] as const,
        );
        await page.goto("/");

        const ticker = page.getByRole("region", { name: /announcements/i });
        await expect(ticker).toBeVisible();
        const seams = ticker.locator(".announcement-ticker__seam");
        await expect(seams).toHaveCount(6);
        // Seam gradients come from CSS variables keyed on data attributes.
        for (const [from, to, index] of [
          ["info", "warning", 1],
          ["warning", "urgent", 2],
          ["urgent", "info", 0],
        ] as const) {
          const seam = seams.nth(index);
          await expect(seam).toHaveAttribute("data-from", from);
          await expect(seam).toHaveAttribute("data-to", to);
          await expect(seam).not.toHaveAttribute("style", /.+/);
          expect(await seam.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
            "linear-gradient",
          );
        }
        // The last item's flat fill is the exact endpoint of its seam.
        const urgentItem = ticker.locator(".announcement-urgent").first();
        await expect(urgentItem).toHaveCSS("background-color", "rgb(169, 25, 43)");

        const path = testInfo.outputPath("announcements.png");
        await page.screenshot({ path });
        await testInfo.attach("announcement ticker", { path, contentType: "image/png" });
      });
    }
  }
}
