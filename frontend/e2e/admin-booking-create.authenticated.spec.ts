import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
  await page.goto("/admin");
  await expect(page.locator("#admin.admin-authenticated")).toBeVisible();
  await page.getByRole("button", { name: /^Registrations(?:\s|\d|$)/ }).click();
  // The toolbar sits partly under the fixed header at this size (list layout: #1427), so a
  // pointer click is intercepted; activate the button directly.
  await page.getByRole("button", { name: "Add registration" }).dispatchEvent("click");
  await expect(page.getByRole("dialog")).toBeVisible();
});

async function chooseEvent(page: Page, title: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /^Event/ }).click();
  await page.getByRole("option", { name: new RegExp(title) }).click();
}

async function choosePerson(page: Page, query: string, name: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Person" }).fill(query);
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

test("books two required tickets, shows the total and continues to payment and seating", async ({
  page,
}) => {
  const dialog = page.getByRole("dialog");
  await chooseEvent(page, "Tasting Day 2");
  await choosePerson(page, "Alice", "Alice Dupont");
  await dialog.getByRole("spinbutton", { name: /^Guests/ }).fill("2");

  await expect(dialog.getByRole("spinbutton", { name: /Entry ticket/ })).toHaveValue("2");
  await expect(dialog.locator("p", { hasText: "Total to pay:" })).toContainText("€30.00");

  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  await expect(dialog.getByText("Booking created").first()).toBeVisible();
  await expect(dialog.getByText(/Total €30\.00/)).toBeVisible();
  await dialog.getByRole("button", { name: "Record payment and seat guests" }).click();
  await expect(page.getByRole("dialog").getByText("Alice Dupont").first()).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: /Purchased quantity Entry ticket/ }),
  ).toHaveValue("2");

  // A new seating row starts with the guests still to seat, not a single guest.
  await page.getByRole("button", { name: "Add table", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Guests", exact: true }).last()).toHaveValue(
    "2",
  );
});

test("asks for confirmation before creating a booking without the required ticket", async ({
  page,
}) => {
  const dialog = page.getByRole("dialog");
  await chooseEvent(page, "Tasting Day 2");
  await choosePerson(page, "Alice", "Alice Dupont");
  await dialog.getByRole("spinbutton", { name: /Entry ticket/ }).fill("0");

  await expect(dialog.getByText(/No required product is selected/)).toBeVisible();
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    dialog.getByText("Confirm that this booking is complimentary", { exact: false }),
  ).toBeVisible();
  await expect(dialog.getByText("Booking created")).toHaveCount(0);

  await dialog.getByRole("checkbox", { name: /Create without products/ }).check();
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog.getByText(/Total €0\.00/)).toBeVisible();
});

test("names every missing field when the form is submitted incomplete", async ({ page }) => {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  await expect(
    dialog.getByText("Complete the marked fields before creating the booking."),
  ).toBeVisible();
  await expect(dialog.getByText("Choose an event.")).toBeVisible();
  await expect(dialog.getByText("Choose a person, or add a new one.")).toBeVisible();
});

test("adds a person who is not in People without losing the booking draft", async ({ page }) => {
  const dialog = page.getByRole("dialog");
  await chooseEvent(page, "Tasting Day 2");
  await dialog.getByRole("textbox", { name: "Notes" }).fill("Phone booking");

  await dialog.getByRole("combobox", { name: "Person" }).fill("Zoë Nieuwkomer");
  await page.getByRole("button", { name: /Add “Zoë Nieuwkomer” as a new person/ }).click();
  await dialog.getByRole("textbox", { name: "Email" }).fill("zoe@example.com");
  await dialog.getByRole("button", { name: "Add and select" }).click();

  await expect(dialog.getByRole("combobox", { name: "Person" })).toHaveValue("Zoë Nieuwkomer");
  await expect(dialog.getByRole("textbox", { name: "Notes" })).toHaveValue("Phone booking");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog.getByText("Booking created").first()).toBeVisible();
});
