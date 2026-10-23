import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
  await page.goto("/admin");
  await expect(page.locator("#admin.admin-authenticated")).toBeVisible();
});

const TAB_LABEL = {
  Members: "Members",
  Volunteers: "Volunteers",
  People: "All people",
} as const;

for (const screen of ["Members", "Volunteers", "People"] as const) {
  test(`${screen} uses server pages and preserves filters after editing`, async ({ page }) => {
    await page.getByRole("button", { name: /^People(?:\s|\d|$)/ }).click();
    await page.getByRole("tab", { name: new RegExp(`^${TAB_LABEL[screen]}\\s`) }).click();
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

for (const width of [1366, 390]) {
  test(`both volunteer creation paths accept missing identity and help periods at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width < 768)
      await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    await page.getByRole("button", { name: /^People(?:\s|\d|$)/ }).click();
    const volunteers = page.getByRole("tab", { name: /^Volunteers\s/ });
    await volunteers.click();
    await page.getByRole("button", { name: "Add volunteer", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("Identity details and help periods are optional and can be added later."),
    ).toBeVisible();
    const name = `Name-only volunteer ${width}`;
    await dialog.getByLabel(/^Name/).fill(name);
    await expect(dialog.getByLabel("National register number")).not.toHaveAttribute("required", "");
    await expect(dialog.getByLabel("eID document number")).not.toHaveAttribute("required", "");
    await expect(dialog.getByLabel("First help day", { exact: false })).toHaveCount(0);
    const created = page.waitForRequest(
      (request) => request.url().endsWith("/api/volunteers") && request.method() === "POST",
    );
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    expect((await created).postDataJSON()).toMatchObject({
      name,
      national_register_number: null,
      eid_document_number: null,
      help_periods: [],
    });
    await expect(dialog).toHaveCount(0);
    const search = page.getByRole("textbox", { name: "Search by name, email, phone…" });
    await search.fill(name);
    async function editVolunteer(label: string) {
      await page
        .getByRole("button", {
          name: `Edit volunteer: ${label}`,
          exact: true,
        })
        .click();
      await expect(dialog).toBeVisible();
    }
    await editVolunteer(name);
    await dialog.getByRole("button", { name: "Add help period", exact: true }).click();
    await dialog.getByLabel("First help day", { exact: false }).fill("2026-10-19");
    const addPeriod = page.waitForRequest(
      (request) => request.url().includes("/api/volunteers/") && request.method() === "PUT",
    );
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    expect((await addPeriod).postDataJSON().help_periods).toEqual([
      { first_help_day: "2026-10-19", last_help_day: null, notes: "" },
    ]);
    await expect(dialog).toHaveCount(0);
    await editVolunteer(name);
    await dialog.getByRole("button", { name: "Remove period", exact: true }).click();
    const clearPeriods = page.waitForRequest(
      (request) => request.url().includes("/api/volunteers/") && request.method() === "PUT",
    );
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    expect((await clearPeriods).postDataJSON().help_periods).toEqual([]);
    await expect(dialog).toHaveCount(0);
    await page.getByRole("tab", { name: /^All people\s/ }).click();
    await page.getByRole("button", { name: "Add person", exact: true }).click();
    const personName = `Volunteer via People ${width}`;
    await dialog.getByLabel(/^Name/).fill(personName);
    await dialog.getByRole("button", { name: "Volunteer", exact: true }).click();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await volunteers.click();
    await search.fill(personName);
    await editVolunteer(personName);
    await expect(dialog.getByLabel("First help day", { exact: false })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}
