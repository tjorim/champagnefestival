import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import en from "../messages/en.json" with { type: "json" };
import nl from "../messages/nl.json" with { type: "json" };
import fr from "../messages/fr.json" with { type: "json" };

// Synthetic UI fixtures; backend attendance/stamp behavior is covered separately.
async function seedRegistrations(page: Page, count = 25) {
  await page.evaluate(async (count) => {
    const path = "/src/mocks/data/registrations.ts";
    const { sharedStore, seedRegistrations } = await import(/* @vite-ignore */ path);
    sharedStore.registrations = Array.from({ length: count }, (_, index) => {
      const source = structuredClone(seedRegistrations[index % seedRegistrations.length]);
      const id = `layout-${index}`;
      return {
        ...source,
        id,
        person_id: id,
        person: {
          ...source.person,
          id,
          name: `Review Guest ${String(index + 1).padStart(2, "0")}`,
          email: `review${index}@example.com`,
        },
        status: "confirmed",
        checked_in: false,
        strap_issued: false,
        check_in_token: `token-${id}`,
      };
    });
  }, count);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
]) {
  test(`registration actions remain reachable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
    await page.goto("/admin?section=registrations");
    await expect(page.getByText("alice@moet.com").first()).toBeVisible();
    await seedRegistrations(page);
    await page.getByRole("searchbox").fill("Review");
    await expect(page.getByRole("button", { name: "Review Guest 01", exact: true })).toBeVisible();
    const action = page.getByRole("button", { name: "Check in", exact: true }).first();
    if (viewport.width === 390) {
      await expect(
        page.getByRole("button", { name: "Toggle navigation", exact: true }),
      ).not.toHaveCSS("position", "fixed");
      await page.mouse.move(200, 600);
      await page.mouse.wheel(0, 320);
      await action.focus();
      await expect(action).toBeInViewport();
      expect(
        await action.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          );
        }),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    const geometry = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("tbody tr")];
      return {
        rows: rows.length,
        visibleRows: rows.filter((row) => {
          const box = row.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= innerHeight;
        }).length,
        rowHeights: rows.slice(0, 3).map((row) => row.getBoundingClientRect().height),
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("registration-list.png") });
    await testInfo.attach("layout-measurements", {
      body: JSON.stringify({ viewport, ...geometry }),
      contentType: "application/json",
    });
    if (viewport.width === 390 || viewport.width === 1024) {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    }
    if (viewport.width === 1024) {
      await action.click();
      const menu = page.getByRole("button", { name: "More actions for Review Guest 01" });
      await menu.click();
      const undoRequest = page.waitForRequest(
        (request) =>
          request.url().endsWith("/api/registrations/layout-0") && request.method() === "PUT",
      );
      await page.getByRole("menuitem", { name: "Undo check-in", exact: true }).click();
      expect((await undoRequest).postDataJSON()).toEqual({ checked_in: false });
      await expect(
        page.getByRole("status").filter({ hasText: "Review Guest 01: Not checked in" }),
      ).toBeAttached();
      await menu.click();
      await page.getByRole("menuitem", { name: "QR Code", exact: true }).click();
      const qr = page.getByRole("dialog");
      await expect(qr).toBeVisible();
      await expect(
        qr.getByRole("button", { name: "Save booking changes", exact: true }),
      ).toHaveCount(0);
      await expect(qr.locator("svg").first()).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name: "Review Guest 01", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("navigation")).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("Grand Opening", { exact: false }).first(),
    ).toBeVisible();
    if (viewport.width >= 1280) {
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("link", { name: "QR Code", exact: true }).click();
      await expect(dialog.getByRole("heading", { name: "QR Code", exact: true })).toBeInViewport();
      const save = dialog.getByRole("button", { name: "Save booking changes", exact: true });
      const guests = dialog
        .getByRole("group", { name: "Booking details", exact: true })
        .getByRole("spinbutton", { name: "Guests", exact: true });
      await guests.fill("0");
      await expect(guests).toHaveAttribute("aria-invalid", "true");
      await expect(guests).toHaveAccessibleDescription("Enter between 1 and 20 guests.");
      await expect(save).toBeDisabled();
      await guests.fill("2");
      await expect(save).toBeEnabled();
      await save.focus();
      await expect(save).toBeFocused();
      await expect(save).toBeInViewport();
      expect(
        await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath("booking-detail.png") });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await page.getByRole("button", { name: "Add registration", exact: true }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Create", exact: true }).click();
      await expect(
        dialog.getByText("Complete the marked fields before creating the booking."),
      ).toBeVisible();
      expect(
        await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(1);
      const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
      await cancel.focus();
      await expect(cancel).toBeInViewport();
      await cancel.click();
      await expect(dialog).toHaveCount(0);
    }
  });
}

for (const [locale, messages] of Object.entries({ en, nl, fr })) {
  test(`camera denial and manual selection at phone width in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((language) => {
      localStorage.setItem("PARAGLIDE_LOCALE", language);
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: () => Promise.reject(new DOMException("Denied", "NotAllowedError")),
      });
    }, locale);
    await page.goto("/check-in");
    await expect(page.getByText(messages.checkin_scanner_permission_denied)).toBeVisible();
    const video = page.locator("video");
    await expect(video.locator("..")).toBeHidden();
    const prompt = page.getByText(messages.checkin_scan_prompt);
    expect((await prompt.boundingBox())!.width).toBeGreaterThan(250);
    await expect(
      page.getByRole("button", { name: messages.checkin_manual_search_title }).first(),
    ).toBeInViewport();
    await seedRegistrations(page);
    await page.evaluate(async () => {
      const path = "/src/mocks/data/registrations.ts";
      const { sharedStore } = await import(/* @vite-ignore */ path);
      const source = sharedStore.registrations[0].order_items[0];
      sharedStore.registrations[0].order_items = Array.from({ length: 15 }, (_, index) => ({
        ...source,
        product_id: `long-order-${index}`,
        name: `Order line ${index}`,
      }));
    });
    await page.getByLabel(messages.checkin_manual_search_label).fill("Review Guest 01");
    await page.getByText("Review Guest 01", { exact: true }).click();
    await expect(page.getByLabel(messages.checkin_manual_search_label)).toHaveCount(0);
    await expect(page.locator("video")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: messages.checkin_do_checkin, exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: messages.checkin_scan_next }).click();
    await expect(page.getByLabel(messages.checkin_manual_search_label)).toBeVisible();
    await expect(
      page.getByRole("button", { name: messages.checkin_scan_method, exact: true }),
    ).toBeFocused();
  });
}

