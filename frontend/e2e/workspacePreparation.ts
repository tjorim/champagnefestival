import { expect, type Locator, type Page } from "@playwright/test";
import { settleAnimations } from "./axe";
import en from "../messages/en.json" with { type: "json" };

/** Exercise populated preparation destinations without saving synthetic changes. */
export async function rehearsePreparation(page: Page, labels: typeof en = en, keyboard = false) {
  const activate = async (locator: Locator) => {
    if (keyboard) {
      await settleAnimations(page);
      await expect(locator).toBeVisible({ timeout: 10000 });
      await locator.focus({ timeout: 10000 });
      await expect(locator).toBeFocused({ timeout: 10000 });
      await page.keyboard.press("Enter");
    } else await locator.click();
  };
  const home = () => page.getByRole("navigation", { name: labels.workspace_title, exact: true });
  const returnHome = async () => {
    const navigation = page.getByRole("navigation", { name: labels.admin_title, exact: true });
    if (await page.evaluate(() => matchMedia("(max-width: 991px)").matches)) {
      await activate(
        page.getByRole("button", { name: labels.admin_toggle_navigation, exact: true }),
      );
    }
    await activate(navigation.getByRole("button", { name: labels.workspace_title, exact: true }));
  };
  await activate(home().getByRole("link", { name: labels.admin_people_tab, exact: true }));
  await expect(page.getByRole("row", { name: "Alice Dupont", exact: true })).toBeVisible();
  await activate(page.getByRole("tab", { name: new RegExp(`^${labels.admin_members_tab}\\s`) }));
  await activate(page.getByText(labels.workspace_reward_policy, { exact: true }));
  await expect(
    page.getByRole("button", { name: labels.stamp_add_type, exact: true }),
  ).toBeVisible();
  await returnHome();
  await activate(
    home().getByRole("link", { name: labels.admin_content_editions_section, exact: true }),
  );
  await activate(page.getByRole("button", { name: "march-2027", exact: true }));
  const products = page
    .getByRole("button", { name: new RegExp(`^${labels.admin_content_edition_manage_products} `) })
    .first();
  await expect(products).toBeVisible();
  await activate(products);
  await expect(page.getByRole("dialog")).toContainText(labels.admin_products_add);
  await page.keyboard.press("Escape");
  await returnHome();
  await activate(home().getByRole("link", { name: labels.admin_venues_rooms_tab, exact: true }));
  await expect(page.getByText("Brussels Expo", { exact: true }).first()).toBeVisible();
  await returnHome();
  await activate(home().getByRole("link", { name: labels.workspace_find_booking, exact: true }));
  await expect(page.getByText("Alice Dupont", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await returnHome();
}
