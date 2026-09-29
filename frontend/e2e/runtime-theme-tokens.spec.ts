import { expect, test } from "@playwright/test";
import themes from "../src/config/visualThemes.json" with { type: "json" };

for (const preference of ["light", "dark"] as const) {
  for (const theme of themes) {
    test(`${theme.value} applies metadata before React loads (${preference})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: preference });
      await page.addInitScript(
        (variant) => localStorage.setItem("champagnefestival:visualTheme", variant),
        theme.value,
      );
      await page.route("**/src/main.tsx", (route) => route.abort());
      await page.goto("/");
      const mode = theme.bootstrapMode === "system" ? preference : theme.bootstrapMode;
      await expect(page.locator("html")).toHaveAttribute("data-visual-theme", theme.value);
      await expect(page.locator("html")).toHaveAttribute("data-theme-mode", mode);
      await expect(page.locator("html")).toHaveAttribute("data-bs-theme", mode);
      for (const chromeMode of ["light", "dark"] as const) {
        await expect(
          page.locator(`meta[name="theme-color"][media="(prefers-color-scheme: ${chromeMode})"]`),
        ).toHaveAttribute("content", theme.themeColors[chromeMode]);
      }
    });
  }
}

test("Classic utilities and portalled admin scope consume separate tokens", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("champagnefestival:visualTheme", "classic"));
  await page.goto("/");
  await expect(page.locator("#welcome")).toBeVisible();
  const colors = await page.evaluate(() => {
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
  expect(colors).toEqual({
    background: "rgb(18, 18, 18)",
    primary: "rgb(90, 127, 240)",
    weight: "700",
    classic: { background: "rgb(18, 18, 18)", primary: "rgb(90, 127, 240)" },
  });
});

const palettes = {
  refresh: {
    light: [
      "rgb(251, 244, 230)",
      "rgb(35, 29, 22)",
      "rgb(155, 111, 31)",
      "rgb(141, 47, 61)",
      "rgb(255, 249, 238)",
      "rgb(98, 86, 66)",
    ],
    dark: [
      "rgb(16, 15, 13)",
      "rgb(251, 246, 236)",
      "rgb(216, 173, 86)",
      "rgb(141, 47, 61)",
      "rgb(27, 24, 20)",
      "rgb(207, 195, 176)",
    ],
  },
  classic: [
    "rgb(18, 18, 18)",
    "rgb(240, 240, 240)",
    "rgb(90, 127, 240)",
    "rgb(154, 93, 246)",
    "rgb(30, 30, 30)",
    "rgb(197, 197, 197)",
  ],
  riviera: [
    "rgb(247, 236, 210)",
    "rgb(18, 50, 59)",
    "rgb(0, 127, 131)",
    "rgb(255, 116, 72)",
    "rgb(255, 250, 240)",
    "rgb(95, 118, 128)",
  ],
  cuvee: [
    "rgb(12, 35, 29)",
    "rgb(36, 31, 20)",
    "rgb(138, 100, 20)",
    "rgb(18, 50, 42)",
    "rgb(250, 245, 230)",
    "rgb(95, 88, 68)",
  ],
  remuage: [
    "rgb(237, 241, 245)",
    "rgb(23, 32, 51)",
    "rgb(33, 68, 178)",
    "rgb(72, 34, 77)",
    "rgb(251, 252, 254)",
    "rgb(88, 101, 119)",
  ],
} as const;

async function addColorProbes(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const probes = [
      "tw:bg-background",
      "tw:text-foreground",
      "tw:text-primary",
      "tw:text-secondary",
      "tw:bg-muted",
      "tw:text-muted-foreground",
      "tw:bg-card",
      "tw:bg-popover",
      "tw:font-normal tw:dark:font-bold",
    ];
    for (const [index, classes] of probes.entries()) {
      const probe = document.createElement("div");
      probe.id = `token-probe-${index}`;
      probe.className = classes;
      document.body.append(probe);
    }
  });
}

async function expectPalette(
  page: import("@playwright/test").Page,
  colors: readonly string[],
  dark: boolean,
) {
  for (const [index, color] of colors.entries()) {
    await expect(page.locator(`#token-probe-${index}`)).toHaveCSS(
      index === 0 || index === 4 ? "background-color" : "color",
      color,
    );
  }
  await expect(page.locator("#token-probe-6")).toHaveCSS("background-color", colors[4]!);
  await expect(page.locator("#token-probe-7")).toHaveCSS("background-color", colors[4]!);
  await expect(page.locator("#token-probe-8")).toHaveCSS("font-weight", dark ? "700" : "400");
}

for (const preference of ["light", "dark"] as const) {
  for (const variant of ["refresh", "classic", "riviera", "cuvee", "remuage"] as const) {
    test(`${variant} resolves concrete utility colors and dark variant (${preference})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: preference });
      await page.addInitScript(
        (theme) => localStorage.setItem("champagnefestival:visualTheme", theme),
        variant,
      );
      await page.goto("/");
      await expect(page.locator("#welcome")).toBeVisible();
      await addColorProbes(page);
      const unresolved = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return [
          "background",
          "foreground",
          "primary",
          "primary-foreground",
          "secondary",
          "muted",
          "muted-foreground",
          "border",
          "destructive",
        ].filter((token) => !style.getPropertyValue(`--surface-${token}`).trim());
      });
      expect(unresolved).toEqual([]);
      const colors = variant === "refresh" ? palettes.refresh[preference] : palettes[variant];
      await expectPalette(
        page,
        colors,
        variant === "classic" || (variant === "refresh" && preference === "dark"),
      );
    });
  }
}

test("Refresh updates colors and dark utilities when the system preference changes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("champagnefestival:visualTheme", "refresh"));
  await page.goto("/");
  await expect(page.locator("#welcome")).toBeVisible();
  await addColorProbes(page);
  for (const preference of ["light", "dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: preference });
    await expect(page.locator("html")).toHaveAttribute("data-theme-mode", preference);
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", preference);
    await expectPalette(page, palettes.refresh[preference], preference === "dark");
  }
});
