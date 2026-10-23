import { parseSync } from "oxc-parser";
import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const inside = (file, directory) => file === directory || file.startsWith(`${directory}/`);

/** Inspect real module references, including re-exports and dynamic imports. */
export function inspectUiImports(source, file, inventory) {
  const syntax = parseSync(file, source, { sourceType: "module" });
  if (syntax.errors.length) throw new Error(`Cannot inspect ${file}: ${syntax.errors[0].message}`);
  const violations = [];
  const inUi = inventory.directories.some((directory) => inside(file, directory));
  const allowed = inventory.importPolicy.baseUiExceptions[file]?.modules ?? [];
  function inspect(node, specifier) {
    const line = source.slice(0, node.start).split("\n").length;
    const report = (message) => violations.push(`${file}:${line}: ${message}`);
    if (
      specifier.startsWith("@base-ui-components/") ||
      specifier.startsWith("@radix-ui/") ||
      specifier === "radix-ui"
    ) {
      report(`Use the app's Base UI boundary instead of ${specifier}`);
    } else if (specifier === "@base-ui/react") {
      report("Import an explicit Base UI component subpath, not the package barrel");
    } else if (specifier.startsWith("@base-ui/react/") && !inUi && !allowed.includes(specifier)) {
      report(
        `Import ${specifier} through ${inventory.importPolicy.uiAlias} or document the composition exception`,
      );
    }
    if (inUi && specifier === "cn")
      report("Import cn through @/lib/utils to keep the app utility boundary");
    if (!inUi && specifier.startsWith(".")) {
      const target = posix.normalize(`${posix.dirname(file)}/${specifier}`);
      if (inventory.directories.some((directory) => inside(target, directory))) {
        report(`Use the configured ${inventory.importPolicy.uiAlias} alias for shared UI imports`);
      }
    }
  }
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (
      [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
        "ImportExpression",
        "TSImportType",
      ].includes(node.type) &&
      typeof node.source?.value === "string"
    ) {
      inspect(node, node.source.value);
    } else if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      node.callee.name === "require" &&
      typeof node.arguments[0]?.value === "string"
    ) {
      inspect(node, node.arguments[0].value);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(syntax.program);
  return violations;
}

async function files(root, directory = "src") {
  const result = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (path === "src/paraglide") continue;
    if (entry.isDirectory()) result.push(...(await files(root, path)));
    else if (/\.[jt]sx?$/.test(path) && !/\.(test|spec)\./.test(path)) result.push(path);
  }
  return result;
}

export async function checkUiImports(root) {
  const inventory = JSON.parse(await readFile(resolve(root, "ui-maintenance.json"), "utf8"));
  const policy = inventory.importPolicy;
  if (inventory.mode === "shadcn") {
    const config = JSON.parse(await readFile(resolve(root, "components.json"), "utf8"));
    if (config.aliases?.ui !== policy?.uiAlias)
      throw new Error("UI import alias differs from components.json");
  }
  if (!policy?.uiAlias || !policy.baseUiExceptions) throw new Error("Missing UI import policy");
  for (const [file, entry] of Object.entries(policy.baseUiExceptions)) {
    if (
      !entry.reason ||
      !entry.modules?.length ||
      !inventory.components[entry.component]?.files.includes(file)
    ) {
      throw new Error(`Uninventoried or unexplained Base UI composition exception: ${file}`);
    }
    await readFile(resolve(root, file));
  }
  const violations = [];
  for (const file of await files(root)) {
    violations.push(
      ...inspectUiImports(await readFile(resolve(root, file), "utf8"), file, inventory),
    );
  }
  if (violations.length) throw new Error(violations.join("\n"));
  process.stdout.write(
    `UI imports use ${policy.uiAlias}; ${Object.keys(policy.baseUiExceptions).length} documented primitive compositions.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await checkUiImports(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
