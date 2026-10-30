import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleAnimations } from "./axe";

test("edits channels and playlists, previews drafts and supports accessible reordering", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
  // Seed an existing template through the same authenticated API used by its editor.
  await page.evaluate(async () => {
    const response = await fetch("/api/signage/templates", {
      method: "POST",
      headers: { Authorization: "Bearer mock-access-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Playlist template",
        background: { kind: "color", color: "#000000", end_color: "#000000", image: null },
        layers: ["logo", "name", "sponsor", "title", "text"].map((binding) => ({
          id: binding,
          kind: "binding",
          binding,
          visible: true,
          x: 10,
          y: binding === "text" ? 50 : 10,
          width: 80,
          height: 30,
          rotation: 0,
          color: "#ffffff",
          font_size: 48,
        })),
      }),
    });
    if (!response.ok) throw new Error("Template seed failed");
  });
  const content = page.getByRole("button", { name: "Content", exact: true });
  if ((await content.getAttribute("aria-expanded")) !== "true") await content.click();
  await page.getByRole("button", { name: "Screen channels", exact: true }).click();
  async function select(label: string, option: string) {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  }
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add channel", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add channel", exact: true })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Hall five");
  await page.getByLabel("Public link name").fill("hall-five");
  await page.getByRole("combobox", { name: "Edition", exact: true }).click();
  await page.getByRole("option").filter({ hasText: "2027" }).first().click();
  await page.getByRole("button", { name: "Save channel", exact: true }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "/signage/hall-five", exact: true })).toHaveAttribute(
    "href",
    "/signage/hall-five",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Hall five", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit Hall five", exact: true })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Unsaved name");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "Discard changes?", exact: true })
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit Hall five", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Hall five");
  const update = page.waitForRequest(
    (request) => request.url().includes("/api/signage/channels/") && request.method() === "PUT",
  );
  await page.getByRole("button", { name: "Save channel", exact: true }).click();
  await update;
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const group of ["Producer", "Vendor", "Sponsor"]) {
    await page.getByRole("button", { name: "Add slide", exact: true }).click();
    await select("Organisation group", group);
    await select("Template", "Playlist template");
    await page.getByLabel("Duration per slide (seconds)").fill("7");
    await page.getByRole("button", { name: "Save slide", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Move " + group + " up", exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Add slide", exact: true }).click();
  await select("Type", "Notice");
  await select("Template", "Playlist template");
  await page.getByLabel("Text", { exact: true }).fill("Geen honden / No dogs allowed");
  await page.getByLabel("Title", { exact: true }).fill("Opgelet");
  const draftResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/signage/preview") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Preview playlist", exact: true }).click();
  const projected = await (await draftResponse).json();
  expect(
    projected.slides.some(
      (slide: { kind: string; title?: string; text?: string }) =>
        slide.kind === "notice" &&
        slide.title === "Opgelet" &&
        slide.text === "Geen honden / No dogs allowed",
    ),
  ).toBe(true);
  await expect(
    page.getByRole("status").filter({ hasText: /slides · .* seconds total/ }),
  ).toBeVisible();
  // The draft remains editable and is not in the saved playlist yet.
  await expect(page.getByRole("button", { name: "Move Opgelet up" })).toHaveCount(0);
  await page.getByRole("button", { name: "Save slide", exact: true }).click();
  await page.getByRole("button", { name: "Move Opgelet up", exact: true }).click();
  const notice = page.getByRole("button", { name: "Opgelet", exact: true });
  await expect(notice).toBeVisible();
  await notice.click();
  await page.getByRole("checkbox", { name: "Slide active", exact: true }).uncheck();
  const hiddenResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/signage/preview") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Preview playlist", exact: true }).click();
  expect(
    (await (await hiddenResponse).json()).slides.some(
      (slide: { kind: string }) => slide.kind === "notice",
    ),
  ).toBe(false);
  await page.getByRole("checkbox", { name: "Slide active", exact: true }).check();
  await page.getByLabel("Starts at (local time)").fill("2099-01-01T12:00");
  const scheduledResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/signage/preview") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Preview playlist", exact: true }).click();
  expect(
    (await (await scheduledResponse).json()).slides.some(
      (slide: { kind: string }) => slide.kind === "notice",
    ),
  ).toBe(false);
  // Scanning mid-transition reads blended colours (a 2.2:1 contrast failure under load).
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).include('[data-slot="dialog-content"]').analyze();
  expect(results.violations).toEqual([]);
  // Reopen the saved row: unsaved schedule and active edits never overwrite it.
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "Discard changes?", exact: true })
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await notice.click();
  await expect(page.getByLabel("Starts at (local time)")).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: "Slide active", exact: true })).toBeChecked();
});
