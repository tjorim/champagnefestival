import { resolve } from "node:path";
import { defineConfig } from "vite";

// Separate build pass for the service worker (src/sw.ts), run as a second
// step after the main `vite build` (see package.json's "build" script and
// docs/decisions/941-web-push-foundation.md). It needs its own config
// because it must ship as a single classic script — `format: "iife"` — so it
// registers on browsers without module-service-worker support (notably
// Safari), unlike the main app bundle, which is ESM.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rolldownOptions: {
      input: resolve(import.meta.dirname, "src/sw.ts"),
      output: {
        format: "iife",
        entryFileNames: "sw.js",
      },
    },
  },
});
