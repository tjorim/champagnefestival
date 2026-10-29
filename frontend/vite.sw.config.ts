import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Separate build pass for the service worker (src/sw.ts), run as a second
// step after the main `vite build` (see package.json's "build" script and
// docs/decisions/941-web-push-foundation.md). It needs its own config
// because it must ship as a single classic script — `format: "iife"` — so it
// registers on browsers without module-service-worker support (notably
// Safari), unlike the main app bundle, which is ESM.
const dist = resolve(import.meta.dirname, "dist");
const shell = readdirSync(dist, { recursive: true, encoding: "utf8" })
  .filter(
    (path) =>
      path === "index.html" ||
      path === "site.webmanifest" ||
      /^(assets|themes|images|fonts|icons)\//.test(path),
  )
  .filter((path) => !path.endsWith(".map") && /\.[^/]+$/.test(path))
  .sort();
const revision = createHash("sha256");
for (const path of shell) revision.update(path).update(readFileSync(resolve(dist, path)));
export default defineConfig({
  define: {
    __PUBLIC_CACHE_VERSION__: JSON.stringify(revision.digest("hex").slice(0, 16)),
    __PUBLIC_SHELL__: JSON.stringify(shell.map((path) => "/" + path)),
  },
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
