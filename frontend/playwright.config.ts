import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /\.authenticated\.spec\.ts/,
    },
    // Specs matching *.authenticated.spec.ts run pre-logged-in as the admin
    // dev-bypass user (see e2e/auth.setup.ts) instead of hitting the real
    // Keycloak login flow.
    {
      name: "chromium-admin",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      testMatch: /\.authenticated\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `pnpm exec vite --no-open --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_MSW: "true",
    },
  },
});