// The test-only extension uses chrome.tabs.setZoom: browser zoom, rather than
// CSS zoom or CDP pinch emulation. DPR and visual scale verify the distinction.
for (const zoom of [1.25, 1.5, 2]) {
  test(`browser zoom ${zoom * 100}% preserves entrance actions`, async ({ baseURL }, testInfo) => {
    const { chromium } = await import("@playwright/test");
    const { mkdtemp, mkdir, writeFile, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const profile = await mkdtemp(join(tmpdir(), "entrance-zoom-"));
    const extension = join(profile, "zoom-extension");
    await mkdir(extension);
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Entrance layout zoom test",
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
      await page.goto(`${baseURL}/check-in`);
      await worker.evaluate(
        `new Promise(resolve => chrome.tabs.query({}, tabs => chrome.tabs.setZoom(tabs.find(tab => tab.url?.includes('/check-in')).id, ${zoom}, resolve)))`,
      );
      await page.waitForFunction((factor) => Math.abs(devicePixelRatio - factor) < 0.05, zoom);
      await expect(page.getByText(en.checkin_scanner_permission_denied)).toBeVisible();
      const metrics = await page.evaluate(() => ({
        width: innerWidth,
        dpr: devicePixelRatio,
        pinch: visualViewport?.scale,
        overflow: document.documentElement.scrollWidth - innerWidth,
      }));
      expect(metrics.dpr).toBeCloseTo(zoom, 1);
      expect(metrics.pinch).toBe(1);
      expect(metrics.overflow).toBeLessThanOrEqual(1);
      const manual = page.getByRole("button", { name: en.checkin_manual_search_title }).first();
      const box = await manual.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(metrics.width);
      if (zoom < 2) {
        await page.goto(`${baseURL}/admin?section=registrations`);
        await expect(page.getByText("alice@moet.com").first()).toBeVisible();
        await seedRegistrations(page);
        await page.getByRole("searchbox").fill("Review");
        await expect(
          page.getByRole("button", { name: "Review Guest 01", exact: true }),
        ).toBeVisible();
        for (const viewport of [
          { width: 1280, height: 800 },
          { width: 1366, height: 768 },
          { width: 1440, height: 900 },
          { width: 1280, height: 650 },
        ]) {
          await page.setViewportSize(viewport);
          const action = page.getByRole("button", { name: "Check in", exact: true }).first();
          await expect
            .poll(async () => {
              const box = await action.boundingBox();
              const width = await page.evaluate(() => innerWidth);
              return box !== null && box.x >= 0 && box.x + box.width <= width;
            })
            .toBe(true);
          expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(zoom, 1);
          await page.getByRole("button", { name: "Review Guest 01", exact: true }).click();
          const save = page
            .getByRole("dialog")
            .getByRole("button", { name: "Save booking changes", exact: true });
          await save.focus();
          await expect(save).toBeInViewport();
          await page.keyboard.press("Escape");
          await page.evaluate(() => window.scrollTo(0, 0));
        }
      } else {
        for (const [language, messages] of Object.entries({ en, nl, fr })) {
          await page.addInitScript(
            (value) => localStorage.setItem("PARAGLIDE_LOCALE", value),
            language,
          );
          await page.goto(`${baseURL}/check-in`);
          await expect(page.getByText(messages.checkin_scanner_permission_denied)).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
          ).toBeLessThanOrEqual(1);
          const prompt = await page.getByText(messages.checkin_scan_prompt).boundingBox();
          expect(prompt!.x + prompt!.width).toBeLessThanOrEqual(
            await page.evaluate(() => innerWidth),
          );
          await context.setOffline(true);
          await expect(page.getByText(messages.checkin_offline_banner)).toBeVisible();
          const banner = await page.getByText(messages.checkin_offline_banner).boundingBox();
          expect(banner!.x + banner!.width).toBeLessThanOrEqual(
            await page.evaluate(() => innerWidth),
          );
          await context.setOffline(false);
        }
      }
      await testInfo.attach("browser-zoom-metrics", {
        body: JSON.stringify({ zoom, ...metrics }),
        contentType: "application/json",
      });
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}

for (const [locale, messages] of Object.entries({ nl, fr })) {
  test(`translated booking actions and toolbar fit in ${locale}`, async ({ page }, testInfo) => {
    await page.addInitScript(
      (language) => localStorage.setItem("PARAGLIDE_LOCALE", language),
      locale,
    );
    await page.setViewportSize({ width: 1280, height: 768 });
    await page.goto("/admin?section=registrations");
    await expect(page.getByText("alice@moet.com").first()).toBeVisible();
    await seedRegistrations(page);
    await page.getByRole("searchbox").fill("Review");
    await expect(page.getByRole("button", { name: "Review Guest 01", exact: true })).toBeVisible();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 768 });
      const entrance = page
        .getByRole("button", { name: messages.admin_mark_checked_in, exact: true })
        .first();
      await expect
        .poll(async () => {
          const box = await entrance.boundingBox();
          return box !== null && box.x >= 0 && box.x + box.width <= width;
        })
        .toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      if (width === 390) {
        await page.getByRole("button", { name: messages.admin_table_sort, exact: true }).click();
        await page
          .getByRole("menuitem", {
            name: messages.admin_table_sort_descending.replace(
              "{column}",
              messages.admin_guests_count,
            ),
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("button", { name: new RegExp(`^${messages.admin_table_sort}:`) }),
        ).toBeVisible();
      }
      await page
        .getByRole("button", {
          name: messages.admin_more_actions_for.replace("{name}", "Review Guest 01"),
          exact: true,
        })
        .click();
      await page
        .getByRole("menuitem", { name: messages.admin_view_edit_booking, exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("group", { name: messages.admin_booking_details, exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("group", { name: messages.admin_booking_payments, exact: true }),
      ).toBeVisible();
      const overflow = await dialog.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      );
      if (overflow > 1) {
        console.log(
          await dialog.evaluate((element) => {
            const boundary = element.getBoundingClientRect();
            return [...element.querySelectorAll("*")]
              .map((child) => ({
                class: child.className,
                tag: child.tagName,
                text: child.textContent?.slice(0, 70),
                right: child.getBoundingClientRect().right - boundary.right,
              }))
              .filter((child) => child.right > 1)
              .slice(-20);
          }),
        );
        await page.screenshot({ path: testInfo.outputPath("dialog-overflow.png"), fullPage: true });
      }
      expect(overflow).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
    }
  });
}

test("cross-page bulk confirmation names the affected guests and dated events before any write", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
  await page.goto("/admin?section=registrations");
  await expect(page.getByText("alice@moet.com").first()).toBeVisible();
  await seedRegistrations(page, 60);
  await page.getByRole("searchbox").fill("Review");
  await expect(page.getByRole("button", { name: "Review Guest 01", exact: true })).toBeVisible();
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/registrations") &&
      ["POST", "PUT", "DELETE"].includes(request.method())
    )
      writes.push(request.url());
  });
  await page.getByRole("checkbox", { name: en.admin_select_all, exact: true }).check();
  await page
    .getByRole("button", {
      name: en.admin_bulk_select_all_matching.replace("{total}", "60"),
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: en.admin_review_selected_bookings.replace("{count}", "60"),
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", {
      name: en.admin_bulk_selected.replace("{count}", "60"),
      exact: true,
    }),
  ).toBeFocused();
  await page.getByRole("button", { name: en.admin_bulk_confirm, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Grand Opening · 2026-03-06: 15", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: en.admin_bulk_selected.replace("{count}", "60"), exact: true })
    .click();
  const selected = dialog.getByRole("list", {
    name: en.admin_bulk_selected.replace("{count}", "60"),
    exact: true,
  });
  await selected.focus();
  await page.keyboard.press("End");
  await expect(selected).toBeFocused();
  await expect(dialog.getByText(/Review Guest 60/)).toBeInViewport();
  await dialog.getByRole("button", { name: en.admin_action_cancel, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("admin entrance actions stay live-only and announce successful guest changes", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
  await page.goto("/admin?section=registrations");
  await expect(page.getByText("alice@moet.com").first()).toBeVisible();
  await seedRegistrations(page);
  await page.getByRole("searchbox").fill("Review");
  await expect(page.getByRole("button", { name: "Review Guest 01", exact: true })).toBeVisible();
  const entrance = page.getByRole("button", { name: "Check in", exact: true }).first();
  const writes: unknown[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/registrations/layout-0") && request.method() === "PUT")
      writes.push(request.postDataJSON());
  });
  await context.setOffline(true);
  await expect(entrance).toBeDisabled();
  await expect(page.getByText(en.checkin_offline_banner)).toBeVisible();
  await entrance.dispatchEvent("click");
  await context.setOffline(false);
  await expect(entrance).toBeEnabled();
  expect(writes).toEqual([]);
  await entrance.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Review Guest 01: Checked in" }),
  ).toBeVisible();
  const menu = page.getByRole("button", { name: "More actions for Review Guest 01", exact: true });
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: "Review Guest 01", exact: true }) });
  await expect(row.getByRole("button", { name: "Check in", exact: true })).toHaveCount(0);
  const undo = page.getByRole("menuitem", { name: "Undo check-in", exact: true });
  await context.setOffline(true);
  await expect(page.getByText(en.checkin_offline_banner)).toBeVisible();
  await menu.click();
  await expect(undo).toBeDisabled();
  await undo.dispatchEvent("click");
  await page.keyboard.press("Escape");
  await context.setOffline(false);
  await expect(page.getByText(en.checkin_offline_banner)).toHaveCount(0);
  await menu.click();
  await expect(undo).toBeEnabled();
  expect(writes).toEqual([{ checked_in: true }]);
  await undo.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Review Guest 01: Not checked in" }),
  ).toBeVisible();
  expect(writes).toEqual([{ checked_in: true }, { checked_in: false }]);
});
