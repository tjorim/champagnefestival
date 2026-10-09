import { expect, test, type Page } from "@playwright/test";

const LEGACY_FORM_CLASSES =
  ".form-control, .form-select, .form-check, .form-label, .form-text, .invalid-feedback, .input-group";

async function expectNoOverflow(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
}

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage", "millesime"]) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      test(`${theme} public forms at ${width}px (${colorScheme})`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.clock.setFixedTime(new Date("2027-02-01T12:00:00Z"));
        await page.addInitScript((selected) => {
          localStorage.setItem("champagnefestival:visualTheme", selected);
          localStorage.setItem("PARAGLIDE_LOCALE", "en");
        }, theme);
        const attach = async (name: string) => {
          const path = testInfo.outputPath(`${name}.png`);
          await page.screenshot({ path });
          await testInfo.attach(name, { path, contentType: "image/png" });
        };

        // Contact form: labels, required marker and association of the error.
        await page.goto("/");
        const contact = page.locator("#contact");
        await contact.scrollIntoViewIfNeeded();
        await contact.getByRole("button", { name: "Send Message" }).click();
        const contactName = contact.getByRole("textbox", { name: "Your Name" });
        await expect(contactName).toHaveAttribute("aria-invalid", "true");
        await expect(contactName).toHaveAccessibleDescription(/Name is required/);
        await expect(contact.locator(LEGACY_FORM_CLASSES)).toHaveCount(0);
        await expectNoOverflow(page, width);
        await attach("contact");

        // Registration dialog: a real pointer click selects through the themed
        // popup portal, which must stack above the dialog backdrop.
        await page
          .locator("#registrations")
          .getByRole("button", { name: /register now/i })
          .click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: /submit registration/i }).click();
        await expect(dialog.getByRole("alert").first()).toContainText("is required");
        const language = dialog.getByRole("combobox", {
          name: "Preferred communication language",
        });
        await language.focus();
        await language.press("ArrowDown");
        const listbox = page.getByRole("listbox");
        await expect(listbox).toBeVisible();
        expect(
          await listbox.evaluate((el) => el.closest('[data-theme-scope="admin"]') === null),
        ).toBe(true);
        await page.getByRole("option", { name: "Français", exact: true }).click();
        await expect(language).toContainText("Français");
        await expect(language).toBeFocused();
        const marketing = dialog.getByRole("checkbox", { name: /informed about future/i });
        await marketing.focus();
        await marketing.press("Space");
        await expect(marketing).toBeChecked();
        await expect(dialog.locator(LEGACY_FORM_CLASSES)).toHaveCount(0);
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await attach("registration-dialog");
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);

        // Passwordless self-service request form.
        await page.goto("/me");
        const email = page.getByRole("textbox", { name: "Email address" });
        await expect(email).toBeVisible();
        await expect(page.locator(LEGACY_FORM_CLASSES)).toHaveCount(0);
        await expectNoOverflow(page, width);
        await attach("my-registrations");

        // Standalone check-in manual search.
        await page.goto("/check-in");
        const search = page.getByRole("searchbox", { name: "Guest name or email" });
        await expect(search).toBeVisible();
        await expect(page.locator(LEGACY_FORM_CLASSES)).toHaveCount(0);
        await expectNoOverflow(page, width);
        await attach("check-in");
      });
    }
  }
}
