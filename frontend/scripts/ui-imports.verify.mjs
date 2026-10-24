import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectUiImports, checkUiImports } from "./ui-imports.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const inventory = {
  directories: ["src/ui"],
  importPolicy: {
    uiAlias: "@/ui",
    baseUiExceptions: { "src/RecordDialog.tsx": { modules: ["@base-ui/react/dialog"] } },
  },
};
const inspect = (source, file = "src/pages/Screen.tsx") =>
  inspectUiImports(source, file, inventory);

test("screens use local UI imports while adapters use component subpaths", () => {
  assert.deepEqual(inspect('import { Button } from "@/ui/button";'), []);
  assert.deepEqual(
    inspect('export { Button } from "@base-ui/react/button";', "src/ui/button.ts"),
    [],
  );
  assert.equal(inspect('import { Button } from "@base-ui/react/button";').length, 1);
});

test("exceptions are scoped to the inventoried composition and exact primitive", () => {
  assert.deepEqual(
    inspect('import { Dialog } from "@base-ui/react/dialog";', "src/RecordDialog.tsx"),
    [],
  );
  assert.equal(
    inspect('import { Input } from "@base-ui/react/input";', "src/RecordDialog.tsx").length,
    1,
  );
});

test("barrels and alternate primitive libraries cannot bypass the boundary", () => {
  for (const module of ["@base-ui/react", "@base-ui-components/react", "@radix-ui/react-dialog"]) {
    assert.equal(inspect(`export * from "${module}";`, "src/ui/dialog.ts").length, 1);
  }
});

test("dynamic imports, require calls and type imports follow the same boundary", () => {
  assert.equal(inspect('const x = import("@base-ui/react/dialog");').length, 1);
  assert.equal(inspect('const x = require("@base-ui/react/dialog");').length, 1);
  assert.equal(inspect('type X = import("@base-ui/react/dialog").Dialog.Root.Props;').length, 1);
});

test("relative imports stay local inside UI, screens use the configured alias", () => {
  assert.equal(inspect('import { Button } from "../ui/button";', "src/Screen.tsx").length, 0);
  assert.equal(inspect('import { Button } from "../ui/button";').length, 1);
  assert.deepEqual(inspect('import { Button } from "./button";', "src/ui/dialog.tsx"), []);
});

test("comments and strings are not mistaken for imports; UI utilities use the local helper", () => {
  assert.deepEqual(
    inspect(
      '// import { Button } from "@base-ui/react/button";\nconst text = "@base-ui/react/dialog";',
    ),
    [],
  );
  assert.equal(inspect('import { cn } from "cn";', "src/ui/button.ts").length, 1);
  assert.deepEqual(inspect('import { cn } from "@/lib/utils";', "src/ui/button.ts"), []);
});

async function policyFixture(t, value) {
  const root = await mkdtemp(join(tmpdir(), "ui-import-policy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "ui-maintenance.json"), JSON.stringify(value));
  return root;
}

test("CI rejects an import alias that differs from the generator configuration", async (t) => {
  const root = await policyFixture(t, { ...inventory, mode: "shadcn" });
  await writeFile(
    join(root, "components.json"),
    JSON.stringify({ aliases: { ui: "@/different" } }),
  );
  await assert.rejects(checkUiImports(root), /alias differs/);
});

test("direct primitive exceptions must identify an inventoried owner and reason", async (t) => {
  const root = await policyFixture(t, { ...inventory, mode: "base-ui", components: {} });
  await assert.rejects(checkUiImports(root), /Uninventoried or unexplained/);
});
