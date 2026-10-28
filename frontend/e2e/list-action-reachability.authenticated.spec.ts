import { test, expect } from "@playwright/test";

for (const width of [390, 1024, 1366]) {
  test(`People, Members and Volunteers keep routine actions visible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 768 });
    await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
    await page.goto("/admin?section=registrations");
    await expect(page.getByText("alice@moet.com").first()).toBeVisible();
    if (width < 992)
      await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    await page.getByRole("button", { name: /^People(?:\s|\d|$)/ }).click();
    await page.keyboard.press("Escape");
    for (const name of ["All people", "Members", "Volunteers"]) {
      await page.getByRole("tab", { name: new RegExp(`^${name}\\s`) }).click();
      if (width >= 1024) {
        if (name === "Members") {
          await expect(
            page.getByRole("columnheader", { name: "Phone Number", exact: true }),
          ).toHaveCount(0);
          await expect(page.getByRole("columnheader", { name: "Notes", exact: true })).toHaveCount(
            0,
          );
        }
        if (name === "Volunteers") {
          await expect(
            page.getByRole("columnheader", { name: "National register number", exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByRole("columnheader", { name: "eID document number", exact: true }),
          ).toHaveCount(0);
        }
      }
      const edit = page.getByRole("button", { name: /^Edit/ }).first();
      await expect(edit).toBeVisible();
      await expect
        .poll(async () => {
          const box = await edit.boundingBox();
          return box !== null && box.x >= 0 && box.x + box.width <= width;
        })
        .toBe(true);
      await edit.focus();
      await expect(edit).toBeFocused();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
  });
}
