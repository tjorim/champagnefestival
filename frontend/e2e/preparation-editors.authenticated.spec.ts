import { test, expect, type Page, type Locator } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };

async function visibleAction(page: Page, action: Locator) {
  await expect(action).toBeVisible();
  const box = await action.boundingBox();
  const height = await page.evaluate(() => innerHeight);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height);
}

async function editors(page: Page) {
  await page.getByRole("link", { name: en.admin_content_editions_section, exact: true }).click();
  await page.getByRole("button", { name: en.admin_content_edition_add, exact: true }).click();
  const editionDialog = page.getByRole("dialog");
  await expect(editionDialog.getByText(en.admin_edition_id_help, { exact: true })).toBeVisible();
  await expect(editionDialog.getByText(en.admin_edition_month_help, { exact: true })).toBeVisible();
  await expect(editionDialog.getByLabel("ID", { exact: true })).toHaveAttribute("required", "");
  await editionDialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await page.getByRole("button", { name: "March 2027", exact: true }).click();
  await page
    .getByRole("button", { name: /^Edit event / })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  await visibleAction(page, save);
  await expect(dialog.getByLabel("Date", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("event.png") });
  await dialog.getByLabel("Date", { exact: true }).focus();
  // Native date inputs expose several keyboard segments before the next field.
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press("Tab");
    if (
      await dialog
        .getByLabel("Start time", { exact: true })
        .evaluate((node) => node === document.activeElement)
    )
      break;
  }
  await expect(dialog.getByLabel("Start time", { exact: true })).toBeFocused();
  const french = dialog.getByRole("tab", { name: "French", exact: true });
  await french.focus();
  await page.keyboard.press("Enter");
  await dialog
    .getByLabel("Title (French)")
    .fill("Une très longue traduction pour préparer la prochaine édition ".repeat(3));
  await dialog
    .getByLabel("Description (French)")
    .fill("Description détaillée et traduite. ".repeat(100));
  await dialog.getByRole("tab", { name: "Dutch", exact: true }).click();
  await french.click();
  await expect(dialog.getByLabel("Description (French)")).toHaveValue(
    "Description détaillée et traduite. ".repeat(100),
  );
  await visibleAction(page, save);
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page
    .getByRole("button", { name: /^Products / })
    .first()
    .click();
  await dialog.getByRole("button", { name: en.admin_products_add, exact: true }).click();
  await expect(dialog.getByLabel(en.admin_products_price, { exact: true })).toBeVisible();
  await expect(dialog.getByLabel(en.admin_inventory_stock, { exact: true })).toBeVisible();
  await visibleAction(page, dialog.getByRole("button", { name: "Save", exact: true }));
  await dialog.getByRole("tab", { name: "FR", exact: true }).click();
  await dialog.getByLabel("Name (French)").fill("Produit traduit");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByText(en.admin_products_name_required, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "NL", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: en.admin_products_add, exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Edit Product with existing bookings", exact: true })
    .click();
  await dialog
    .getByRole("checkbox", { name: en.admin_inventory_update_contents, exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: en.admin_inventory_update_prices, exact: true })
    .check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: en.admin_inventory_review, exact: true }).first(),
  ).toBeVisible();
  await expect(dialog.getByText("booking-11", { exact: true })).toBeVisible();
  const confirm = dialog.getByRole("checkbox", {
    name: en.admin_inventory_confirm_shortage,
    exact: true,
  });
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await confirm.focus();
  await page.keyboard.press("Space");
  await expect(confirm).toBeChecked();
  const checkboxBox = await confirm.boundingBox();
  const footerBox = await dialog.locator('[data-slot="dialog-footer"]').boundingBox();
  expect(checkboxBox!.y + checkboxBox!.height).toBeLessThanOrEqual(footerBox!.y);
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await visibleAction(page, dialog.getByRole("button", { name: "Save", exact: true }));
  await page.screenshot({ path: test.info().outputPath("product-review.png") });
  await dialog.getByRole("button", { name: en.admin_editor_back_product, exact: true }).click();
  await expect(
    dialog.getByRole("checkbox", { name: en.admin_inventory_update_contents, exact: true }),
  ).toBeChecked();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
}

