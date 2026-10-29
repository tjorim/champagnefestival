import { defineConfig, devices } from "@playwright/test";
// Exercise the production worker independently of the dev MSW worker.
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["signage.spec.ts", "public-offline.spec.ts"],
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5178" },
  webServer: {
    command: "pnpm build && pnpm exec vite preview --port 5178 --strictPort",
    url: "http://localhost:5178",
    timeout: 120_000,
  },
});
