import { createHash } from "node:crypto";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { recoverRecord, saveRecord } from "./ui-record-store.mjs";

const log = (message) => process.stdout.write(`${message}\n`);

// Version 1. Keep this small, dependency-free tool consistent across the apps.
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => {
  throw new Error(message);
};
const localPath = (path) => {
  const result = resolve(root, path);
  const rel = relative(root, result);
  if (isAbsolute(path) || rel.startsWith("..")) fail(`Path outside frontend: ${path}`);
  return result;
};

async function componentFiles(directory) {
  const files = [];
  for (const item of await readdir(localPath(directory), { withFileTypes: true })) {
    const path = `${directory}/${item.name}`;
    if (item.isDirectory()) files.push(...(await componentFiles(path)));
    else if (/\.[jt]sx?$/.test(item.name) && !/\.(test|spec)\./.test(item.name)) files.push(path);
  }
  return files;
}

// Store only source and dependency declarations, not volatile registry metadata.
function snapshot(item) {
  if (!Array.isArray(item.files) || item.files.some((file) => typeof file.content !== "string")) {
    fail("Registry response has no source files");
  }
  return {
    dependencies: [...(item.dependencies ?? [])].sort(),
    devDependencies: [...(item.devDependencies ?? [])].sort(),
    registryDependencies: [...(item.registryDependencies ?? [])].sort(),
    files: item.files
      .map(({ path, type, content }) => ({ path, type, content }))
      .sort((a, b) => a.path.localeCompare(b.path, "en")),
  };
}

