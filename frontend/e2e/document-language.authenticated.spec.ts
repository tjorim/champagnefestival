import { expect, test } from "@playwright/test";

const ROUTES = ["/admin", "/me", "/check-in", "/venue-plan"] as const;
const LOCALES = ["nl", "fr", "en"] as const;

for (const locale of LOCALES) {
  for (const path of ROUTES) {
    test(`document language is ${locale} on ${path}`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("PARAGLIDE_LOCALE", value), locale);
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
    });
  }
}

test("language menu changes the document language on /admin", async ({ page }) => {
  await page.addInitScript(() => {
    // Seed only the first load, so the locale the menu stores survives its reload.
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("PARAGLIDE_LOCALE", "en");
    }
  });
  await page.goto("/admin");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();

  await page.locator(".site-lang-toggle").first().click();
  await page.getByRole("menuitem", { name: /Français/ }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});