for (const [width, height] of [
  [1280, 800],
  [1366, 768],
  [1440, 900],
]) {
  for (const zoom of [1, 1.25, 1.5]) {
    test(`preparation editors ${width}x${height} at native zoom ${zoom}`, async ({ baseURL }) => {
      test.setTimeout(90000);
      const { chromium } = await import("@playwright/test");
      const { mkdtemp, mkdir, writeFile, readFile, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const profile = await mkdtemp(join(tmpdir(), "editors-zoom-"));
      const extension = join(profile, "extension");
      await mkdir(extension);
      await writeFile(
        join(extension, "manifest.json"),
        JSON.stringify({
          manifest_version: 3,
          name: "Editor zoom test",
          version: "1.0",
          permissions: ["tabs"],
          background: { service_worker: "background.js" },
        }),
      );
      await writeFile(
        join(extension, "background.js"),
        "chrome.runtime.onInstalled.addListener(() => {});",
      );
      const state = JSON.parse(await readFile("e2e/.auth/admin.json", "utf8"));
      const context = await chromium.launchPersistentContext(profile, {
        baseURL,
        channel: "chromium",
        headless: true,
        viewport: { width, height },
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      });
      try {
        await context.addInitScript((origins) => {
          for (const origin of origins)
            if (origin.origin === location.origin)
              for (const entry of origin.localStorage)
                localStorage.setItem(entry.name, entry.value);
          localStorage.setItem("PARAGLIDE_LOCALE", "en");
          const original = window.fetch.bind(window);
          window.fetch = async (input, init) => {
            const request = new Request(input, init);
            const url = new URL(request.url, location.origin);
            if (url.pathname === "/api/products" && request.method === "GET")
              return Response.json([
                {
                  id: "review-product",
                  event_id: url.searchParams.get("event_id"),
                  name: "Product with existing bookings",
                  name_nl: "Product with existing bookings",
                  name_fr: "Produit traduit",
                  description_nl: "Een beschrijving",
                  price: 50,
                  category: "other",
                  purchasable: true,
                  required: false,
                  stock: 10,
                  unit: "table",
                  inclusions: [],
                  created_at: "",
                  updated_at: "",
                },
              ]);
            if (url.pathname === "/api/products/review-product/preview")
              return Response.json({
                preview_token: "review-token",
                price_changed: true,
                contents_changed: true,
                bookings: Array.from({ length: 12 }, (_, i) => ({
                  id: `booking-${i}`,
                  before_total: "50.00",
                  after_total: "100.00",
                  amount_paid: "60.00",
                  refund_due: "0.00",
                  before_items: [{ name: "Original package", quantity: 1 }],
                  after_items: [
                    { name: "Changed package with a long translated name", quantity: 2 },
                  ],
                })),
                shortages: [
                  {
                    product_id: "review-product",
                    name: "Tables",
                    stock: 10,
                    reserved: 12,
                    shortage: 2,
                  },
                ],
              });
            return original(input, init);
          };
        }, state.origins);
        const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        await page.goto("/admin");
        await expect(
          page.getByRole("navigation", { name: en.workspace_title, exact: true }),
        ).toBeVisible();
        await worker.evaluate(
          `new Promise(resolve => chrome.tabs.query({}, tabs => chrome.tabs.setZoom(tabs.find(tab => tab.url?.includes('/admin')).id, ${zoom}, resolve)))`,
        );
        await page.waitForFunction((factor) => Math.abs(devicePixelRatio - factor) < 0.05, zoom);
        await test.step("Exercise populated editors", () => editors(page));
      } catch (error) {
        console.log(await context.pages().at(-1)?.locator("body").innerText());
        throw error;
      } finally {
        await context.close();
        await rm(profile, { recursive: true, force: true });
      }
    });
  }
}
