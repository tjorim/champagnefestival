import { expect, test } from "@playwright/test";

for (const locale of ["nl", "fr", "en"] as const) {
  for (const path of ["/admin", "/me", "/check-in", "/venue-plan"]) {
    test(`signed-out ${path} declares ${locale}`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("PARAGLIDE_LOCALE", value), locale);
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
    });
  }
}
