import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

for (const width of [1366, 390]) {
  test(`shared admin controls retain keyboard and mobile behaviour at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
    await page.goto("/admin");
    await expect(page.locator("#admin.admin-authenticated")).toBeVisible();
    const navigation = page.getByRole("navigation", { name: "Admin Dashboard", exact: true });
    const trigger = page.getByRole("button", { name: "Toggle navigation", exact: true });
    if (width < 992) {
      await expect(navigation).toHaveCount(0);
      await trigger.click();
      const sheet = page.getByRole("dialog", { name: "Admin Dashboard", exact: true });
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveCSS("width", "288px");
      await expect(sheet).toHaveCSS("background-color", "rgb(30, 30, 30)");
      await expectNoAxeViolations(page, "/admin", {
        name: "mobile-sidebar",
        colorScheme: "light",
        viewport: { width, height: 900 },
      });
      await sheet.getByRole("button", { name: "Close", exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(sheet.getByRole("button", { name: /^Registrations/ })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(sheet).toBeVisible();
      await page
        .locator('[data-slot="sheet-overlay"]')
        .click({ position: { x: width - 10, y: 20 } });
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
    }
    await expect(navigation).toBeVisible();
    if (width >= 992) {
      const sidebar = await page.locator('[data-slot="sidebar-container"]').boundingBox();
      expect(sidebar?.y).toBe(64);
      expect(Math.round((sidebar?.y ?? 0) + (sidebar?.height ?? 0))).toBe(900);
    }
    const content = navigation.getByRole("button", { name: "Content", exact: true });
    await content.click();
    await expect(
      navigation.getByRole("button", { name: "Screen channels", exact: true }),
    ).toHaveCount(0);
    await content.press("Space");
    await expect(
      navigation.getByRole("button", { name: "Screen channels", exact: true }),
    ).toBeVisible();
    await navigation.getByRole("button", { name: /^People(?:\s|\d|$)/ }).click();
    if (width < 992) await expect(page.getByRole("dialog")).toHaveCount(0);
    const pagination = page.getByRole("navigation", { name: "Pagination", exact: true });
    await expect(pagination).toBeVisible();
    await expect(pagination.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
    await expect(pagination.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    const search = page.getByRole("textbox", { name: "Search by name, email, phone…" });
    await search.fill("No matching person for the empty state");
    await expect(page.locator('[data-slot="empty"]')).toContainText("No people found");
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(page.locator('[data-slot="empty"]')).toHaveCount(0);
    if (width < 992) await trigger.click();
    await navigation.getByRole("button", { name: /^Registrations/ }).click();
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const statuses = page.getByRole("group", { name: "Filter by status", exact: true });
    const pending = statuses.getByRole("button", { name: /^Pending/ });
    await pending.click();
    await expect(pending).toHaveAttribute("aria-pressed", "true");
    await pending.press("ArrowRight");
    const confirmed = statuses.getByRole("button", { name: /^Confirmed/ });
    await expect(confirmed).toBeFocused();
    await confirmed.press("Space");
    await expect(confirmed).toHaveAttribute("aria-pressed", "true");
    await confirmed.click();
    await expect(confirmed).toHaveAttribute("aria-pressed", "true");
    const activeEdition = page.getByRole("button", { name: /^Active edition/ });
    await activeEdition.click();
    await expect(confirmed).toHaveAttribute("aria-pressed", "true");
    await expectNoAxeViolations(page, "/admin", {
      name: `shared-controls-${width}`,
      colorScheme: "light",
      viewport: { width, height: 900 },
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
