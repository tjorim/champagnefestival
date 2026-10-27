import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureBundle, exceededBudgets, budgets } from "./bundle-budget.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "bundle-budget-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".vite"));
  await mkdir(join(root, "assets"));
  const manifest = {
    "index.html": {
      isEntry: true,
      file: "assets/index.js",
      imports: ["shared", "other"],
      dynamicImports: ["admin"],
    },
    shared: { file: "assets/shared.js", imports: ["other"] },
    other: { file: "assets/other.js", imports: ["shared"] },
    admin: { file: "assets/AdminDashboard-test.js" },
  };
  for (const [name, size] of Object.entries({
    "index.js": 10,
    "shared.js": 20,
    "other.js": 30,
    "AdminDashboard-test.js": 40,
  })) {
    await writeFile(join(root, "assets", name), "x".repeat(size));
  }
  const save = () => writeFile(join(root, ".vite/manifest.json"), JSON.stringify(manifest));
  await save();
  return { root, manifest, save };
}

test("eager budget counts shared imports once, handles cycles and excludes dynamic routes", async (t) => {
  const { root } = await fixture(t);
  assert.deepEqual(await measureBundle(root), { entry: 10, eager: 60, admin: 40, total: 100 });
});

test("missing manifest dependencies fail instead of undercounting", async (t) => {
  const f = await fixture(t);
  delete f.manifest.shared;
  await f.save();
  await assert.rejects(measureBundle(f.root), /Missing imported chunk/);
});

test("moving code out of the entry cannot bypass the eager budget", () => {
  const sizes = Object.fromEntries(
    Object.entries(budgets).map(([name, limit]) => [name, limit * 1024]),
  );
  assert.deepEqual(exceededBudgets(sizes), []);
  sizes.entry -= 100;
  sizes.eager += 1;
  assert.deepEqual(
    exceededBudgets(sizes).map(([name]) => name),
    ["eager"],
  );
});

test("OIDC is allowed behind a dynamic import but never an eager dependency", async (t) => {
  const f = await fixture(t);
  f.manifest.oidc = { file: "assets/oidc-vendor-test.js" };
  await writeFile(join(f.root, "assets/oidc-vendor-test.js"), "runtime");
  f.manifest["index.html"].dynamicImports.push("oidc");
  await f.save();
  await measureBundle(f.root);
  f.manifest.shared.imports.push("oidc");
  await f.save();
  await assert.rejects(measureBundle(f.root), /OIDC runtime must not/);
});
