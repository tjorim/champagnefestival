import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`organisation setup at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/admin?section=organizations");
    await page.getByRole("button", { name: en.admin_content_add_item, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: en.admin_content_add_item })).toBeVisible();
    await dialog.getByLabel(en.admin_content_name_placeholder).fill("Synthetic organisation");
    const contact = dialog.getByRole("combobox", { name: en.admin_item_contact_person });
    await contact.fill("Alice");
    await page.getByRole("option", { name: /Alice Dupont/ }).click();
    await dialog.getByRole("button", { name: en.organization_use_placeholder }).click();
    await dialog.getByRole("tab", { name: "French", exact: true }).click();
    await dialog
      .getByRole("textbox", { name: en.admin_item_description_fr, exact: true })
      .fill("Longue traduction. ".repeat(30));
    await dialog.getByRole("tab", { name: "Dutch", exact: true }).click();
    await dialog
      .getByRole("textbox", { name: en.admin_item_description_nl, exact: true })
      .fill("Nederlandse beschrijving");
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeInViewport();
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await save.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Synthetic organisation", { exact: true }).first()).toBeVisible();
  });

  test(`manager summary at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith("oidc.user:")) continue;
        const user = JSON.parse(localStorage.getItem(key)!);
        user.access_token = "mock-manager-token";
        user.profile.realm_access = { roles: [] };
        localStorage.setItem(key, JSON.stringify(user));
      }
    });
    await page.goto("/me?tab=organizations");
    await expect(page.getByText(en.organization_current, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("https://www.moet.com", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Champagne house presenting its cuvées at the festival.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: en.manager_change_edit, exact: true }).first().click();
    await page.getByRole("tab", { name: "French", exact: true }).first().click();
    await page
      .getByRole("textbox", { name: en.admin_item_description_fr, exact: true })
      .fill("Longue traduction. ".repeat(30));
    await page.getByRole("tab", { name: "Dutch", exact: true }).first().click();
    await page.getByRole("tab", { name: "French", exact: true }).first().click();
    await expect(
      page.getByRole("textbox", { name: en.admin_item_description_fr, exact: true }),
    ).toHaveValue("Longue traduction. ".repeat(30));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  });
}
