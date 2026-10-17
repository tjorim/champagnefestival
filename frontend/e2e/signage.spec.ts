import { test, expect } from "@playwright/test";
const slides = [0, 1].map((index) => ({
  id: String(index),
  kind: "image",
  duration: 2,
  text: `Slide ${index}`,
  title: null,
  image: "/images/logo.svg",
  icon: null,
  organization: null,
  template: {
    background: { kind: "color", color: "#000000", end_color: "#000000", image: null },
    layers: [
      {
        id: "text",
        kind: "binding",
        binding: "text",
        x: 10,
        y: 30,
        width: 80,
        height: 40,
        rotation: 0,
        color: "#ffffff",
        font_size: 80,
      },
    ],
  },
}));
test("wrong-clock screens synchronise and reload offline", async ({ browser }) => {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext()));
  let offline = false;
  const pages = await Promise.all(
    contexts.map(async (context, index) => {
      await context.route("**/api/**", async (route) => {
        if (offline && index === 0) return route.abort("internetdisconnected");
        const url = new URL(route.request().url());
        if (url.pathname === "/api/signage/time")
          return route.fulfill({ json: { server_time: new Date().toISOString() } });
        if (url.pathname.endsWith("/playlist"))
          return route.fulfill({
            headers: { ETag: '"v1"' },
            json: { revision: "v1", epoch: "2026-10-01T00:00:00Z", slides },
          });
        return route.fulfill({ json: {} });
      });
      const page = await context.newPage();
      if (index === 1) await page.clock.setFixedTime(new Date(Date.now() + 3_601_500));
      await page.goto("http://localhost:5178/signage/test");
      await expect(page.locator('[role="status"]')).toHaveAttribute(
        "aria-label",
        /Connected|Verbonden|Connecté/,
      );
      return page;
    }),
  );
  const first = pages[0]!;
  await expect
    .poll(async () => {
      const values = await Promise.all(
        pages.map((page) => page.locator("[data-slide-index]").getAttribute("data-slide-index")),
      );
      return values[0] === values[1] && values[0] !== "-1";
    })
    .toBe(true);
  const initial = await first.locator("[data-slide-index]").getAttribute("data-slide-index");
  await expect(first.locator("[data-slide-index]")).not.toHaveAttribute(
    "data-slide-index",
    initial!,
  );
  await first.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      first.evaluate(async () =>
        Boolean(await (await caches.open("signage-shell-v1")).match(location.href)),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      first.evaluate(async () => {
        const cache = await caches.open("signage-shell-v1");
        const urls = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => new URL(url).pathname.startsWith("/assets/"));
        return (await Promise.all(urls.map((url) => cache.match(url)))).every(Boolean);
      }),
    )
    .toBe(true);
  offline = true;
  await contexts[0]!.setOffline(true);
  await expect(first.locator('[role="status"]')).toHaveAttribute(
    "aria-label",
    /Waiting|Wachten|attente/,
  );
  const offlineIndex = await first.locator("[data-slide-index]").getAttribute("data-slide-index");
  await expect(first.locator("[data-slide-index]")).not.toHaveAttribute(
    "data-slide-index",
    offlineIndex!,
  );
  await first.reload();
  await expect(first.locator("[data-slide-index]")).not.toHaveAttribute("data-slide-index", "-1");
  await expect
    .poll(() =>
      first
        .locator("img")
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  offline = false;
  await contexts[0]!.setOffline(false);
  await expect(first.locator('[role="status"]')).toHaveAttribute(
    "aria-label",
    /Connected|Verbonden|Connecté/,
  );
  await Promise.all(contexts.map((context) => context.close()));
});

test("revisions wait for a cycle boundary and wake lock is reacquired", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const epoch = "2026-10-01T00:00:00Z";
  await page.clock.install({ time: new Date(epoch) });
  await page.clock.pauseAt(new Date(epoch));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: async () => {
          const state = window as unknown as { wakeRequests: number };
          state.wakeRequests = (state.wakeRequests ?? 0) + 1;
          const sentinel = Object.assign(new EventTarget(), {
            released: false,
            release: async () => {},
          });
          (window as unknown as { releaseWake: () => void }).releaseWake = () => {
            sentinel.released = true;
            sentinel.dispatchEvent(new Event("release"));
          };
          return sentinel;
        },
      },
    });
  });
  let revision = "v1";
  let conditional = false;
  await context.route("**/api/**", async (route) => {
    if (route.request().url().endsWith("/time")) {
      // Visibility changes trigger another sync. The mock server must advance with
      // the controlled clock, including when a sync overlaps fastForward().
      const serverTime = await page.evaluate(() => new Date().toISOString());
      return route.fulfill({ json: { server_time: serverTime } });
    }
    if (route.request().url().includes("/playlist")) {
      conditional ||= route.request().headers()["if-none-match"] === '"v1"';
      return route.fulfill({
        headers: { ETag: `"${revision}"` },
        json: {
          epoch,
          revision,
          slides: slides.map((slide) => ({
            ...slide,
            duration: 20,
            text: `${revision}:${slide.id}`,
          })),
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("http://localhost:5178/signage/test");
  await expect(page.getByText("v1:0", { exact: true })).toBeVisible();
  await page.getByRole("button").click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { wakeRequests: number }).wakeRequests))
    .toBe(1);
  revision = "v2";
  await page.clock.fastForward(30_000);
  await expect.poll(() => conditional).toBe(true);
  await expect(page.getByText("v1:1", { exact: true })).toBeVisible();
  await page.clock.fastForward(10_000);
  await expect(page.getByText("v2:0", { exact: true })).toBeVisible();
  // Exercise visibility-triggered resynchronization after the boundary assertions.
  await page.evaluate(() => {
    (window as unknown as { releaseWake: () => void }).releaseWake();
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { wakeRequests: number }).wakeRequests))
    .toBe(2);
  await context.close();
});
