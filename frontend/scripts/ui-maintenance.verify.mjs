import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

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
  for (const file of ["ui-maintenance.mjs", "ui-record-store.mjs"]) {
    await copyFile(new URL(`./${file}`, import.meta.url), join(root, "scripts", file));
  }
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
  await copyFile(
    new URL("./fixtures/ui-maintenance-fetch-mock.mjs", import.meta.url),
    join(root, "fetch-mock.mjs"),
  );
  await copyFile(
    new URL("./fixtures/ui-maintenance-record-failure.mjs", import.meta.url),
    join(root, "record-failure.mjs"),
  );
  const run = (args, response, entryPoint = "scripts/ui-maintenance.mjs", options = {}) => {
    const env = { ...process.env, ...options.env };
    delete env.UI_MAINTENANCE_TEST_RESPONSE;
    const prelude =
      response !== undefined ? ["--import", pathToFileURL(join(root, "fetch-mock.mjs")).href] : [];
    if (options.preload) prelude.push("--import", pathToFileURL(join(root, options.preload)).href);
    if (response !== undefined) env.UI_MAINTENANCE_TEST_RESPONSE = JSON.stringify(response);
    return spawnSync(process.execPath, [...prelude, entryPoint, ...args], {
      cwd: root,
      encoding: "utf8",
      env,
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

test("mock response JSON stays inert, preserves own prototype keys, and is isolated per child", async (t) => {
  const f = await fixture(t, true);
  await f.write(
    "fetch-probe.mjs",
    `
    const response = await (await fetch("https://example.invalid/fixture")).json();
    process.stdout.write(JSON.stringify({
      response,
      fixtureEnvCleared: !Object.hasOwn(process.env, "UI_MAINTENANCE_TEST_RESPONSE"),
      injected: Object.hasOwn(globalThis, "uiMaintenanceInjected"),
    }));
  `,
  );
  const payload = JSON.parse('{"__proto__":{"polluted":true}}');
  payload.content = '"; globalThis.uiMaintenanceInjected = true; // </script>\\\n\u2028\u2029';
  const first = f.run([], payload, "fetch-probe.mjs");
  assert.equal(first.status, 0, first.stderr);
  const observed = JSON.parse(first.stdout);
  assert.deepEqual(observed.response, payload);
  assert.equal(Object.hasOwn(observed.response, "__proto__"), true);
  assert.equal(observed.injected, false);
  assert.equal(observed.fixtureEnvCleared, true);
  const second = f.run([], { content: "ordinary second response" }, "fetch-probe.mjs");
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(second.stdout).response, { content: "ordinary second response" });
});

test("diff launches the installed CLI with Node, preserves arguments and propagates its exit status", async (t) => {
  const f = await fixture(t, true);
  const cliDirectory = join(f.root, "node_modules", "shadcn");
  await mkdir(cliDirectory, { recursive: true });
  await f.write("node_modules/shadcn/package.json", {
    name: "shadcn",
    type: "module",
    exports: "./cli with spaces.mjs",
  });
  await f.write(
    "node_modules/shadcn/cli with spaces.mjs",
    `
    process.stdout.write(JSON.stringify({ executable: process.execPath, args: process.argv.slice(2) }));
    process.exitCode = Number(process.env.UI_MAINTENANCE_CLI_EXIT ?? 0);
  `,
  );
  const result = f.run(["diff", "button"]);
  assert.equal(result.status, 0, result.stderr);
  const observed = JSON.parse(result.stdout);
  assert.equal(observed.executable, process.execPath);
  assert.deepEqual(observed.args, ["add", "button", "--dry-run", "--diff"]);
  assert.equal(
    f.run(["diff", "button"], undefined, undefined, { env: { UI_MAINTENANCE_CLI_EXIT: "19" } })
      .status,
    19,
  );
});

for (const failure of ["throw", "exit"]) {
  test(`record recovers before validation after a second-file ${failure}`, async (t) => {
    const f = await fixture(t, true);
    const response = {
      name: "button",
      ...source,
      files: [{ ...source.files[0], content: "reviewed update" }],
    };
    const result = f.run(["record", "button", "--note", "Reviewed update"], response, undefined, {
      preload: "record-failure.mjs",
      env: { UI_MAINTENANCE_RECORD_FAILURE: failure },
    });
    assert.equal(result.status, failure === "exit" ? 77 : 2, result.stderr);
    const saved = JSON.parse(await readFile(join(f.root, "ui-upstream.json"), "utf8"));
    const oldInventory = JSON.parse(await readFile(join(f.root, "ui-maintenance.json"), "utf8"));
    assert.equal(saved.button.files[0].content, "reviewed update");
    assert.equal(oldInventory.components.button.reviewedAt, null);
    await readFile(join(f.root, ".ui-maintenance-record.json"));
    const recovered =
      failure === "exit"
        ? f.run(["record", "button", "--note", "Reviewed retry"], response)
        : f.run(["check"]);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.match(recovered.stdout, /Recovered an interrupted/);
    const inventory = JSON.parse(await readFile(join(f.root, "ui-maintenance.json"), "utf8"));
    assert.equal(
      inventory.components.button.reviewNote,
      failure === "exit" ? "Reviewed retry" : "Reviewed update",
    );
    await assert.rejects(readFile(join(f.root, ".ui-maintenance-record.json")), { code: "ENOENT" });
    assert.equal(f.run(["record", "button", "--note", "Reviewed retry"], response).status, 0);
    assert.equal(f.run(["check"]).status, 0);
  });
}

test("record recovery preserves edits made outside the pending transaction", async (t) => {
  const f = await fixture(t, true);
  const result = f.run(
    ["record", "button", "--note", "Interrupted"],
    { name: "button", ...source },
    undefined,
    {
      preload: "record-failure.mjs",
      env: { UI_MAINTENANCE_RECORD_FAILURE: "exit" },
    },
  );
  assert.equal(result.status, 77);
  f.inventory.components.button.reason = "An independent edit to preserve";
  await f.write("ui-maintenance.json", f.inventory);
  const before = await readFile(join(f.root, "ui-maintenance.json"), "utf8");
  const recovery = f.run(["check"]);
  assert.equal(recovery.status, 2);
  assert.match(recovery.stderr, /changed outside the pending record/);
  assert.equal(await readFile(join(f.root, "ui-maintenance.json"), "utf8"), before);
  await readFile(join(f.root, ".ui-maintenance-record.json"));
});

test("a live record owner blocks recovery without changing metadata", async (t) => {
  const f = await fixture(t, true);
  const inventory = await readFile(join(f.root, "ui-maintenance.json"), "utf8");
  const baseline = await readFile(join(f.root, "ui-upstream.json"), "utf8");
  await f.write(".ui-maintenance-record.json", {
    version: 1,
    pid: process.pid,
    files: {
      "ui-maintenance.json": { before: inventory, after: inventory },
      "ui-upstream.json": { before: baseline, after: baseline },
    },
  });
  const result = f.run(["check"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /still running/);
  assert.equal(await readFile(join(f.root, "ui-maintenance.json"), "utf8"), inventory);
});
