import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const source = {
  dependencies: [],
  devDependencies: [],
  registryDependencies: [],
  files: [{ path: "ui/button.tsx", type: "registry:ui", content: "upstream v1" }],
};

async function fixture(t, registry = false) {
  const root = await mkdtemp(join(tmpdir(), "ui-maintenance-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "src/ui"), { recursive: true });
  await copyFile(
    new URL("./ui-maintenance.mjs", import.meta.url),
    join(root, "scripts/ui-maintenance.mjs"),
  );
  const write = (path, value) =>
    writeFile(join(root, path), typeof value === "string" ? value : json(value));
  const item = {
    files: ["src/ui/button.tsx"],
    registry: registry ? "button" : null,
    origin: "local",
    reason: "Keep owned tokens",
    reviewedAt: null,
  };
  if (registry)
    Object.assign(item, {
      capturedAt: "2026-10-24T00:00:00Z",
      upstreamSha256: createHash("sha256").update(json(source)).digest("hex"),
    });
  const inventory = {
    version: 1,
    mode: registry ? "shadcn" : "base-ui",
    style: registry ? "base-nova" : null,
    directories: ["src/ui"],
    components: { button: item },
  };
  await write("src/ui/button.tsx", "local component");
  await write("package.json", {
    dependencies: { "@base-ui/react": "^1.9.0" },
    devDependencies: registry ? { shadcn: "4.22.1" } : {},
  });
  await write("components.json", { style: "base-nova" });
  await write("ui-maintenance.json", inventory);
  await write("ui-upstream.json", registry ? { button: source } : {});
  const run = (args, response) => {
    const prelude = response
      ? [
          "--import",
          `data:text/javascript,${encodeURIComponent(`globalThis.fetch = async () => Response.json(${JSON.stringify(response)});`)}`,
        ]
      : [];
    return spawnSync(process.execPath, [...prelude, "scripts/ui-maintenance.mjs", ...args], {
      cwd: root,
      encoding: "utf8",
    });
  };
  return { root, write, run, inventory };
}

test("direct Base UI validates offline without installing shadcn", async (t) => {
  const f = await fixture(t);
  assert.equal(f.run(["check"]).status, 0);
  assert.equal(f.run(["upstream"]).status, 0);
  assert.equal(f.run(["diff", "button"]).status, 2);
});

test("new shared components cannot silently bypass provenance inventory", async (t) => {
  const f = await fixture(t);
  await f.write("src/ui/New.tsx", "new component");
  const result = f.run(["check"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Untracked UI component/);
});

test("deleted owned files invalidate the inventory", async (t) => {
  const f = await fixture(t);
  await rm(join(f.root, "src/ui/button.tsx"));
  assert.equal(f.run(["check"]).status, 2);
});

test("registry source tampering and floating CLI versions fail offline", async (t) => {
  const f = await fixture(t, true);
  assert.equal(f.run(["check"]).status, 0);
  await f.write("ui-upstream.json", { button: { ...source, dependencies: ["unexpected"] } });
  assert.equal(f.run(["check"]).status, 2);
  await f.write("ui-upstream.json", { button: source });
  await f.write("package.json", {
    dependencies: { "@base-ui/react": "^1.9.0" },
    devDependencies: { shadcn: "^4.22.1" },
  });
  assert.equal(f.run(["check"]).status, 2);
});

test("diff rejects write flags rather than forwarding them to the CLI", async (t) => {
  const f = await fixture(t, true);
  const result = f.run(["diff", "button", "--overwrite"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /flags and URLs are not accepted/);
});

test("upstream changes create a report without accepting source or altering the app", async (t) => {
  const f = await fixture(t, true);
  const previous = await readFile(join(f.root, "ui-upstream.json"), "utf8");
  const response = {
    name: "button",
    ...source,
    files: [{ ...source.files[0], content: "upstream v2" }],
  };
  assert.equal(f.run(["upstream", "button"], response).status, 1);
  assert.equal(await readFile(join(f.root, "ui-upstream.json"), "utf8"), previous);
  assert.equal(await readFile(join(f.root, "src/ui/button.tsx"), "utf8"), "local component");
  const report = JSON.parse(
    await readFile(join(f.root, ".ui-maintenance/upstream-changes.json"), "utf8"),
  );
  assert.deepEqual(report.changed, ["button"]);
});

test("record requires an explicit note and can register a reviewed component", async (t) => {
  const f = await fixture(t, true);
  assert.equal(f.run(["record", "button"]).status, 2);
  await f.write("ui-upstream.json", {});
  delete f.inventory.components.button.capturedAt;
  delete f.inventory.components.button.upstreamSha256;
  await f.write("ui-maintenance.json", f.inventory);
  const result = f.run(["record", "button", "--note", "Kept tokens; keyboard checks passed"], {
    name: "button",
    ...source,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.run(["check"]).status, 0);
  const saved = JSON.parse(await readFile(join(f.root, "ui-maintenance.json"), "utf8"));
  assert.ok(saved.components.button.reviewedAt);
  assert.equal(saved.components.button.reviewNote, "Kept tokens; keyboard checks passed");
  assert.equal(await readFile(join(f.root, "src/ui/button.tsx"), "utf8"), "local component");
});

test("unexpected registry responses fail without modifying committed baselines", async (t) => {
  const f = await fixture(t, true);
  const previous = await readFile(join(f.root, "ui-upstream.json"), "utf8");
  assert.equal(
    f.run(["record", "button", "--note", "Reviewed"], { name: "different", ...source }).status,
    2,
  );
  assert.equal(await readFile(join(f.root, "ui-upstream.json"), "utf8"), previous);
});
