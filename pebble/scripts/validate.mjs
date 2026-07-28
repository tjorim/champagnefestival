import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "wscript",
  "src/c/mdbl.c",
  "src/embeddedjs/main.js",
  "src/embeddedjs/manifest.json",
  "src/pkjs/index.js",
  "scripts/mock-server.py",
  "scripts/check-screenshot.py",
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing Alloy file: ${file}`);
}

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(
  readFileSync(resolve(root, "src/embeddedjs/manifest.json"), "utf8"),
);

if (pkg.pebble?.projectType !== "moddable") throw new Error("projectType must be moddable");
if (!pkg.dependencies?.["@moddable/pebbleproxy"]) {
  throw new Error("@moddable/pebbleproxy dependency is required");
}
if (JSON.stringify(pkg.pebble?.targetPlatforms) !== JSON.stringify(["emery", "gabbro"])) {
  throw new Error("Alloy targets must be emery and gabbro");
}
for (const key of ["API_BASE_URL", "AUTH_TOKEN"]) {
  if (!pkg.pebble?.messageKeys?.includes(key)) throw new Error(`Missing message key: ${key}`);
}
if (manifest.modules?.["*"] !== "./main") throw new Error("Embedded main module is missing");

const watchSource = readFileSync(resolve(root, "src/embeddedjs/main.js"), "utf8");
const phoneSource = readFileSync(resolve(root, "src/pkjs/index.js"), "utf8");
if (!watchSource.includes("fetch(")) throw new Error("Watch code must use Alloy fetch()");
if (!watchSource.includes("/api/pebble/registrations")) {
  throw new Error("Watch code must use the scoped Pebble registrations endpoint");
}
if (!watchSource.includes("localStorage.setItem(") || !watchSource.includes("loadSnapshot(")) {
  throw new Error("Watch code must persist and restore the offline registration snapshot");
}
if (!watchSource.includes("runExclusive(")) {
  throw new Error("Watch requests must use the exclusive-request guard");
}
if (!phoneSource.includes("@moddable/pebbleproxy")) {
  throw new Error("Phone code must initialize the official Alloy network proxy");
}
if (/,\s*[)\]]/.test(phoneSource)) {
  throw new Error("Trailing comma in src/pkjs/index.js: the SDK's PKJS bundler cannot parse it");
}
if (/Pebble\.sendAppMessage\s*\(/.test(phoneSource)) {
  throw new Error("Use moddableProxy.sendAppMessage() so sends are queued behind proxy traffic");
}

for (const file of ["src/embeddedjs/main.js", "src/pkjs/index.js"]) {
  execFileSync(process.execPath, ["--check", resolve(root, file)], { stdio: "inherit" });
}

console.log(`Validated ${pkg.pebble.displayName} Alloy package`);
