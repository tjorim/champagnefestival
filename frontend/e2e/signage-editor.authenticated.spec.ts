import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleAnimations } from "./axe";

test("creates a layered template, validates bindings and preserves edits through undo", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
  const content = page.getByRole("button", { name: "Content", exact: true });
  if ((await content.getAttribute("aria-expanded")) != "true") await content.click();
  await page.getByRole("button", { name: "Screen channels", exact: true }).click();
  await page.getByRole("tab", { name: "Templates" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add template", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add template", exact: true })).toBeVisible();
  const save = page.getByRole("button", { name: "Save template", exact: true });
  await page.getByLabel("Name", { exact: true }).first().fill("Festival template");
  await expect(save).toBeDisabled();
  async function select(label: string, option: string) {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  }
  await page.getByText("Background", { exact: true }).click();
  await select("Type", "Gradient");
  await page.getByLabel("Colour", { exact: true }).first().fill("#123456");
  await expect(page.locator(".site-signage-stage")).toHaveCSS(
    "background-image",
    /linear-gradient/,
  );
  await select("Preview slide type", "Image");
  await expect(
    page.getByText("No existing sample content for this type. Add content to preview its data."),
  ).toBeVisible();
  await select("Preview slide type", "Producers and sponsors");
  for (const binding of ["Logo", "Name", "Sponsor"]) {
    await select("Add layer", `${binding} placeholder`);
  }
  await expect(save).toBeEnabled();
  await expect(page.locator(".site-signage-stage")).toContainText("Maison Moët & Chandon");
  await select("Add layer", "Text");
  await page.getByLabel("Text", { exact: true }).fill("Welcome to the festival");
  await expect(page.locator(".site-signage-stage")).toContainText("Welcome to the festival");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".site-signage-stage")).not.toContainText("Welcome to the festival");
  const selectedHit = page.locator('.site-signage-editor-hit[aria-pressed="true"]');
  await selectedHit.click();
  await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeEnabled();
  // Returning to the starting coordinates is also a no-op, even after pointer moves.
  const originalBounds = await selectedHit.boundingBox();
  if (!originalBounds) throw new Error("Selected layer is not visible");
  const origin = {
    x: originalBounds.x + originalBounds.width / 2,
    y: originalBounds.y + originalBounds.height / 2,
  };
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(origin.x + 20, origin.y + 10);
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".site-signage-stage")).toContainText("Welcome to the festival");
  const hit = page.locator('.site-signage-editor-hit[aria-pressed="true"]');
  await hit.scrollIntoViewIfNeeded();
  const bounds = await hit.boundingBox();
  if (!bounds) throw new Error("Selected layer is not visible");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 30, bounds.y + bounds.height / 2 + 15);
  await page.mouse.up();
  await expect(page.getByLabel("X (%)", { exact: true })).not.toHaveValue("10");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("X (%)", { exact: true })).toHaveValue("10");
  await page.locator('.site-signage-editor-hit[aria-pressed="true"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("X (%)", { exact: true })).toHaveValue("11");
  await page.getByRole("spinbutton", { name: "Rotation (degrees)", exact: true }).fill("25");
  await expect(page.locator(".site-signage-stage").getByText("Welcome to the festival")).toHaveCSS(
    "transform",
    /matrix/,
  );
  await page.getByRole("button", { name: "Locked: Welcome to the festival", exact: true }).click();
  await expect(page.getByLabel("Width (%)", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Locked: Welcome to the festival", exact: true }).click();
  await page.getByRole("button", { name: "Visible: Welcome to the festival", exact: true }).click();
  await expect(page.locator(".site-signage-stage")).not.toContainText("Welcome to the festival");
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: "Template saved." })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Festival template", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit Festival template", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true }).first()).toHaveValue("Festival template");
  await page.getByLabel("Name", { exact: true }).first().fill("Unsaved template name");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("alertdialog", { name: "Discard changes?", exact: true });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true }).first()).toHaveValue(
    "Unsaved template name",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await discard.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Festival template", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true }).first()).toHaveValue("Festival template");
  await page.getByLabel("Name", { exact: true }).first().fill("Updated template");
  const update = page.waitForRequest(
    (request) => request.url().includes("/api/signage/templates/") && request.method() === "PUT",
  );
  await save.click();
  await update;
  await expect(
    page.getByRole("button", { name: "Edit Updated template", exact: true }),
  ).toBeVisible();
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`manages layer order, visibility and contextual properties at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/admin");
    await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
    if (viewport.width < 768)
      await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    const content = page.getByRole("button", { name: "Content", exact: true });
    if ((await content.getAttribute("aria-expanded")) !== "true") await content.click();
    await page.getByRole("button", { name: "Screen channels", exact: true }).click();
    const navigation = page.getByRole("tablist", { name: "Screen channels", exact: true });
    const channelsTab = navigation.getByRole("tab", { name: "Channels", exact: true });
    const templatesTab = navigation.getByRole("tab", { name: "Templates", exact: true });
    await channelsTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(templatesTab).toBeFocused();
    await expect(templatesTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Templates", exact: true })).toBeVisible();
    await page.keyboard.press("Home");
    await expect(channelsTab).toBeFocused();
    await expect(channelsTab).toHaveAttribute("aria-selected", "true");
    await templatesTab.click();
    expect(await navigation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    const navigationAudit = await new AxeBuilder({ page }).include('[role="tablist"]').analyze();
    expect(navigationAudit.violations).toEqual([]);
    await page.getByRole("button", { name: "Add template", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add template", exact: true });
    const list = dialog.getByRole("list", { name: "Layers (front to back)", exact: true });
    const rows = list.locator(":scope > li");
    const properties = dialog.getByRole("region", { name: "Layer properties" });
    const save = dialog.getByRole("button", { name: "Save template", exact: true });
    const writes: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/api/signage/templates") &&
        ["POST", "PUT"].includes(request.method())
      )
        writes.push(request.method());
    });
    await dialog.getByLabel("Name", { exact: true }).fill("Layer controls");
    await dialog.getByRole("button", { name: "Add missing placeholders", exact: true }).click();
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).getByRole("button", { name: "Sponsor", exact: true })).toBeVisible();
    await expect(rows.nth(2).getByRole("button", { name: "Logo", exact: true })).toBeVisible();
    await expect(save).toBeEnabled();
    await list.getByRole("button", { name: "Logo", exact: true }).click();
    await expect(
      properties.getByRole("combobox", { name: "Image fit", exact: true }),
    ).toBeVisible();
    await expect(properties.getByLabel("Font size", { exact: true })).toHaveCount(0);
    await expect(properties.getByLabel("Text", { exact: true })).toHaveCount(0);
    await list.getByRole("button", { name: "Name", exact: true }).click();
    await expect(properties.getByLabel("Font size", { exact: true })).toBeVisible();
    await expect(properties.getByRole("combobox", { name: "Image fit", exact: true })).toHaveCount(
      0,
    );
    const visible = list.getByRole("button", { name: "Visible: Name", exact: true });
    await visible.click();
    await expect(save).toBeDisabled();
    await dialog.getByRole("button", { name: "Add missing placeholders", exact: true }).click();
    await expect(rows).toHaveCount(3);
    await expect(visible).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(visible).toHaveAttribute("aria-pressed", "false");
    await dialog.getByRole("button", { name: "Redo", exact: true }).click();
    await list.getByRole("button", { name: "Locked: Name", exact: true }).click();
    await expect(properties.getByLabel("Width (%)", { exact: true })).toBeDisabled();
    await expect(visible).toBeDisabled();
    await expect(
      list.getByRole("button", { name: "Move Name forwards", exact: true }),
    ).toBeDisabled();
    await list.getByRole("button", { name: "Locked: Name", exact: true }).click();
    const forward = list.getByRole("button", { name: "Move Logo forwards", exact: true });
    await forward.focus();
    await page.keyboard.press("Space");
    await expect(rows.nth(1).getByRole("button", { name: "Logo", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(rows.nth(2).getByRole("button", { name: "Logo", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Redo", exact: true }).click();
    // Exercise the actual pointer sensor, including the front-to-back index conversion.
    await list.scrollIntoViewIfNeeded();
    const handle = list.getByRole("button", { name: "Reorder Sponsor", exact: true });
    await handle.scrollIntoViewIfNeeded();
    const source = await handle.boundingBox();
    const target = await rows.nth(2).boundingBox();
    if (!source || !target) throw new Error("Layer drag targets are not visible");
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 + 12, {
      steps: 5,
    });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height - 8, { steps: 20 });
    await page.mouse.up();
    await expect(rows.nth(2).getByRole("button", { name: "Sponsor", exact: true })).toBeVisible();
    // Direct placeholder creation selects the correct binding in one step.
    await dialog.getByRole("combobox", { name: "Add layer", exact: true }).click();
    await page.getByRole("option", { name: "Title placeholder", exact: true }).click();
    await expect(
      properties.getByRole("combobox", { name: "Placeholder", exact: true }),
    ).toContainText("Title");
    await dialog.getByRole("button", { name: "Remove layer", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Add layer", exact: true }).click();
    await page.getByRole("option", { name: "Image", exact: true }).click();
    await expect(properties.getByLabel("Upload image", { exact: true })).toBeVisible();
    await expect(properties.getByLabel("Font size", { exact: true })).toHaveCount(0);
    await expect(properties.getByLabel("Text", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Remove layer", exact: true }).click();
    await list.getByRole("button", { name: "Name", exact: true }).click();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await settleAnimations(page);
    const audit = await new AxeBuilder({ page }).include('[data-slot="dialog-content"]').analyze();
    expect(audit.violations).toEqual([]);
    expect(writes).toEqual([]);
    const request = page.waitForRequest(
      (request) => request.url().includes("/api/signage/templates") && request.method() === "POST",
    );
    await save.click();
    const payload = (await request).postDataJSON();
    expect(payload.layers.map((layer: { binding: string }) => layer.binding)).toEqual([
      "sponsor",
      "name",
      "logo",
    ]);
    expect(
      payload.layers.every(
        (layer: { visible: boolean; locked: boolean }) => layer.visible && !layer.locked,
      ),
    ).toBe(true);
    expect(writes).toEqual(["POST"]);
    await expect(dialog).toHaveCount(0);
  });
}
