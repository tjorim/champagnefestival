import { expect, test } from "@playwright/test";

test("manages types, default selection, reward filtering and hand-out reversal", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
  await page.goto("/admin");
  await expect(page.locator("#admin.admin-authenticated")).toBeVisible();
  await page.evaluate(async () => {
    await fetch("/api/mock/stamp-cards", {
      method: "POST",
      headers: { Authorization: "Bearer mock-access-token", "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          id: "card",
          person_id: "person-01",
          box_count: 2,
          stamps: [{ id: "1" }, { id: "2" }],
          opened_at: "2026-10-01T12:00:00Z",
          completed_at: "2026-10-24T12:00:00Z",
          reward_label_nl: "Fles",
          reward: {
            id: "reward",
            reward_label_nl: "Fles",
            earned_at: "2026-10-24T12:00:00Z",
            handed_out_at: null,
          },
        },
      ]),
    });
  });
  await page.getByRole("button", { name: /^People(?:\s|\d|$)/ }).click();
  await page.getByRole("tab", { name: /^Members\s/ }).click();
  await page.getByRole("button", { name: "Add card type", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Name (nl)", { exact: true }).fill("Ruilbeurs");
  await editor.getByLabel("Reward (nl)", { exact: true }).fill("Fles");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("combobox", { name: "Type for new cards" }).click();
  await page.getByRole("option", { name: "Ruilbeurs", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Type for new cards" })).toContainText(
    "Ruilbeurs",
  );
  await page.getByRole("combobox", { name: "Reward due", exact: true }).click();
  await page.getByRole("option", { name: "Reward due", exact: true }).last().click();
  const alice = page.locator('tr[aria-label="Alice Dupont"]');
  await expect(alice.getByText("Reward due")).toBeVisible();
  await alice.getByRole("button", { name: "Stamp cards: Alice Dupont" }).click();
  await expect(page.getByText("Stamps: 2/2")).toBeVisible();
  await page.getByRole("button", { name: "Mark as handed out", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Mark as handed out", exact: true })
    .click();
  await expect(page.getByText("Handed out", { exact: true })).toBeVisible();
  await expect(alice).toHaveCount(0);
  await page.getByRole("button", { name: "Mark as not handed out", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Mark as not handed out", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByText("Reward due", { exact: true })).toBeVisible();
  await expect(alice).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit card type: Ruilbeurs" }).click();
  await page.getByRole("checkbox", { name: "Active", exact: true }).uncheck();
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText(
      "The selected type is inactive. Select an active type before checking in capsule-exchange visitors.",
    ),
  ).toBeVisible();
});
