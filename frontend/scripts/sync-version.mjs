// Keeps package.json's "version" field in sync with the repo-root VERSION
// file (single source of truth, shared with the backend and Android). Nothing
// reads package.json's version at runtime — this only exists so the field
// isn't a second, independently hand-maintained number.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = dirname(dirname(fileURLToPath(import.meta.url)));
const rootDir = dirname(frontendDir);

const version = readFileSync(join(rootDir, "VERSION"), "utf8").trim();
const pkgPath = join(frontendDir, "package.json");
const pkgText = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(pkgText);

if (pkg.version !== version) {
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`Synced frontend/package.json version -> ${version}`);
}
