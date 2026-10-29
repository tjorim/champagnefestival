import { test, expect } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };

for (const [width, height, zoom] of [
  [1280, 800, 1],
  [1366, 768, 1],
  [1440, 900, 1],
  [1280, 800, 1.25],
  [1366, 768, 1.25],
  [1440, 900, 1.25],
  [1280, 800, 1.5],
  [1366, 768, 1.5],
  [1440, 900, 1.5],
  [853, 512, 1],
  [390, 844, 1],
]) {
  test(`floor-plan inspector ${width}x${height} at native zoom ${zoom}`, async ({ baseURL }) => {
    const { chromium } = await import("@playwright/test");
    const { mkdtemp, mkdir, writeFile, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const profile = await mkdtemp(join(tmpdir(), "plan-zoom-"));
    const extension = join(profile, "extension");
    await mkdir(extension);
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Plan zoom test",
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
            for (const entry of origin.localStorage) localStorage.setItem(entry.name, entry.value);
      }, state.origins);
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
      const page = await context.newPage();
      await page.setViewportSize({ width, height });
      await page.addInitScript(() => {
        localStorage.setItem("PARAGLIDE_LOCALE", "en");
        const original = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const request = new Request(input, init);
          const path = new URL(request.url, location.origin).pathname;
          if (request.method === "GET" && path === "/api/areas")
            return Response.json([
              {
                id: "prep-area",
                layout_id: "layout-01",
                label: "Preparation area",
                icon: "bi-shop",
                organization_id: null,
                x: 5,
                y: 5,
                rotation: 0,
                width_m: 2,
                length_m: 2,
              },
            ]);
          if (request.method === "GET" && path === "/api/rooms")
            return Response.json([
              {
                id: "room-01",
                venue_id: "venue-01",
                name: "Preparation hall",
                width_m: 20,
                length_m: 15,
                color: "#4a90d9",
                active: true,
              },
            ]);
          if (request.method === "GET" && path === "/api/tables")
            return Response.json(
              Array.from({ length: 24 }, (_, i) => ({
                id: `dense-${i}`,
                name: `Table ${i + 1}`,
                capacity: 20,
                x: (i % 6) * 16,
                y: Math.floor(i / 6) * 23,
                rotation: 0,
                table_type_id: "tt-01",
                layout_id: "layout-01",
                registration_ids: [],
              })),
            );
          if (request.method === "GET" && path === "/api/registrations")
            return Response.json({
              total: 15,
              limit: 100,
              page: 1,
              items: Array.from({ length: 15 }, (_, i) => ({
                id: `booking-${i}`,
                person_id: `person-${i}`,
                person: {
                  id: `person-${i}`,
                  name: `Guest ${i} with a long booking name`,
                  email: "guest@example.com",
                  phone: "",
                },
                event_id: "event-01",
                guest_count: 1,
                status: "confirmed",
                payment_status: "paid",
                order_items: [],
                allocations: [{ table_id: "dense-23", guest_count: 1, exclusive: false }],
                notes: "",
                checked_in: false,
                strap_issued: false,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              })),
            });
          return original(input, init);
        };
      });
      await page.goto("/admin");
      await worker.evaluate(
        `new Promise(resolve => chrome.tabs.query({}, tabs => chrome.tabs.setZoom(tabs.find(tab => tab.url?.includes('/admin')).id, ${zoom}, resolve)))`,
      );

      await page.getByRole("link", { name: en.admin_floor_plans_tab, exact: true }).click();
      const inspector = page.getByRole("complementary", { name: en.admin_layout_inspector });
      await expect(inspector.getByText(en.admin_layout_select_object)).toBeVisible();
      const search = inspector.getByRole("searchbox");
      await search.fill("Table 24");
      const result = inspector.getByRole("button", { name: "Table 24", exact: true });
      await result.focus();
      await page.keyboard.press("Enter");
      await expect(result).toHaveAttribute("aria-pressed", "true");
      await expect(inspector.getByRole("textbox", { name: en.admin_table_name })).toBeVisible();
      const map = page.getByRole("region", { name: "Preparation hall", exact: true });
      await expect(map.locator('[data-plan-table="dense-23"]')).toBeVisible();
      await search.fill("no match");
      await expect(inspector.getByRole("textbox", { name: en.admin_table_name })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("selected-table.png") });
      const lastBooking = inspector.getByText("Guest 14 with a long booking name", { exact: true });
      await lastBooking.scrollIntoViewIfNeeded();
      await expect(lastBooking).toBeVisible();
      if (width / zoom >= 1200 && height / zoom >= 600) {
        const mapBox = await map.boundingBox();
        const inspectorBox = await inspector.boundingBox();
        expect(inspectorBox!.x).toBeGreaterThan(mapBox!.x + mapBox!.width - 1);
        expect(mapBox!.y).toBeGreaterThanOrEqual(0);
      }
      // A new canvas selection must reveal the inspector header after a long allocation list.
      const firstTable = map.locator('[data-plan-table="dense-0"]');
      await firstTable.scrollIntoViewIfNeeded();
      await firstTable.focus();
      await page.keyboard.press("Enter");
      await expect(inspector.getByRole("textbox", { name: en.admin_table_name })).toHaveValue(
        "Table 1",
      );
      expect(await inspector.evaluate((node) => node.scrollTop)).toBe(0);
      await page.getByRole("button", { name: en.admin_layout_areas, exact: true }).click();
      const area = map.getByRole("button", { name: /Preparation area/ });
      await area.focus();
      await page.keyboard.press("Enter");
      await expect(inspector.locator('input[value="Preparation area"]')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
