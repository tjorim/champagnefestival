import { paraglideVitePlugin } from "@inlang/paraglide-js";
import reactPlugin from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Paraglide 3 compiles messages to virtual modules and rewrites `m.key()` calls in the importing
// source, which bypasses `vi.mock("@/paraglide/messages")` and leaves the mocked runtime without
// the exports the generated code needs. Tests therefore compile real message modules into their
// own directory (so the build, dev server and `tsc` keep using `src/paraglide`) and `@/paraglide`
// resolves there during tests. Remove this when the mocks no longer need it.
const paraglideTestDir = resolve(import.meta.dirname, ".vitest/paraglide");

export default defineConfig({
  plugins: [
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- paraglide plugin types don't match vitest's plugin type
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: paraglideTestDir,
      outputStructure: "message-modules",
      strategy: ["custom-localePath", "localStorage", "preferredLanguage", "baseLocale"],
    }) as any,
    reactPlugin(),
  ],
  resolve: {
    alias: [
      { find: /^@\/paraglide(\/|$)/, replacement: `${paraglideTestDir}$1` },
      { find: "@", replacement: resolve(import.meta.dirname, "src") },
    ],
  },
  test: {
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        settings: { device: { prefersColorScheme: "dark" } },
      },
    },
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/paraglide/**", "src/main.tsx", "src/assets/**"],
    },
  },
});
