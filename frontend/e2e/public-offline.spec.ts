import { test, expect } from "@playwright/test";
import { activeEdition, seedEvents } from "../src/mocks/data/editions";

test("one online visit makes public information available after an offline reload", async ({
  page,
  context,
}) => {
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json =
      path === "/api/settings"
        ? { maintenance_mode: false, public_email: "offline@example.com" }
        : path === "/api/editions/active"
          ? {
              ...activeEdition,
              events: seedEvents.filter((event) => event.edition_id === activeEdition.id),
            }
          : path === "/api/faq/active"
            ? [
                {
                  id: "offline-faq",
                  question: "Offline test question",
                  answer: "Saved festival information",
                },
              ]
            : [];
    await route.fulfill({ json });
  });
  await page.goto("/en");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await caches.keys()).some((name) => name.startsWith("public-site-")),
      ),
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        if (navigator.serviceWorker.controller) resolve();
        else
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
            once: true,
          });
      }),
  );
  await context.unroute("**/api/**");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toBeVisible();
  await expect(page.getByText("Offline test question")).toBeVisible();
  await expect(page.getByText("offline@example.com", { exact: true }).first()).toBeVisible();
  await expect(page.locator("#schedule")).toBeVisible();
  await expect(page.locator("#map")).toBeVisible();
  await expect(page.getByText(/Last updated:/)).toBeVisible();
  const sent = await page.evaluate(() => {
    const form = document.querySelector("form");
    if (!form) throw new Error("Contact form missing");
    return form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(sent).toBe(false);
});
