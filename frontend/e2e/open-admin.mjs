/**
 * Manual debugging helper: opens a real, visible Chromium window already
 * logged in as the admin dev-bypass user, using the storageState produced by
 * auth.setup.ts. Not part of the test suite — run it directly when you want
 * to poke at the admin dashboard locally without clicking through Keycloak.
 *
 * Usage:
 *   pnpm dev                                  # in one terminal
 *   pnpm exec playwright test --project=setup # once, to (re)generate the storageState
 *   node e2e/open-admin.mjs                   # in another terminal
 *
 * Set DEV_AUTH_BYPASS_TOKEN before both the setup step and the backend
 * (`uv run uvicorn app.main:app --reload`) to the same value if you also want
 * real API calls to authenticate — the setup step already falls back to a
 * fixed placeholder token if that env var isn't set, which is fine for UI-only
 * work against the MSW mocks (VITE_MSW=true).
 */
import { chromium } from "@playwright/test";

const authFile = "e2e/.auth/admin.json";
const baseURL = process.env.BASE_URL ?? "http://localhost:5173";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();
await page.goto(`${baseURL}/admin`);
console.log(`Admin dashboard open at ${baseURL}/admin — close the window to exit.`);
await new Promise((resolve) => {
  browser.on("disconnected", () => resolve());
});
