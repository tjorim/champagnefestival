import { expect, test } from "@playwright/test";

test("creates a layered template, validates bindings and preserves edits through undo", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
  const content = page.getByRole("button", { name: "Content", exact: true });
  if ((await content.getAttribute("aria-expanded")) != "true") await content.click();
  await page.getByRole("button", { name: "Announcements", exact: true }).click();
  await page.getByRole("tab", { name: "Screen templates" }).click();
  const save = page.getByRole("button", { name: "Save template", exact: true });
  await page.getByLabel("Name", { exact: true }).first().fill("Festival template");
  await expect(save).toBeDisabled();
  async function select(label: string, option: string) {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  }
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
    await select("Add layer", "Placeholder");
    await select("Placeholder", binding);
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
  await page.getByRole("checkbox", { name: "Locked", exact: true }).check();
  await expect(page.getByLabel("Width (%)", { exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Locked", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Visible", exact: true }).uncheck();
  await expect(page.locator(".site-signage-stage")).not.toContainText("Welcome to the festival");
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: "Template saved." })).toBeVisible();
  await page.getByRole("button", { name: "New template", exact: true }).click();
  await page.getByRole("button", { name: "Festival template", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true }).first()).toHaveValue("Festival template");
});
