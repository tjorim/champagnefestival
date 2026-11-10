import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
const baseURL = "http://localhost:4191";
export default defineConfig({
  ...base,
  workers: 1,
  use: { ...base.use, baseURL },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    ...["firefox", "webkit"].flatMap((browser) => {
      const use = {
        ...devices[browser === "firefox" ? "Desktop Firefox" : "Desktop Safari"],
        ...(browser === "firefox" && process.env.REMOTE_FIREFOX_WS_ENDPOINT
          ? { connectOptions: { wsEndpoint: process.env.REMOTE_FIREFOX_WS_ENDPOINT } }
          : {}),
        ...(browser === "webkit" && process.env.REMOTE_WEBKIT_WS_ENDPOINT
          ? { connectOptions: { wsEndpoint: process.env.REMOTE_WEBKIT_WS_ENDPOINT } }
          : {}),
      };
      return [
        { name: browser, testMatch: "**/registration.spec.ts", use },
        {
          name: browser + "-admin",
          testMatch: "**/message-editors.authenticated.spec.ts",
          dependencies: ["setup"],
          use: { ...use, storageState: "e2e/.auth/admin.json" },
        },
      ];
    }),
  ],
  webServer: {
    ...base.webServer,
    command: `pnpm exec vite ${process.env.COMPATIBILITY_NATIVE_REACT ? "-c vite.compatibility.config.ts" : ""} --no-open --port 4191 --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
