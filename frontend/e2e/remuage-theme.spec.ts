import { expect, test } from "@playwright/test";

const STORAGE_KEY = "champagnefestival:visualTheme";

async function selectRemuageBeforeLoad(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(
    ({ key }) => {
      const seedKey = `${key}:e2e-seeded`;
      if (window.sessionStorage.getItem(seedKey) === null) {
        window.localStorage.setItem(key, "remuage");
        window.sessionStorage.setItem(seedKey, "true");
      }
    },
    { key: STORAGE_KEY },
  );
}

async function expectNoPageHorizontalScroll(page: import("@playwright/test").Page): Promise<void> {
  const scrollPosition = await page.evaluate(() => {
    window.scrollTo({ left: 100, top: window.scrollY });
    return window.scrollX;
  });
  expect(scrollPosition).toBe(0);
}

test.describe("Remuage visual theme", () => {
  test.beforeEach(async ({ page }) => {
    await selectRemuageBeforeLoad(page);
  });

  test("initializes, persists, and switches through the preview control", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("data-visual-theme", "remuage");
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "light");
    await expect(page.locator("#visual-theme-stylesheet")).toHaveAttribute(
      "href",
      /\/themes\/theme-remuage\.css$/,
    );
    await expect(page.getByRole("button", { name: "Remuage" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "New" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-visual-theme", "refresh");
    await expect(page.locator("#visual-theme-stylesheet")).toHaveAttribute(
      "href",
      /\/themes\/theme-refresh\.css$/,
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-visual-theme", "refresh");

    await page.getByRole("button", { name: "Remuage" }).click();
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY))
      .toBe("remuage");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-visual-theme", "remuage");
  });

  test("uses the full task-weighted desktop composition", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const welcome = page.locator("#welcome.remuage-hero");
    await expect(welcome).toBeVisible();
    await expect(welcome.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(welcome.locator(".remuage-hero__rack")).toBeVisible();
    await expect(welcome.locator('a[href="#next-festival"]')).toBeVisible();
    await expect(welcome.locator('a[href="#schedule"]')).toBeVisible();

    const contentBox = await welcome.locator(".remuage-hero__content").boundingBox();
    const rackBox = await welcome.locator(".remuage-hero__rack").boundingBox();
    expect(contentBox).not.toBeNull();
    expect(rackBox).not.toBeNull();
    expect(contentBox!.x).toBeGreaterThan(0);
    expect(contentBox!.x + contentBox!.width).toBeLessThanOrEqual(rackBox!.x);
    expect(rackBox!.x + rackBox!.width).toBeLessThanOrEqual(1440);

    for (const id of [
      "what-we-do",
      "next-festival",
      "schedule",
      "community-events",
      "producers",
      "faq",
      "map",
      "sponsors",
      "contact",
      "registrations",
    ]) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }

    const layout = await page.locator("main#main-content").evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return { display: styles.display, columns: styles.gridTemplateColumns };
    });
    expect(layout.display).toBe("grid");
    expect(layout.columns.split(" ").length).toBe(12);

    await expect(page.locator("#next-festival")).toHaveCSS("background-color", "rgb(72, 34, 77)");
    await expect(page.locator("#registrations")).toHaveCSS("background-color", "rgb(72, 34, 77)");
    await expect(page.locator("#community-events .alert-danger")).toHaveCount(0);
    await page.locator("#faq .accordion-button").first().click();
    await expect(page.locator("#faq .accordion-collapse.show")).toBeVisible();

    await expectNoPageHorizontalScroll(page);
  });

  test("keeps the public registration modal readable", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2027-02-01T12:00:00Z"));
    await page.goto("/");

    const registrationButton = page
      .locator("#registrations")
      .getByRole("button", { name: /Register Now|Registreer nu/i });
    await expect(registrationButton).toBeEnabled();
    await registrationButton.click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".modal-header")).toHaveCSS("background-color", "rgb(72, 34, 77)");
    await expect(modal.locator(".modal-title")).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(modal.locator(".btn-close")).toBeVisible();
    await expect(modal.locator(".modal-body")).toHaveCSS("background-color", "rgb(251, 252, 254)");

    await modal.locator("#res-name").fill("Theme Test Visitor");
    await modal.locator("#res-email").fill("theme-test@example.com");
    await modal.locator("#res-phone").fill("+32470000000");
    await modal.locator("#res-guests").fill("1");

    await page.setViewportSize({ width: 390, height: 844 });
    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();
    expect(modalBox!.x).toBeGreaterThanOrEqual(0);
    expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(390);

    await modal
      .getByRole("button", { name: /Submit Registration|Registratie indienen/i })
      .click();
    await expect(modal.getByRole("alert")).toContainText(
      /registration has been received|registratie is ontvangen/i,
    );
  });

  test("collapses cleanly and keeps mobile navigation operable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.locator("main#main-content")).toHaveCSS("display", "block");
    await expect(page.getByRole("combobox", { name: /visual design preview/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remuage" })).not.toBeVisible();
    const rack = page.locator(".remuage-hero__rack");
    const heroContent = page.locator(".remuage-hero__content");
    await expect(rack).toBeVisible();

    const headerBox = await page.locator(".site-header").boundingBox();
    const contentBox = await heroContent.boundingBox();
    const rackBox = await rack.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(rackBox).not.toBeNull();
    expect(contentBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
    expect(contentBox!.x).toBeGreaterThanOrEqual(0);
    expect(contentBox!.x + contentBox!.width).toBeLessThanOrEqual(390);
    expect(rackBox!.x).toBeGreaterThanOrEqual(0);
    expect(rackBox!.x + rackBox!.width).toBeLessThanOrEqual(390);

    const menu = page.locator(".site-mobile-menu");
    const menuButton = page.locator(".site-menu-button");
    await expect(menuButton).toBeVisible();
    await expect(menu).not.toBeVisible();
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveClass(/is-open/);
    const firstMobileLinkBox = await menu.locator(".site-mobile-link").first().boundingBox();
    expect(firstMobileLinkBox).not.toBeNull();
    expect(firstMobileLinkBox!.x).toBeGreaterThanOrEqual(0);
    expect(firstMobileLinkBox!.x + firstMobileLinkBox!.width).toBeLessThanOrEqual(390);
    await page.keyboard.press("Escape");
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(menu).not.toBeVisible();

    await expectNoPageHorizontalScroll(page);
  });

  test("remains usable at the 320px minimum width", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");

    await expect(page.getByRole("group", { name: /visual design preview switcher/i })).toBeVisible();
    await expect(page.locator(".remuage-hero__actions a")).toHaveCount(2);
    await expectNoPageHorizontalScroll(page);
  });

  test("applies to standalone visitor and admin routes", async ({ page }) => {
    test.setTimeout(60_000);
    const routes = [
      { path: "/privacy", heading: "#privacy-policy" },
      { path: "/check-in", heading: "#checkin-title" },
      { path: "/my-registrations", heading: "#my-registrations-title" },
      { path: "/admin", heading: "#admin" },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.locator("html")).toHaveAttribute("data-visual-theme", "remuage");
      await expect(page.locator(route.heading)).toBeVisible({ timeout: 10_000 });
    }
  });

  test("applies the admin warning-title cascade outside the admin root", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("#admin")).toBeVisible();
    await page.locator("body").evaluate((body) => {
      body.insertAdjacentHTML(
        "beforeend",
        '<div class="admin-dialog"><div class="modal-header"><h2 class="modal-title text-warning">Admin modal</h2></div></div>',
      );
    });

    await expect(page.locator(".admin-dialog .modal-title.text-warning")).toHaveCSS(
      "color",
      "rgb(255, 255, 255)",
    );
  });

  test("respects reduced motion for the signature interaction", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await page.locator(".remuage-button--primary").focus();
    await expect(page.locator(".remuage-hero__disc").first()).toHaveCSS("transform", "none");

    const carouselState = await page.locator("#producers .swiper").evaluate((element) => {
      const swiperElement = element as HTMLElement & {
        swiper?: { autoplay?: { running?: boolean }; params?: { speed?: number } };
      };
      return {
        autoplayRunning: swiperElement.swiper?.autoplay?.running,
        speed: swiperElement.swiper?.params?.speed,
      };
    });
    expect(carouselState).toEqual({ autoplayRunning: false, speed: 0 });
  });
});
