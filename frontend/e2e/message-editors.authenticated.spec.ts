import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const kind of ["announcements", "composer"] as const) {
  for (const width of [1366, 390]) {
    test(`${kind} uses guarded create/edit dialogs at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      // Isolate record writes from the shared demo data, including the public announcement feed.
      await page.addInitScript(() => {
        const original = window.fetch.bind(window);
        const records: Record<string, Record<string, unknown>[]> = {
          "/api/announcements": [],
          "/api/composer": [],
        };
        window.fetch = async (input, init) => {
          const request = new Request(input, init);
          const url = new URL(request.url, location.origin);
          const collection = Object.keys(records).find(
            (path) => url.pathname === path || url.pathname.startsWith(`${path}/`),
          );
          if (!collection || url.pathname.endsWith("/active")) return original(input, init);
          const items = records[collection]!;
          if (request.method === "GET") return Response.json(items);
          const body = (await request.json()) as Record<string, unknown>;
          const writes = JSON.parse(localStorage.getItem("message-editor-writes") ?? "[]");
          writes.push({ path: url.pathname, method: request.method, body });
          localStorage.setItem("message-editor-writes", JSON.stringify(writes));
          const id =
            url.pathname === collection
              ? `message-${items.length + 1}`
              : url.pathname.split("/").at(-1)!;
          const record = {
            id,
            sort_order: items.length,
            state: "draft",
            estimated_push_audience: 0,
            ...body,
          };
          if (request.method === "POST") items.push(record);
          else records[collection] = items.map((item) => (item.id === id ? record : item));
          return Response.json(record, { status: request.method === "POST" ? 201 : 200 });
        };
      });
      await page.goto("/admin");
      await expect(page.locator("section#admin.admin-authenticated")).toBeVisible();
      if (width < 768)
        await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
      const content = page.getByRole("button", { name: "Content", exact: true });
      if ((await content.getAttribute("aria-expanded")) !== "true") await content.click();
      await page.getByRole("button", { name: "Announcements", exact: true }).click();
      if (kind === "composer")
        await page.getByRole("tab", { name: "Compose & send", exact: true }).click();
      const newLabel = kind === "composer" ? "New message draft" : "New announcement";
      const editLabel = kind === "composer" ? "Edit message draft" : "Edit announcement";
      const fieldLabel = kind === "composer" ? "Title" : "Text (NL)";
      const createLabel = kind === "composer" ? "Create draft" : "Create";
      const newButton = page.getByRole("button", { name: newLabel, exact: true });
      await expect(page.getByLabel(fieldLabel, { exact: true })).toHaveCount(0);
      await newButton.click();
      const dialog = page.getByRole("dialog", { name: newLabel, exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel(fieldLabel, { exact: true }).fill("Doors open at six");
      if (kind === "composer")
        await dialog.getByLabel("Body", { exact: true }).fill("Please arrive on time.");
      const audit = await new AxeBuilder({ page })
        .include('[data-slot="dialog-content"]')
        .analyze();
      expect(audit.violations).toEqual([]);
      await dialog.screenshot({ path: testInfo.outputPath("create-dialog.png") });
      await dialog.getByRole("button", { name: createLabel, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(newButton).toBeFocused();
      expect(
        await page.evaluate(() =>
          JSON.parse(localStorage.getItem("message-editor-writes") ?? "[]"),
        ),
      ).toMatchObject([{ path: `/api/${kind}`, method: "POST" }]);
      const row = page.getByRole("row").filter({ hasText: "Doors open at six" });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      const editing = page.getByRole("dialog", { name: editLabel, exact: true });
      const field = editing.getByLabel(fieldLabel, { exact: true });
      await expect(field).toHaveValue("Doors open at six");
      await field.fill("Unsaved change");
      await page.keyboard.press("Escape");
      const discard = page.getByRole("alertdialog", { name: "Discard changes?", exact: true });
      await expect(discard).toBeVisible();
      await discard.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(field).toHaveValue("Unsaved change");
      await editing.getByRole("button", { name: "Close", exact: true }).click();
      await discard.getByRole("button", { name: "Discard", exact: true }).click();
      await expect(editing).toHaveCount(0);
      await expect(row.getByRole("button", { name: "Edit", exact: true })).toBeFocused();
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(field).toHaveValue("Doors open at six");
      await field.fill("Doors open at seven");
      if (kind === "composer") {
        await editing.getByRole("button", { name: "EN", exact: true }).click();
        await editing.getByLabel("Title", { exact: true }).fill("English title");
        await editing.getByLabel("Body", { exact: true }).fill("English body");
        await editing.getByRole("button", { name: "NL", exact: true }).click();
        await expect(field).toHaveValue("Doors open at seven");
      } else {
        await editing.getByLabel("Starts (local time)", { exact: true }).fill("2026-10-20T17:30");
      }
      await editing.getByRole("button", { name: "Save", exact: true }).click();
      await expect(editing).toHaveCount(0);
      const writes = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("message-editor-writes") ?? "[]"),
      );
      expect(writes).toHaveLength(2);
      expect(writes[1]).toMatchObject({ path: `/api/${kind}/message-1`, method: "PUT" });
      const update = writes[1].body;
      if (kind === "composer")
        expect(update).toMatchObject({ title_en: "English title", body_en: "English body" });
      else expect(update.starts_at).toBeTruthy();
      await expect(editing).toHaveCount(0);
      const updatedRow = page.getByRole("row").filter({ hasText: "Doors open at seven" });
      await expect(updatedRow).toBeVisible();
      await expect(updatedRow.getByRole("button", { name: "Edit", exact: true })).toBeFocused();
      await newButton.click();
      await expect(dialog.getByLabel(fieldLabel, { exact: true })).toHaveValue("");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await newButton.click();
      await dialog.getByLabel(fieldLabel, { exact: true }).fill("Discard this draft");
      // The viewport margin is outside the dialog at both tested widths.
      await page.mouse.click(2, 2);
      await expect(discard).toBeVisible();
      await discard.getByRole("button", { name: "Discard", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(
        await page.evaluate(() =>
          JSON.parse(localStorage.getItem("message-editor-writes") ?? "[]"),
        ),
      ).toHaveLength(2);
    });
  }
}
