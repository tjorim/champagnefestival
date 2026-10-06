import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
  await page.goto("/admin");
  await expect(page.locator("#admin.admin-authenticated")).toBeVisible();
});

for (const screen of ["Members", "Volunteers", "People"] as const) {
  test(`${screen} uses server pages and preserves filters after editing`, async ({ page }) => {
    const tab = page.getByRole("button", {
      name: new RegExp(`^${screen === "People" ? "Directory" : screen}(?:\\s|$)`),
    });
    await tab.click();
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    const firstRow = table.getByRole("row").nth(1);
    await expect(firstRow).toBeVisible();
    const name = await firstRow.getAttribute("aria-label");
    const search = page.getByRole("textbox", { name: "Search by name, email, phone…" });
    await search.fill(name!);
    await expect(page).toHaveURL(/table_/);
    const filteredRow = table.getByRole("row", { name: name! });
    await filteredRow.getByRole("button", { name: /Edit/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Volunteer seed rows may have no identity; this flow verifies opening the
    // stored periods and closing, while member/people forms exercise a save.
    if (screen === "Volunteers") await dialog.getByRole("button", { name: "Cancel" }).click();
    else await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(search).toHaveValue(name!);
    await expect(filteredRow).toBeVisible();
  });
}
