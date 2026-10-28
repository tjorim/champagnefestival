import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleAnimations } from "./axe";
import { rehearsePreparation } from "./workspacePreparation";

for (const roles of [
  ["admin"],
  ["volunteer"],
  ["member"],
  ["organization-contact"],
  ["admin", "volunteer", "member"],
]) {
  test(`separate browser journey: ${roles.join(" + ")}`, async ({ page }) => {
    await page.addInitScript((selected) => {
      localStorage.setItem("PARAGLIDE_LOCALE", "en");
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith("oidc.user:")) continue;
        const user = JSON.parse(localStorage.getItem(key)!);
        user.profile.realm_access.roles = selected;
        if (selected.includes("organization-contact")) user.access_token = "mock-manager-token";
        localStorage.setItem(key, JSON.stringify(user));
      }
    }, roles);
    await page.goto("/check-in");
    await page.evaluate(async () => {
      const browserPath = "/src/mocks/browser.ts";
      const httpPath = "/node_modules/msw/lib/http/index.js";
      const { worker } = await import(/* @vite-ignore */ browserPath);
      const { http, HttpResponse } = await import(/* @vite-ignore */ httpPath);
      worker.use(
        http.get("/api/me/membership", () => HttpResponse.json({ state: "active" })),
        http.get("/api/me/volunteer", () =>
          HttpResponse.json({
            linked: true,
            name: "Synthetic volunteer",
            national_register_number: null,
            eid_document_number: null,
          }),
        ),
      );
      history.pushState(null, "", "/me?edition=chosen");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByText("Active membership", { exact: true })).toBeVisible();
    const staff = roles.includes("admin") || roles.includes("volunteer");
    const tasks = page.getByRole("navigation", { name: "My tasks", exact: true });
    await expect(tasks).toHaveCount(staff ? 1 : 0);
    await expect(page.getByRole("tab", { name: "My volunteer tasks", exact: true })).toHaveCount(
      roles.includes("volunteer") ? 1 : 0,
    );
    if (roles.includes("organization-contact"))
      await expect(page.getByRole("tab", { name: "My organisations", exact: true })).toBeVisible();
    if (staff) {
      await expect(tasks.getByRole("link", { name: "View seating", exact: true })).toHaveAttribute(
        "href",
        "/venue-plan?edition=chosen",
      );
      await tasks.getByRole("link", { name: "My tasks", exact: true }).click();
      const home = page.getByRole("navigation", { name: "My tasks", exact: true });
      await expect(home).toBeVisible();
      await expect(home.getByRole("link", { name: "People", exact: true })).toHaveCount(
        roles.includes("admin") ? 1 : 0,
      );
    }
  });
}

for (const width of [1280, 1366, 1440]) {
  test(`populated preparation task rehearsal at ${width}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 600 });
    await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
    await page.goto("/admin");
    await rehearsePreparation(page);
  });
}

test("workspace and account pass WCAG A/AA scans", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("PARAGLIDE_LOCALE", "en"));
  for (const scenario of [
    { width: 1280, colorScheme: "light" },
    { width: 1280, colorScheme: "dark" },
    { width: 375, colorScheme: "light" },
  ] as const) {
    await page.setViewportSize({ width: scenario.width, height: 720 });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    for (const path of ["/admin", "/me"]) {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "My tasks", exact: true })).toBeVisible();
      await settleAnimations(page);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(result.violations, `${path} at ${scenario.width} ${scenario.colorScheme}`).toEqual([]);
    }
  }
});
