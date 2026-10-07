import { test, expect } from "@playwright/test";

// Uses the setup project's development OIDC session and the normal MSW API.
test("restored venue rows render while reads are pending and survive failed reconciliation", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Venues & Rooms", exact: true }).click();
  await expect(page.getByText("Brussels Expo", { exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        return new Promise<number>((resolve, reject) => {
          const request = indexedDB.open("champagne-admin-cache", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("cache")) {
              db.close();
              resolve(0);
              return;
            }
            const tx = db.transaction("cache", "readonly");
            const read = tx.objectStore("cache").get("client");
            tx.oncomplete = () => {
              db.close();
              resolve(read.result?.client?.clientState?.queries?.length ?? 0);
            };
          };
        });
      }),
    )
    .toBe(8);

  // Hold API reads across reload; the restored data must not wait for any of them.
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    let failed = false;
    window.addEventListener("warm-start-test-fail", () => {
      failed = true;
    });
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!new URL(url, location.href).pathname.startsWith("/api/"))
        return originalFetch(input, init);
      if (failed) return Promise.reject(new TypeError("Test network failure"));
      return new Promise<Response>((_, reject) => {
        window.addEventListener(
          "warm-start-test-fail",
          () => reject(new TypeError("Test network failure")),
          { once: true },
        );
      });
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "Venues & Rooms", exact: true }).click();
  await expect(page.getByText("Brussels Expo", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Showing saved rows" })).toContainText(
    "Last synced:",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("warm-start-test-fail")));
  await expect(
    page.getByText("Failed to load data. Check your connection.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Brussels Expo", { exact: true })).toBeVisible();
  await expect(page.getByText("Hall 5", { exact: true })).toBeVisible();
});
