import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 390, height: 700 },
]) {
  test(`restores People location and keyboard navigation at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
    await page.goto("/admin?section=people&peopleTab=volunteers");
    const volunteers = page.getByRole("tab", { name: /^Volunteers\s/ });
    await expect(volunteers).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveTitle(/People/);
    await page.reload();
    await expect(volunteers).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: /^Members\s/ }).click();
    await expect(page).toHaveURL(/peopleTab=members/);
    await page.goBack();
    await expect(volunteers).toHaveAttribute("aria-selected", "true");
    await page.goForward();
    await expect(page.getByRole("tab", { name: /^Members\s/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    if (viewport.width < 768)
      await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    const registrations = page
      .getByRole("navigation", { name: "Admin Dashboard", exact: true })
      .getByRole("button", { name: /^Registrations(?:\s|\d|$)/ });
    await registrations.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/section=registrations/);
    await expect(page.locator("#admin-content")).toBeFocused();
  });
}

test("unknown sections explain the fallback", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
  await page.goto("/admin?section=unknown");
  await expect(
    page.getByRole("alert").filter({ hasText: "This destination is unavailable" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Admin Dashboard", exact: true })
      .getByRole("button", { name: /^Registrations(?:\s|\d|$)/ }),
  ).toHaveAttribute("aria-current", "page");
});

test("volunteer-only sessions receive an explained registrations fallback", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("PARAGLIDE_LOCALE", "en");
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("oidc.user:")) continue;
      const user = JSON.parse(localStorage.getItem(key)!);
      user.profile.realm_access.roles = ["volunteer"];
      localStorage.setItem(key, JSON.stringify(user));
    }
  });
  await page.goto("/admin?section=people&peopleTab=volunteers");
  await expect(
    page.getByRole("alert").filter({ hasText: "This destination is unavailable" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Admin Dashboard", exact: true })
      .getByRole("button", { name: /^Registrations/ }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("tab", { name: /^Volunteers/ })).toHaveCount(0);
});
