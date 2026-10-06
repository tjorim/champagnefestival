import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/admin");
});

test("server table sorting, selection and dark column menu", async ({ page }) => {
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  const name = table.getByRole("button", { name: "Name", exact: true });
  await name.focus();
  await name.press("Enter");
  await expect(table.getByRole("columnheader", { name: "Name", exact: true })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await name.press("Space");
  await expect(table.getByRole("columnheader", { name: "Name", exact: true })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await table.getByRole("checkbox", { name: "Select all visible" }).check();
  await expect(table.getByRole("checkbox", { name: "Select all visible" })).toBeChecked();
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  const guests = page.getByRole("menuitemcheckbox", { name: "Guests", exact: true });
  await expect(guests).toBeChecked();
  await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCSS(
    "background-color",
    "rgb(30, 30, 30)",
  );
  await guests.click();
  await expect(guests).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(table.getByRole("columnheader", { name: "Guests", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Guests", exact: true })).toHaveCount(0);
});

test("people table visibility persists and narrow layout shows cards", async ({ page }) => {
  await page.getByRole("button", { name: /Directory/ }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Email", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Email", exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: /Registrations/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Directory/ }).click();
  await expect(page.getByRole("columnheader", { name: "Email", exact: true })).toHaveCount(0);
  const phone = page.locator("th").filter({ hasText: /^Phone Number$/ });
  await expect(phone).toHaveCount(1);
  await expect(phone).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("table")).toBeHidden();
  await expect(phone).toBeHidden();
  await expect(
    page
      .locator("main li")
      .filter({ has: page.getByRole("button", { name: /^Edit:/ }) })
      .first(),
  ).toBeVisible();
});
