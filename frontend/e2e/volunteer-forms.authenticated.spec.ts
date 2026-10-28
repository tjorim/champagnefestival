import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import en from "../messages/en.json" with { type: "json" };
import nl from "../messages/nl.json" with { type: "json" };
import fr from "../messages/fr.json" with { type: "json" };
const messages = { en, nl, fr };

async function seedForms(page: Page, linked: boolean) {
  // Use a stable, unprefixed route: the home page can redirect to a saved locale.
  await page.goto("/check-in");
  await expect(page.locator("#check-in")).toBeVisible();
  await page.evaluate(async (isLinked) => {
    const browserPath = "/src/mocks/browser.ts";
    const httpPath = "/node_modules/msw/lib/http/index.js";
    const { worker } = await import(/* @vite-ignore */ browserPath);
    const { http, HttpResponse } = await import(/* @vite-ignore */ httpPath);
    const questions = [
      {
        id: "attendance",
        kind: "yes_no",
        title: "Attendance — a long question title for the volunteer dinner",
        description: "Please tell us whether you can join the volunteer dinner after the festival.",
        closes_at: "2027-01-01T18:00:00Z",
        closed: false,
        attending: null,
        people: 0,
        options: [],
      },
      {
        id: "text",
        kind: "free_text",
        title: "Suggestions for the volunteer team",
        closed: false,
        text: null,
        options: [],
      },
      {
        id: "closed",
        kind: "rating",
        title: "Closed question",
        closed: true,
        rating: 3,
        options: [],
      },
    ];
    const poll = () => ({ edition_id: "test", questions, note: null });
    // Hold the failing write until the test has observed the pending UI.
    const failedWrite = new Promise<void>((resolve) => {
      window.addEventListener("release-poll-write", () => resolve(), { once: true });
    });
    worker.use(
      http.get("/api/me/organizations", () => HttpResponse.json([])),
      http.get("/api/me/volunteer", () =>
        HttpResponse.json({
          linked: isLinked,
          name: "Synthetic volunteer",
          national_register_number: null,
          eid_document_number: null,
        }),
      ),
      http.get("/api/me/volunteer/poll", () => HttpResponse.json(poll())),
      http.put("/api/me/volunteer/poll/questions/:id", async ({ params, request }) => {
        const body = await request.json();
        if (params.id === "text") {
          await failedWrite;
          return HttpResponse.json({ detail: "PRIVATE DIAGNOSTIC" }, { status: 500 });
        }
        Object.assign(
          questions.find((q) => q.id === params.id)!,
          body,
        );
        return HttpResponse.json(poll());
      }),
    );
    history.pushState(null, "", "/me");
    dispatchEvent(new PopStateEvent("popstate"));
  }, linked);
  await page
    .getByRole("tab", { name: /My volunteer tasks|Mijn vrijwilligerstaken|Mes tâches bénévoles/ })
    .click();
}

async function checkLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const nestedScroll = await page.locator('[role="tabpanel"]:visible').evaluate((panel) =>
    [...panel.querySelectorAll("*")]
      .filter((el) => {
        const style = getComputedStyle(el);
        return (
          ["auto", "scroll"].includes(style.overflowY) && el.scrollHeight > el.clientHeight + 1
        );
      })
      .map((el) => el.tagName),
  );
  expect(nestedScroll).toEqual([]);
}

for (const [width, height] of [
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1280, 600],
]) {
  for (const locale of ["en", "nl", "fr"] as const) {
    test(`volunteer form layout ${width}x${height} ${locale}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.addInitScript(
        (language) => localStorage.setItem("PARAGLIDE_LOCALE", language),
        locale,
      );
      await seedForms(page, false);
      await expect(page.getByText(messages[locale].my_eid_help, { exact: true })).toBeVisible();
      const niss = page.locator("#my-eid-niss");
      await expect(niss).toBeVisible();
      await page.locator("#my-eid-name").fill("Synthetic volunteer");
      await niss.fill("00000000000");
      await page.locator("#my-eid-eid").fill("999999999999");
      await page.locator('[role="tabpanel"]:visible button[type="submit"]').click();
      await expect(niss).toBeFocused();
      await expect(niss).toHaveAttribute("aria-invalid", "true");
      await expect(page.locator("#my-eid-niss-error")).toBeVisible();
      await checkLayout(page);
      await page.screenshot({
        path: testInfo.outputPath("identity-validation.png"),
        fullPage: true,
      });
      await seedForms(page, true);
      await expect(
        page.getByRole("region", { name: "Suggestions for the volunteer team" }),
      ).toBeVisible();
      const text = page.locator("#my-poll-text-text");
      await text.fill("Long volunteer answer. ".repeat(20));
      const save = page
        .getByRole("region", { name: "Suggestions for the volunteer team" })
        .getByRole("button");
      await save.click();
      await expect(text).toBeDisabled();
      await page.evaluate(() => window.dispatchEvent(new Event("release-poll-write")));
      await expect(text).toBeEnabled();
      await expect(text).toHaveValue("Long volunteer answer. ".repeat(20));
      await expect(page.getByText("PRIVATE DIAGNOSTIC")).toHaveCount(0);
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
      await checkLayout(page);
      await page.screenshot({ path: testInfo.outputPath("poll-failure.png"), fullPage: true });
      const results = await new AxeBuilder({ page })
        .include('[role="tabpanel"]:not([hidden])')
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

for (const zoom of [1.25, 1.5]) {
  test(`volunteer forms at real browser zoom ${zoom * 100}%`, async ({ baseURL }, testInfo) => {
    const { chromium } = await import("@playwright/test");
    const { mkdtemp, mkdir, writeFile, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const profile = await mkdtemp(join(tmpdir(), "volunteer-zoom-"));
    const extension = join(profile, "zoom-extension");
    await mkdir(extension);
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Volunteer form zoom test",
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
      viewport: { width: 1366, height: 600 },
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
      await seedForms(page, false);
      await worker.evaluate(
        `new Promise(resolve => chrome.tabs.query({}, tabs => chrome.tabs.setZoom(tabs.find(tab => tab.url?.includes('/me')).id, ${zoom}, resolve)))`,
      );
      await page.waitForFunction((factor) => Math.abs(devicePixelRatio - factor) < 0.05, zoom);
      expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);
      await checkLayout(page);
      await page
        .locator('[role="tabpanel"]:visible button[type="submit"]')
        .scrollIntoViewIfNeeded();
      await expect(
        page.locator('[role="tabpanel"]:visible button[type="submit"]'),
      ).toBeInViewport();
      await seedForms(page, true);
      await page.locator("#my-poll-text-text").fill("Une longue réponse. ".repeat(24));
      const save = page
        .getByRole("region", { name: "Suggestions for the volunteer team" })
        .getByRole("button");
      await save.click();
      await expect(page.locator("#my-poll-text-text")).toBeDisabled();
      await page.evaluate(() => window.dispatchEvent(new Event("release-poll-write")));
      await expect(page.locator("#my-poll-text-text")).toBeEnabled();
      await checkLayout(page);
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
      // Capture without Playwright clip coordinates after native tab zoom.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const cdp = await context.newCDPSession(page);
      const capture = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      await writeFile(testInfo.outputPath("zoom-poll.png"), Buffer.from(capture.data, "base64"));
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
