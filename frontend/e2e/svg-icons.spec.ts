import { expect, test } from "@playwright/test";

for (const theme of ["refresh", "classic", "riviera", "cuvee", "remuage"]) {
  test(`SVG icons inherit ${theme} colours without loading the icon font`, async ({ page }) => {
    const fontRequests: string[] = [];
    page.on("request", (request) => {
      if (/bootstrap-icons|bootstrap-icons\.(woff2?|ttf)/.test(request.url())) {
        fontRequests.push(request.url());
      }
    });
    await page.addInitScript((variant) => {
      localStorage.setItem("champagnefestival:visualTheme", variant);
    }, theme);
    await page.goto("/");
    const icon = page.locator(".lucide-circle-arrow-down").first();
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute("aria-hidden", "true");
    await expect(icon).toHaveAttribute("focusable", "false");
    await expect(icon).toHaveAttribute("width", "1em");
    const styles = await icon.evaluate((svg) => {
      const style = getComputedStyle(svg);
      return {
        colour: style.color,
        stroke: style.stroke,
        width: svg.getBoundingClientRect().width,
      };
    });
    expect(styles.stroke).toBe(styles.colour);
    expect(styles.colour).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.width).toBeGreaterThan(0);
    await expect(page.locator(".bi")).toHaveCount(0);
    expect(fontRequests).toEqual([]);
  });
}
