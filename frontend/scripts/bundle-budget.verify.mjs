import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { measureBundle, exceededBudgets, run } from "./bundle-budget.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "bundle-budget-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "assets/nested"), { recursive: true });
  const files = {
    "index.html": `<link href='/admin/assets/preload.js' rel='modulepreload'><script src='/admin/assets/index.js?v=1' type='module'></script>`,
    "assets/index.js": `import './nested/shared.js'; export { value } from './other.js'; export * from './other.js'; import('./lazy.js'); const fake = 'import "./not-real.js"';`,
    "assets/nested/shared.js": `import '../other.js'; export const shared = 1;`,
    "assets/other.js": `import './nested/shared.js'; export const value = 2;`,
    "assets/preload.js": `export const preloaded = 3;`,
    "assets/lazy.js": `import './oidc-vendor.js'; export const lazy = 4;`,
    "assets/oidc-vendor.js": `export const token = 5;`,
    "assets/worker.mjs": `self.onmessage = () => {};`,
    "sw.js": `// not an application asset`,
  };
  for (const [file, source] of Object.entries(files)) await writeFile(join(root, file), source);
  const config = {
    base: "/admin/",
    entries: { main: "index.html" },
    budgets: {},
    forbidInitial: { main: ["oidc-vendor"] },
  };
  return { root, files, config };
}

test("initial closure deduplicates cycles, follows re-exports, parent paths and modulepreloads; excludes dynamic imports", async (t) => {
  const { root, files, config } = await fixture(t);
  const report = measureBundle(root, config);
  const initial = [
    "assets/index.js",
    "assets/nested/shared.js",
    "assets/other.js",
    "assets/preload.js",
  ];
  assert.deepEqual(report.entries.main.files, initial);
  assert.equal(
    report.entries.main.raw,
    initial.reduce((n, file) => n + Buffer.byteLength(files[file]), 0),
  );
  assert.equal(
    report.entries.main.gzip,
    initial.reduce((n, file) => n + gzipSync(files[file], { level: 6 }).length, 0),
  );
  assert.equal(report.total.files.length, 7);
  assert.ok(report.total.files.includes("assets/worker.mjs"));
  assert.ok(!report.total.files.includes("sw.js"));
});

test("root and relative asset URLs, independent entries and external assets", async (t) => {
  const f = await fixture(t);
  f.config.entries.other = "other.html";
  await writeFile(
    join(f.root, "other.html"),
    `<script type="module" src="assets/lazy.js"></script><script type="module" src="https://cdn.example/app.js"></script>`,
  );
  const report = measureBundle(f.root, f.config);
  assert.deepEqual(report.entries.other.files, ["assets/lazy.js", "assets/oidc-vendor.js"]);
  await writeFile(
    join(f.root, "index.html"),
    `<script type="module" src="/assets/index.js"></script>`,
  );
  delete f.config.base;
  assert.equal(measureBundle(f.root, f.config).entries.main.files.length, 3);
});

test("missing imports fail instead of silently undercounting", async (t) => {
  const f = await fixture(t);
  await rm(join(f.root, "assets/other.js"));
  assert.throws(() => measureBundle(f.root, f.config), /ENOENT/);
});

test("missing local entry scripts and assets outside the base fail", async (t) => {
  const f = await fixture(t);
  await writeFile(
    join(f.root, "index.html"),
    `<script type="module" src="https://example.com/app.js"></script>`,
  );
  assert.throws(() => measureBundle(f.root, f.config), /No local module/);
  await writeFile(
    join(f.root, "index.html"),
    `<script type="module" src="/elsewhere/app.js"></script>`,
  );
  assert.throws(() => measureBundle(f.root, f.config), /outside configured base/);
});

test("forbidden dependencies are allowed lazily but rejected through an initial dependency", async (t) => {
  const f = await fixture(t);
  measureBundle(f.root, f.config);
  await writeFile(join(f.root, "assets/other.js"), `import './oidc-vendor.js';`);
  assert.throws(() => measureBundle(f.root, f.config), /Forbidden initial asset/);
});

test("chunk limits aggregate matches and require the budgeted chunk to exist", async (t) => {
  const f = await fixture(t);
  f.config.budgets.chunks = [{ name: "lazy", pattern: "assets/lazy\\.js$", raw: 1 }];
  const report = measureBundle(f.root, f.config);
  assert.equal(exceededBudgets(report, f.config).length, 1);
  f.config.budgets.chunks[0].pattern = "missing";
  assert.throws(() => measureBundle(f.root, f.config), /Missing budgeted chunk/);
});

test("budget equality passes; one byte of growth fails even outside the entry script", async (t) => {
  const f = await fixture(t);
  const report = measureBundle(f.root, f.config);
  f.config.budgets = {
    entries: {
      main: {
        raw: report.entries.main.raw,
        gzip: report.entries.main.gzip,
        entryRaw: report.entries.main.entryRaw,
      },
    },
    total: { raw: report.total.raw, gzip: report.total.gzip },
  };
  assert.deepEqual(exceededBudgets(report, f.config), []);
  f.config.budgets.entries.main.raw -= 1;
  f.config.budgets.total.gzip -= 1;
  assert.equal(exceededBudgets(report, f.config).length, 2);
});

test("invalid budgets and unknown entries fail closed", async (t) => {
  const f = await fixture(t);
  f.config.budgets.entries = { typo: { raw: 100 } };
  assert.throws(() => measureBundle(f.root, f.config), /Unknown budget entry/);
  f.config.budgets.entries = { main: { gzpi: 100 } };
  assert.throws(() => measureBundle(f.root, f.config), /Invalid budget/);
  f.config.budgets.entries = { main: { raw: -1 } };
  assert.throws(() => measureBundle(f.root, f.config), /Invalid budget/);
  assert.throws(() => run(f.root, ["--typo"]), /Usage:/);
});

test("report JSON and check failures use the same measurements; empty checks are rejected", async (t) => {
  const f = await fixture(t);
  const app = await mkdtemp(join(tmpdir(), "bundle-app-"));
  t.after(() => rm(app, { recursive: true, force: true }));
  await mkdir(join(app, "dist/assets/nested"), { recursive: true });
  for (const [file, source] of Object.entries(f.files))
    await writeFile(join(app, "dist", file), source);
  const output = [];
  const out = (value) => output.push(value);
  await writeFile(join(app, "bundle-budget.json"), JSON.stringify(f.config));
  run(app, ["--json"], out);
  assert.equal(JSON.parse(output.pop()).entries.main.files.length, 4);
  assert.throws(() => run(app, ["--check"]), /No budgets configured/);
  f.config.budgets = { total: { raw: 1 } };
  await writeFile(join(app, "bundle-budget.json"), JSON.stringify(f.config));
  assert.throws(() => run(app, ["--check", "--json"], out), /total JS raw/);
  assert.equal(JSON.parse(output.pop()).failures.length, 1);
});

test("invalid JavaScript and unresolved bare imports fail instead of shrinking the graph", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.root, "assets/other.js"), "export const = broken;");
  assert.throws(() => measureBundle(f.root, f.config), /Invalid JavaScript/);
  await writeFile(join(f.root, "assets/other.js"), 'import "unbundled-package";');
  assert.throws(() => measureBundle(f.root, f.config), /Unbundled import/);
});
