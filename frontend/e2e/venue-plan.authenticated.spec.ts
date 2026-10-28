import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function seedPlan(page: Page) {
  await page.goto("/venue-plan?edition=test");
  await expect(page.getByText("No floor plan is available for this edition.")).toBeVisible();
  await page.evaluate(async () => {
    const browserPath = "/src/mocks/browser.ts";
    const httpPath = "/node_modules/msw/lib/http/index.js";
    const { worker } = await import(/* @vite-ignore */ browserPath);
    const { http, HttpResponse } = await import(/* @vite-ignore */ httpPath);
    worker.use(
      http.get("/api/venue-plan/:edition", () =>
        HttpResponse.json({
          edition_id: "test",
          layouts: [
            {
              id: "hall",
              event_id: "festival",
              event_title: "Festival with a long event title",
              date: "2026-10-28",
              label: "Main",
              room: {
                id: "hall",
                name: "Main hall with a long room name",
                width_m: 20,
                length_m: 15,
                color: "#123456",
              },
              areas: [],
              tables: Array.from({ length: 24 }, (_, i) => ({
                id: `table-${i + 1}`,
                name: `Table ${i + 1}`,
                capacity: 8,
                occupied_seats: i === 23 ? 9 : 0,
                exclusive: i === 23,
                x: (i % 6) * 18,
                y: Math.floor(i / 6) * 30,
                rotation: 0,
                registration_ids: [],
              })),
            },
          ],
        }),
      ),
    );
  });
  await page.evaluate(() => {
    history.pushState(null, "", "/venue-plan?edition=dense&table=table-24&registration=booking-1");
    dispatchEvent(new PopStateEvent("popstate"));
  });
}

for (const width of [390, 1280, 1366, 1440]) {
  test(`dense plan navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
    await seedPlan(page);
    await expect(page.getByRole("searchbox")).toBeVisible();
    await page.getByRole("searchbox").fill("Table 24");
    const show = page.getByRole("button", { name: "Show table on floor plan" });
    await show.focus();
    await page.keyboard.press("Enter");
    const destination = page.getByRole("status");
    await expect(destination).toBeFocused();
    await expect(destination).toContainText("Table 24");
    await expect(destination).toContainText("Exclusive booking");
    await expect(page.locator('[aria-current="location"]')).toContainText("Table 24");
    const scroll = page.getByRole("region", {
      name: "Main hall with a long room name",
      exact: true,
    });
    await scroll.focus();
    await page.keyboard.press("ArrowRight");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  });
}

for (const zoom of [1.25, 1.5, 2]) {
  test(`dense plan at browser zoom ${zoom * 100}%`, async ({ baseURL }) => {
    const { chromium } = await import("@playwright/test");
    const { mkdtemp, mkdir, writeFile, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const profile = await mkdtemp(join(tmpdir(), "venue-plan-zoom-"));
    const extension = join(profile, "zoom-extension");
    await mkdir(extension);
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Venue plan zoom test",
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
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      viewport: { width: zoom === 2 ? 390 : 1366, height: zoom === 2 ? 844 : 768 },
    });
    try {
      await context.addInitScript((origins) => {
        for (const origin of origins) {
          if (origin.origin !== location.origin) continue;
          for (const entry of origin.localStorage) localStorage.setItem(entry.name, entry.value);
        }
        localStorage.setItem("PARAGLIDE_LOCALE", "en");
      }, state.origins);
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
      const page = await context.newPage();

      await page.goto(`${baseURL}/venue-plan?edition=test`);
      await seedPlan(page);
      await worker.evaluate(
        `new Promise(resolve => chrome.tabs.query({}, tabs => chrome.tabs.setZoom(tabs.find(tab => tab.url?.includes('/venue-plan')).id, ${zoom}, resolve)))`,
      );
      await page.waitForFunction((factor) => Math.abs(devicePixelRatio - factor) < 0.05, zoom);
      await expect(page.getByRole("searchbox")).toBeVisible();
      await expect(page.getByRole("status")).toContainText("Table 24");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);
      await page.getByRole("button", { name: "Table list", exact: true }).click();
      await page.getByRole("searchbox").fill("Table 24");
      await page.getByRole("button", { name: "Show table on floor plan" }).click();
      await expect(page.getByRole("status")).toBeFocused();
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
