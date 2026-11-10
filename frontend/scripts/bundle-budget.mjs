// Kept identical across the five apps; app-specific paths and limits live in bundle-budget.json.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { parseSync } from "oxc-parser";

const metrics = new Set(["raw", "gzip", "entryRaw"]);
const js = /\.(?:m?js)$/;
const size = (bytes) => ({ raw: bytes.length, gzip: gzipSync(bytes, { level: 6 }).length });
const sum = (files, read) =>
  files.reduce(
    (out, file) => {
      const bytes = size(read(file));
      return { raw: out.raw + bytes.raw, gzip: out.gzip + bytes.gzip };
    },
    { raw: 0, gzip: 0 },
  );
const kb = (bytes) => `${(bytes / 1000).toFixed(2)} kB`;

function validate(config) {
  if (!config.entries || !Object.keys(config.entries).length)
    throw new Error("Configure at least one HTML entry");
  if (!/^\/.*\/$/.test(config.base ?? "/") && (config.base ?? "/") !== "/")
    throw new Error("base must start and end with /");
  const check = (limits, allowed) => {
    for (const [metric, limit] of Object.entries(limits ?? {})) {
      if (!allowed.has(metric) || !Number.isFinite(limit) || limit <= 0)
        throw new Error(`Invalid budget: ${metric}`);
    }
  };
  for (const [name, limits] of Object.entries(config.budgets?.entries ?? {})) {
    if (!(name in config.entries)) throw new Error(`Unknown budget entry: ${name}`);
    check(limits, metrics);
  }
  check(config.budgets?.total, new Set(["raw", "gzip"]));
  for (const [name, rules] of Object.entries(config.forbidInitial ?? {})) {
    if (!(name in config.entries)) throw new Error(`Unknown forbidden entry: ${name}`);
    for (const rule of rules) new RegExp(rule);
  }
  for (const chunk of config.budgets?.chunks ?? []) {
    if (!chunk.name || !chunk.pattern) throw new Error("Chunk budgets require a name and pattern");
    new RegExp(chunk.pattern);
    check(
      { raw: chunk.raw, ...(chunk.gzip === undefined ? {} : { gzip: chunk.gzip }) },
      new Set(["raw", "gzip"]),
    );
  }
}

export function measureBundle(directory, config) {
  validate(config);
  const root = resolve(directory);
  const base = config.base ?? "/";
  const buffers = new Map();
  const local = (request, importer) => {
    const url = new URL(request, `https://bundle.invalid${base}${importer}`);
    if (url.origin !== "https://bundle.invalid") return null;
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith(base)) throw new Error(`Asset outside configured base: ${request}`);
    const file = resolve(root, pathname.slice(base.length));
    if (!file.startsWith(root + sep)) throw new Error(`Asset outside dist: ${request}`);
    return relative(root, file).split(sep).join("/");
  };
  const read = (file) => {
    if (!buffers.has(file)) buffers.set(file, readFileSync(join(root, file)));
    return buffers.get(file);
  };
  const dependencies = (file) => {
    const parsed = parseSync(file, read(file).toString("utf8"));
    if (parsed.errors.length) throw new Error(`Invalid JavaScript: ${file}`);
    const requests = [
      ...parsed.module.staticImports.map((item) => item.moduleRequest.value),
      ...parsed.module.staticExports.flatMap((item) =>
        item.entries.map((entry) => entry.moduleRequest?.value),
      ),
    ].filter(Boolean);
    return requests.flatMap((request) => {
      if (!/^(?:\.{1,2}\/|\/|[a-z][a-z\d+.-]*:)/i.test(request))
        throw new Error(`Unbundled import in ${file}: ${request}`);
      const dependency = local(request, file);
      return dependency ? [dependency] : [];
    });
  };
  const closure = (roots) => {
    const seen = new Set();
    const queue = [...roots];
    while (queue.length) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      if (!js.test(file)) throw new Error(`Expected JavaScript asset: ${file}`);
      seen.add(file);
      queue.push(...dependencies(file));
    }
    return [...seen].sort();
  };
  const entries = {};
  for (const [name, html] of Object.entries(config.entries)) {
    const source = read(html).toString("utf8");
    const scripts = [];
    const preloads = [];
    for (const tag of source.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
      const attrs = Object.fromEntries(
        [...tag[0].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((match) => [
          match[1].toLowerCase(),
          match[2] ?? match[3] ?? match[4],
        ]),
      );
      const target =
        /^<script/i.test(tag[0]) && attrs.type === "module"
          ? attrs.src
          : /^<link/i.test(tag[0]) && attrs.rel === "modulepreload"
            ? attrs.href
            : null;
      if (!target) continue;
      const file = local(target, html);
      if (file) (/^<script/i.test(tag[0]) ? scripts : preloads).push(file);
    }
    if (!scripts.length) throw new Error(`No local module entry script: ${html}`);
    const files = closure([...scripts, ...preloads]);
    for (const pattern of config.forbidInitial?.[name] ?? []) {
      const found = files.find((file) => new RegExp(pattern).test(file));
      if (found) throw new Error(`Forbidden initial asset in ${name}: ${found}`);
    }
    entries[name] = { ...sum(files, read), entryRaw: sum([...new Set(scripts)], read).raw, files };
  }
  const walk = (folder) =>
    readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) => {
      const file = `${folder}/${entry.name}`;
      return entry.isDirectory() ? walk(file) : js.test(file) ? [file] : [];
    });
  const files = walk("assets").sort();
  if (!files.length) throw new Error("No JavaScript assets found");
  const chunks = {};
  for (const rule of config.budgets?.chunks ?? []) {
    const matching = files.filter((file) => new RegExp(rule.pattern).test(file));
    if (!matching.length) throw new Error(`Missing budgeted chunk: ${rule.name}`);
    chunks[rule.name] = { ...sum(matching, read), files: matching };
  }
  return { entries, total: { ...sum(files, read), files }, chunks };
}

