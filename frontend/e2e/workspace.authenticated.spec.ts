import { test, expect } from "@playwright/test";
import { rehearsePreparation } from "./workspacePreparation";
import en from "../messages/en.json" with { type: "json" };
import nl from "../messages/nl.json" with { type: "json" };
import fr from "../messages/fr.json" with { type: "json" };

for (const locale of ["nl", "fr", "en"] as const) {
  const messages = { nl, fr, en }[locale];
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 390, height: 700 },
  ]) {
    test(`workspace tasks in ${locale} at ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(
        (language) => localStorage.setItem("PARAGLIDE_LOCALE", language),
        locale,
      );
      await page.goto("/admin");
      const tasks = page.getByRole("navigation", { name: messages.workspace_title, exact: true });
      await expect(tasks).toBeVisible();
      await expect(
        tasks.getByRole("link", { name: messages.admin_content_editions_section, exact: true }),
      ).toBeVisible();
      await expect(
        tasks.getByRole("link", { name: messages.admin_people_tab, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await tasks.getByRole("link", { name: messages.workspace_volunteer, exact: true }).click();
      await expect(page).toHaveURL(/\/me\?.*tab=volunteer/);
      await expect(
        page.getByRole("tab", { name: messages.workspace_volunteer, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("heading", { name: messages.workspace_questions, exact: true }),
      ).toBeVisible();
      await page.getByRole("tab", { name: messages.workspace_settings, exact: true }).click();
      await expect(
        page.getByRole("tabpanel", { name: messages.workspace_settings, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    });
  }
}

for (const width of [1280, 1366, 1440]) {
  for (const zoom of [1.25, 1.5]) {
    test(`workspace at ${width} reduced height and native zoom ${zoom}`, async ({ baseURL }) => {
      test.setTimeout(90000);
      const { chromium } = await import("@playwright/test");
      const { mkdtemp, mkdir, writeFile, readFile, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const profile = await mkdtemp(join(tmpdir(), "workspace-zoom-"));
      const extension = join(profile, "extension");
      await mkdir(extension);
      await writeFile(
        join(extension, "manifest.json"),
        JSON.stringify({
          manifest_version: 3,
          name: "Workspace zoom test",
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
        viewport: { width, height: 600 },
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      });
      try {
        await context.addInitScript((origins) => {
          for (const origin of origins) {
            if (origin.origin !== location.origin) continue;
            for (const entry of origin.localStorage) localStorage.setItem(entry.name, entry.value);
          }
          localStorage.setItem("PARAGLIDE_LOCALE", "fr");
        }, state.origins);
        const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
        const page = await context.newPage();
        await page.goto("/admin");
        const tasks = page.getByRole("navigation", { name: fr.workspace_title, exact: true });
        await expect(tasks).toBeVisible();
        await worker.evaluate(
          `new Promise(resolve => chrome.tabs.query({}, tabs => chrome.tabs.setZoom(tabs.find(tab => tab.url?.includes('/admin')).id, ${zoom}, resolve)))`,
        );
        await page.waitForFunction((factor) => Math.abs(devicePixelRatio - factor) < 0.05, zoom);
        expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        await rehearsePreparation(page, fr, true);
        const ownTasks = tasks.getByRole("link", { name: fr.workspace_volunteer, exact: true });
        await ownTasks.focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/me\?.*tab=volunteer/);
        await expect(
          page.getByRole("tab", { name: fr.workspace_volunteer, exact: true }),
        ).toHaveAttribute("aria-selected", "true");
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
      } finally {
        await context.close();
        await rm(profile, { recursive: true, force: true });
      }
    });
  }
}

test("pending count opens the matching unscoped registration query", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
  await page.goto("/admin");
  const queue = page.getByRole("link", { name: /^Pending bookings: \d+$/ });
  await expect(queue).toBeVisible();
  const response = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/registrations" &&
      url.searchParams.get("status") === "pending" &&
      url.searchParams.get("limit") === "50"
    );
  });
  await queue.click();
  const url = new URL((await response).url());
  for (const unwanted of ["edition_id", "event_date", "edition_category", "q"])
    expect(url.searchParams.has(unwanted)).toBe(false);
  await expect(page).toHaveURL(/registrationStatus=pending/);
});
