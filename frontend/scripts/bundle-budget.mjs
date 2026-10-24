import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const budgets = { total: 2800, entry: 520, admin: 450, eager: 720 };

export async function measureBundle(directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, ".vite/manifest.json"), "utf8"));
  if (!manifest["index.html"]?.isEntry) throw new Error("Missing public entry in build manifest");
  const seen = new Set();
  async function eagerSize(key) {
    if (seen.has(key)) return 0;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing imported chunk in build manifest: ${key}`);
    let bytes = (await stat(resolve(directory, chunk.file))).size;
    for (const dependency of chunk.imports ?? []) bytes += await eagerSize(dependency);
    return bytes;
  }
  let total = 0;
  let admin = 0;
  for (const file of await readdir(resolve(directory, "assets"), { recursive: true })) {
    if (!file.endsWith(".js")) continue;
    const bytes = (await stat(resolve(directory, "assets", file))).size;
    total += bytes;
    if (file.startsWith("AdminDashboard-")) admin += bytes;
  }
  if (!admin) throw new Error("Missing AdminDashboard build chunk");
  return {
    total,
    entry: (await stat(resolve(directory, manifest["index.html"].file))).size,
    admin,
    eager: await eagerSize("index.html"),
  };
}

export function exceededBudgets(sizes) {
  return Object.entries(budgets).filter(([name, kib]) => sizes[name] > kib * 1024);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const sizes = await measureBundle(resolve("dist"));
    for (const [name, bytes] of Object.entries(sizes)) {
      process.stdout.write(
        `${name}: ${(bytes / 1024).toFixed(1)} KiB (budget: ${budgets[name]} KiB)\n`,
      );
    }
    const exceeded = exceededBudgets(sizes);
    if (exceeded.length)
      throw new Error(`Bundle budgets exceeded: ${exceeded.map(([name]) => name).join(", ")}`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