async function upstream(style, name) {
  const response = await fetch(`https://ui.shadcn.com/r/styles/${style}/${name}.json`, {
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (!response.ok) fail(`Registry ${name}: HTTP ${response.status}`);
  const item = await response.json();
  if (item.name !== name) fail(`Registry returned ${item.name} for ${name}`);
  return snapshot(item);
}

async function run() {
  const [command = "check", ...args] = process.argv.slice(2);
  if (await recoverRecord(root)) log("Recovered an interrupted UI review record.");
  const inventoryText = await readFile(resolve(root, "ui-maintenance.json"), "utf8");
  const baselinesText = await readFile(resolve(root, "ui-upstream.json"), "utf8");
  const inventory = JSON.parse(inventoryText);
  const pkg = await readJson("package.json");
  const baselines = JSON.parse(baselinesText);
  if (inventory.version !== 1) fail("Unsupported UI inventory version");
  if (!pkg.dependencies?.["@base-ui/react"]) fail("Missing Base UI runtime dependency");
  const entries = inventory.components;
  const registry = Object.entries(entries).filter(([, item]) => item.registry);
  if (inventory.mode === "shadcn") {
    const config = await readJson("components.json");
    if (config.style !== inventory.style || !/^base-[a-z]+$/.test(inventory.style))
      fail("Registry style mismatch");
    if (!/^\d+\.\d+\.\d+$/.test(pkg.devDependencies?.shadcn ?? ""))
      fail("Pin shadcn to an exact devDependency version");
  } else if (inventory.mode !== "base-ui" || registry.length)
    fail("Invalid direct Base UI inventory");
  const covered = new Set();
  for (const [name, item] of Object.entries(entries)) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name) ||
      !item.reason ||
      !item.origin ||
      !item.files?.length
    )
      fail(`Incomplete component: ${name}`);
    for (const path of item.files) {
      if (covered.has(path)) fail(`Duplicate component path: ${path}`);
      covered.add(path);
      await readFile(localPath(path));
    }
    if (item.registry) {
      if (item.registry !== name) fail(`Registry name mismatch: ${name}`);
      const registering = command === "record" && args[0] === name && !baselines[name];
      if (!registering && (!baselines[name] || item.upstreamSha256 !== hash(json(baselines[name]))))
        fail(`Invalid upstream baseline: ${name}`);
      if (!registering && !item.capturedAt) fail(`Missing capture date: ${name}`);
    }
    if (item.reviewedAt && (!item.reviewNote || !item.reviewedLocalSha256))
      fail(`Incomplete review record: ${name}`);
  }
  for (const name of Object.keys(baselines)) {
    if (!entries[name]?.registry) fail(`Orphan upstream baseline: ${name}`);
  }
  for (const directory of inventory.directories) {
    for (const path of await componentFiles(directory)) {
      if (!covered.has(path))
        fail(`Untracked UI component: ${path}. Add its origin and maintenance decision.`);
    }
  }
  if (command === "check") {
    const pending = registry.filter(([, item]) => !item.reviewedAt).length;
    log(
      `UI inventory valid: ${Object.keys(entries).length} components; ${pending} captured baselines await source review.`,
    );
    for (const [name, item] of Object.entries(entries)) {
      if (item.reviewedAt) {
        const current = hash(
          json(
            await Promise.all(
              item.files.map(async (path) => [path, await readFile(localPath(path), "utf8")]),
            ),
          ),
        );
        if (current !== item.reviewedLocalSha256)
          log(
            `${name}: local source changed since ${item.reviewedAt}; review record is historical.`,
          );
      }
    }
    return;
  }
  if (!["upstream", "diff", "record"].includes(command))
    fail("Use check, upstream [names], diff [names], or record <name> --note <decision>");
  if (!registry.length) {
    if (command !== "upstream" || args.length)
      fail("This app uses Base UI directly; no shadcn registry components");
    log(
      "Direct Base UI: review runtime release notes and the documented dialog interaction tests.",
    );
    return;
  }
  const noteIndex = args.indexOf("--note");
  const names = command === "record" ? args.slice(0, noteIndex < 0 ? undefined : noteIndex) : args;
  if (names.some((name) => !entries[name]?.registry))
    fail("Choose registry components from ui-maintenance.json; flags and URLs are not accepted");
  const selected = names.length ? names : registry.map(([name]) => name);
  if (command === "diff") {
    const result = spawnSync(
      process.execPath,
      [createRequire(import.meta.url).resolve("shadcn"), "add", ...selected, "--dry-run", "--diff"],
      { cwd: root, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    return;
  }
  if (
    command === "record" &&
    (names.length !== 1 || noteIndex !== 1 || args.length !== 3 || !args[2].trim())
  ) {
    fail("After review and tests: record <name> --note <decision and validation>");
  }
  // Fetch all selected items before changing any committed review state.
  const current = {};
  for (const name of selected) current[name] = await upstream(inventory.style, name);
  if (command === "record") {
    const name = selected[0];
    baselines[name] = current[name];
    Object.assign(entries[name], {
      upstreamSha256: hash(json(current[name])),
      capturedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      reviewNote: args[2],
      reviewedLocalSha256: hash(
        json(
          await Promise.all(
            entries[name].files.map(async (path) => [
              path,
              await readFile(localPath(path), "utf8"),
            ]),
          ),
        ),
      ),
    });
    await saveRecord(
      root,
      { "ui-upstream.json": baselinesText, "ui-maintenance.json": inventoryText },
      { "ui-upstream.json": json(baselines), "ui-maintenance.json": json(inventory) },
    );
    log(`Recorded ${name}. Review and commit the metadata diff with the associated change.`);
    return;
  }
  const changed = selected.filter(
    (name) => hash(json(current[name])) !== entries[name].upstreamSha256,
  );
  const report = resolve(root, ".ui-maintenance");
  await mkdir(report, { recursive: true });
  await writeFile(resolve(report, "upstream-current.json"), json(current));
  await writeFile(
    resolve(report, "upstream-changes.json"),
    json({ checkedAt: new Date().toISOString(), selected, changed }),
  );
  log(`${changed.length} upstream component definitions changed: ${changed.join(", ") || "none"}`);
  log("Read-only report: .ui-maintenance/. Compare source with pnpm ui:diff <name>.");
  process.exitCode = changed.length ? 1 : 0;
}

try {
  await run();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
