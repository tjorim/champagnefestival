// The frontend's API types come from the backend's OpenAPI document.
//
//   node scripts/api-types.mjs generate   rewrite openapi.json from the backend (needs uv) and src/api-schema/
//   node scripts/api-types.mjs check      fail when src/api-schema/ is not what openapi.json generates
//
// `check` needs no Python, so `pnpm typecheck` can run it anywhere. The backend tests fail when openapi.json
// no longer matches the application, so the two checks together catch a stale type in either place.
// Orval (see `orval.config.mjs`) writes one file per schema plus an `index.ts`, so `./api-schema` resolves.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const generated = join(root, "src", "api-schema");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: root, ...options });
  if (result.status !== 0) {
    console.error(`${command} ${args.join(" ")} failed.`);
    process.exit(result.status ?? 1);
  }
}

// Orval keeps stale files in its output directory, so empty it first: a schema dropped from the API must
// not leave its file behind.
function generate(output) {
  rmSync(output, { recursive: true, force: true });
  run("pnpm", ["exec", "orval", "--config", "orval.config.mjs"], {
    env: { ...process.env, API_SCHEMA_DIR: output },
  });
}

// File name -> contents, so two directories compare without caring how they were written.
function read(directory) {
  const files = new Map();
  if (existsSync(directory)) {
    for (const name of readdirSync(directory).sort()) {
      files.set(name, readFileSync(join(directory, name), "utf8"));
    }
  }
  return files;
}

function same(a, b) {
  return a.size === b.size && [...a].every(([name, text]) => b.get(name) === text);
}

const mode = process.argv[2];
if (mode === "generate") {
  run("uv", ["run", "--project", "../backend", "python", "-m", "app.openapi_export"]);
  generate(generated);
} else if (mode === "check") {
  const scratch = mkdtempSync(join(tmpdir(), "champagnefestival-api-types-"));
  try {
    const fresh = join(scratch, "api-schema");
    generate(fresh);
    if (!same(read(fresh), read(generated))) {
      console.error("src/api-schema/ is stale: run `pnpm api:generate` and commit the result.");
      process.exit(1);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
} else {
  console.error("Usage: node scripts/api-types.mjs generate|check");
  process.exit(2);
}
