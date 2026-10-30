import { expect, test, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleAnimations } from "./axe";
import en from "../messages/en.json" with { type: "json" };

// The editor chrome is the only translated part of this flow (the notice text is typed once and
// shown as written), so English at a wide and a narrow viewport covers it.
const locale = "en";
const t = en;
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`first notice keeps its draft through template creation at ${viewport.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(10_000);
    await page.setViewportSize(viewport);
    await page.addInitScript((locale) => localStorage.setItem("PARAGLIDE_LOCALE", locale), locale);
    await page.goto("/admin?section=signage-channels&signageTab=channels");
    async function activate(control: Locator) {
      await expect(control).toBeEnabled();
      await control.focus();
      await expect(control).toBeFocused();
      await page.keyboard.press("Enter");
      await settleAnimations(page);
    }
    async function select(label: string, option: string) {
      await activate(page.getByRole("combobox", { name: label, exact: true }));
      await page.getByRole("option", { name: option, exact: true }).focus();
      await page.keyboard.press("Enter");
      await settleAnimations(page);
    }
    await activate(page.getByRole("button", { name: t.signage_channels_new, exact: true }));
    await page.getByLabel(t.signage_editor_name, { exact: true }).focus();
    await page.keyboard.type("First screen");
    await page.getByLabel(t.signage_channels_slug, { exact: true }).focus();
    await page.keyboard.type("first-screen");
    await expect(
      page.getByRole("button", { name: t.signage_channels_save, exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText(t.signage_channel_requirements, { exact: false }).first(),
    ).toBeVisible();
    await activate(page.getByRole("combobox", { name: t.signage_channels_edition, exact: true }));
    await page.getByRole("option").filter({ hasText: "2027" }).first().focus();
    await page.keyboard.press("Enter");
    await activate(page.getByRole("button", { name: t.signage_channels_save, exact: true }));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const channelUrl = page.url();
    await activate(page.getByRole("button", { name: t.signage_channels_add, exact: true }));
    await select(t.signage_editor_kind, t.signage_editor_notice);
    await page.getByLabel(t.signage_editor_title, { exact: true }).focus();
    await page.keyboard.type("First notice");
    await page.getByLabel(t.signage_editor_text, { exact: true }).focus();
    await page.keyboard.type("Welcome, everyone!");
    await activate(page.getByRole("button", { name: t.signage_create_template_here, exact: true }));
    let template = page.getByRole("dialog", { name: t.signage_editor_new, exact: true });
    await expect(template.locator(".site-signage-stage")).toContainText(t.signage_sample_title);
    await expect(template.getByText(t.signage_editor_no_samples, { exact: false })).toBeVisible();
    await expect(
      template.getByRole("button", { name: t.signage_editor_save, exact: true }),
    ).toBeDisabled();
    await activate(
      template
        .locator('[data-slot="dialog-footer"]')
        .getByRole("button", { name: t.admin_action_cancel, exact: true }),
    );
    await expect(page.getByLabel(t.signage_editor_text, { exact: true })).toHaveValue(
      "Welcome, everyone!",
    );
    await activate(page.getByRole("button", { name: t.signage_create_template_here, exact: true }));
    template = page.getByRole("dialog", { name: t.signage_editor_new, exact: true });
    await template.getByLabel(t.signage_editor_name, { exact: true }).focus();
    await page.keyboard.type("First notice template");
    await activate(template.getByRole("button", { name: t.signage_editor_save, exact: true }));
    await expect(template).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: t.signage_channels_template, exact: true }),
    ).toContainText("First notice template");
    await expect(page.getByLabel(t.signage_editor_text, { exact: true })).toHaveValue(
      "Welcome, everyone!",
    );
    await activate(page.getByRole("button", { name: t.signage_channels_preview, exact: true }));
    await expect(page.locator(".site-signage-stage")).toContainText("Welcome, everyone!");
    await expect(page.getByText(t.signage_channels_preview_help, { exact: false })).toBeVisible();
    await settleAnimations(page);
    const audit = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(audit.violations).toEqual([]);
    await activate(page.getByRole("button", { name: t.signage_channels_save_slide, exact: true }));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(page.url()).toBe(channelUrl);
    await activate(page.getByRole("tab", { name: t.signage_tab_templates, exact: true }));
    await activate(page.getByRole("tab", { name: t.signage_tab_channels, exact: true }));
    await expect(page.getByRole("button", { name: "First notice", exact: true })).toBeVisible();
    await activate(
      page.getByRole("button", {
        name: t.admin_edit_item.replace("{name}", "First screen"),
        exact: true,
      }),
    );
    await expect(
      page.getByRole("checkbox", { name: t.signage_channels_active, exact: true }),
    ).not.toBeChecked();
  });
}