export function exceededBudgets(report, config) {
  const failures = [];
  const compare = (name, actual, limits) => {
    for (const [metric, limit] of Object.entries(limits ?? {})) {
      if (actual[metric] > limit)
        failures.push(`${name} ${metric}: ${kb(actual[metric])} > ${kb(limit)}`);
    }
  };
  for (const [name, limits] of Object.entries(config.budgets?.entries ?? {}))
    compare(name, report.entries[name], limits);
  compare("total JS", report.total, config.budgets?.total);
  for (const rule of config.budgets?.chunks ?? [])
    compare(rule.name, report.chunks[rule.name], {
      raw: rule.raw,
      ...(rule.gzip === undefined ? {} : { gzip: rule.gzip }),
    });
  return failures;
}

export function run(root, args, out = (line) => process.stdout.write(`${line}\n`)) {
  if (args.some((arg) => !["--check", "--json"].includes(arg)))
    throw new Error("Usage: bundle-budget.mjs [--check] [--json]");
  const config = JSON.parse(readFileSync(join(root, "bundle-budget.json"), "utf8"));
  const report = measureBundle(join(root, "dist"), config);
  if (
    args.includes("--check") &&
    !Object.keys(config.budgets?.entries ?? {}).length &&
    !Object.keys(config.budgets?.total ?? {}).length &&
    !config.budgets?.chunks?.length
  )
    throw new Error("No budgets configured");
  const failures = args.includes("--check") ? exceededBudgets(report, config) : [];
  if (args.includes("--json"))
    out(JSON.stringify({ unit: "bytes", gzipLevel: 6, ...report, failures }, null, 2));
  else {
    out("JavaScript (decimal kB; gzip level 6, per file):");
    for (const [name, entry] of Object.entries(report.entries))
      out(
        `  ${name}: ${kb(entry.raw)} raw / ${kb(entry.gzip)} gzip (${entry.files.length} initial files)`,
      );
    out(
      `  total assets: ${kb(report.total.raw)} raw / ${kb(report.total.gzip)} gzip (${report.total.files.length} files)`,
    );
    for (const [name, chunk] of Object.entries(report.chunks))
      out(`  ${name}: ${kb(chunk.raw)} raw / ${kb(chunk.gzip)} gzip`);
    if (args.includes("--check"))
      out(failures.length ? "Bundle budgets exceeded." : "Bundle budgets met.");
  }
  if (failures.length) throw new Error(failures.join("\n"));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run(resolve(dirname(fileURLToPath(import.meta.url)), ".."), process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
