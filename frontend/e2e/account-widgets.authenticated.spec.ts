import { expect, test } from "@playwright/test";

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage", "millesime"]) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      test(`${theme} account and check-in widgets at ${width}px (${colorScheme})`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript((selected) => {
          localStorage.setItem("champagnefestival:visualTheme", selected);
        }, theme);
        await page
          .context()
          .route("**/api/me/communication-preference", (route) =>
            route.fulfill({ json: { preferred_language: "en" } }),
          );
        await page
          .context()
          .route("**/api/me/volunteer", (route) => route.fulfill({ json: { linked: false } }));
        await page.goto("/me");
        const account = page.getByRole("tab", { name: "My Account", exact: true });
        await expect(account).toBeVisible();
        await account.click();
        await expect(page.getByRole("tabpanel", { name: "My Account", exact: true })).toBeVisible();
        const accountPath = testInfo.outputPath(`${theme}-${width}-account.png`);
        await page.screenshot({ path: accountPath, fullPage: true });
        await testInfo.attach("account", { path: accountPath, contentType: "image/png" });
        await page.goto("/check-in");
        const trigger = page.getByRole("button", { name: "Find guest manually", exact: true });
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#manual-checkin-search")).toBeHidden();
        await page.keyboard.press("Enter");
        await expect(page.locator("#manual-checkin-search")).toBeVisible();
        const checkinPath = testInfo.outputPath(`${theme}-${width}-checkin.png`);
        await page.screenshot({ path: checkinPath, fullPage: true });
        await testInfo.attach("check-in", { path: checkinPath, contentType: "image/png" });
        await page.goto("/admin");
        await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
        const adminPath = testInfo.outputPath(`${theme}-${width}-admin.png`);
        await page.screenshot({ path: adminPath });
        await testInfo.attach("fixed-dark admin", { path: adminPath, contentType: "image/png" });
      });
    }
  }
}
