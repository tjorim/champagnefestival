import { expect, test } from "@playwright/test";
import themes from "../src/config/visualThemes.json" with { type: "json" };

for (const theme of themes) {
  test(`${theme.value} applies metadata before React loads`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(
      (variant) => localStorage.setItem("champagnefestival:visualTheme", variant),
      theme.value,
    );
    await page.route("**/src/main.tsx", (route) => route.abort());
    await page.goto("/");
    const mode = theme.bootstrapMode === "system" ? "light" : theme.bootstrapMode;
    await expect(page.locator("html")).toHaveAttribute("data-visual-theme", theme.value);
    await expect(page.locator("html")).toHaveAttribute("data-theme-mode", mode);
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", mode);
    await expect(
      page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]'),
    ).toHaveAttribute("content", theme.themeColors.light);
  });
}

test("Classic utilities and portalled admin scope consume separate tokens", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("champagnefestival:visualTheme", "classic"));
  await page.goto("/");
  await expect(page.locator("#welcome")).toBeVisible();
  const colours = await page.evaluate(() => {
    const publicProbe = document.createElement("div");
    publicProbe.className = "tw:bg-background tw:text-primary";
    const portal = document.createElement("div");
    portal.dataset.themeScope = "admin";
    portal.dataset.themeMode = "dark";
    portal.className = "tw:bg-background tw:text-primary tw:dark:font-bold";
    document.body.append(publicProbe, portal);
    const classic = {
      background: getComputedStyle(publicProbe).backgroundColor,
      primary: getComputedStyle(publicProbe).color,
    };
    document.documentElement.dataset.visualTheme = "riviera";
    document.documentElement.dataset.themeMode = "light";
    const result = {
      background: getComputedStyle(portal).backgroundColor,
      primary: getComputedStyle(portal).color,
      weight: getComputedStyle(portal).fontWeight,
    };
    publicProbe.remove();
    portal.remove();
    return { ...result, classic };
  });
  expect(colours).toEqual({
    background: "rgb(18, 18, 18)",
    primary: "rgb(90, 127, 240)",
    weight: "700",
    classic: { background: "rgb(18, 18, 18)", primary: "rgb(90, 127, 240)" },
  });
});
