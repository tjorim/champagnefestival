import { expect, test } from "@playwright/test";

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage", "millesime"]) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      test(`${theme} admin forms at ${width}px (${colorScheme})`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript((selected) => {
          localStorage.setItem("champagnefestival:visualTheme", selected);
          localStorage.setItem("PARAGLIDE_LOCALE", "en");
        }, theme);
        await page.goto("/check-in?id=reg-01#token=mock-token-reg-01");
        await expect(page.getByText("Alice Dupont", { exact: true })).toBeVisible();
        const publicPath = testInfo.outputPath("public.png");
        await page.screenshot({ path: publicPath });
        await testInfo.attach("public theme", { path: publicPath, contentType: "image/png" });

        await page.goto("/admin");
        await expect(page.locator("#admin.admin-authenticated")).toBeVisible();
        if (width < 992) await page.getByRole("button", { name: "Toggle navigation" }).click();
        await page.getByRole("button", { name: /^Members/ }).click();
        await page.getByRole("button", { name: "Add member", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        const name = dialog.getByRole("textbox", { name: /^Name/ });
        await name.fill("Theme review");
        const language = dialog.getByRole("combobox", { name: "Preferred communication language" });
        await language.focus();
        await language.press("ArrowDown");
        const option = page.getByRole("option", { name: "Français", exact: true });
        await expect(option).toBeVisible();
        // A real pointer click also verifies that dialog/backdrop stacking does
        // not intercept the popup, which renders through its own portal.
        await option.click();
        await expect(language).toContainText("Français");
        await expect(language).toBeFocused();
        const active = dialog.getByRole("switch", { name: "Active", exact: true });
        await active.focus();
        await active.press("Space");
        await expect(active).not.toBeChecked();
        await expect(
          dialog.locator(
            ".form-control, .form-select, .form-check, .form-label, .invalid-feedback",
          ),
        ).toHaveCount(0);
        await expect(name).toHaveCSS("background-color", "rgb(30, 30, 30)");
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        const adminPath = testInfo.outputPath("admin-form.png");
        await page.screenshot({ path: adminPath });
        await testInfo.attach("admin form", { path: adminPath, contentType: "image/png" });
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Add member", exact: true })).toBeFocused();
      });
    }
  }
}
