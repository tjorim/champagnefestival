// Shared by the Travel, Worktime, Daynest, Champagne Festival and Bordertax frontends: keep the logic in step.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "oxc-parser";
import { projectErrors } from "./check-message-parity.mjs";
import { diagnosticCallees, excludedFiles, exclusions } from "./locale-audit-exclusions.mjs";

const copyAttribute =
  /^(?:aria-label|aria-description|title|label|ariaLabel|placeholder|alt|description)$/;
const machine = (text) =>
  /^(?:rgba?|hsla?|oklch|oklab|color-mix|(?:repeating-)?(?:linear|radial|conic)-gradient)\(/.test(
    text,
  ) ||
  /^\((?:prefers|min|max)-[\w-]+: [^)]+\)$/.test(text) ||
  /^(?:[DMYHhmsZd]+[ ,:\-]*)+$/.test(text) ||
  /^(?:[DMYHhmsZd]+[ ,:\-]*)*(?:MMMM|MMM|ddd)(?:[DMYHhmsZd ,:\-]*)*$/.test(text) ||
  text
    .split(/\s+/)
    .every(
      (token) =>
        /^(?:[\w:[\]!./%&()*=,'>#@^$~+-]*-)[\w:[\]!./%&()*=,'>#@^$~+-]+$/.test(token) ||
        [
          "block",
          "grid",
          "fixed",
          "relative",
          "flex",
          "border",
          "rounded",
          "peer",
          "secondary",
          "compact",
        ].includes(token),
    );

const functionLike = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "TSDeclareFunction",
]);
/** Walks the ESTree, passing each node with its ancestors (nearest first). */
function walk(node, visit, ancestors = []) {
  if (!node || typeof node.type !== "string") return;
  visit(node, ancestors);
  const next = [node, ...ancestors];
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || !value || typeof value !== "object") continue;
    for (const child of Array.isArray(value) ? value : [value]) walk(child, visit, next);
  }
}
function parse(source, file) {
  const { program, errors } = parseSync(file, source);
  if (errors.length) throw new Error(`${file}: ${errors[0].message}`);
  return program;
}
const lineAt = (source, offset) => source.slice(0, offset).split("\n").length;
const keyName = (property) => (property.computed ? "" : (property.key.name ?? ""));

/** A review aid, not a proof about dynamic or authored data. --all lists every literal for manual tracing. */
export function sourceCandidates(source, file = "source.tsx", all = false) {
  const result = [];
  function consider(node, ancestors, text, start, templateFragment) {
    const trimmed = text.trim();
    const isJsxText = node.type === "JSXText";
    // A fragment of a substituted template takes the position of the whole template.
    const outer = templateFragment ? ancestors.slice(1) : ancestors;
    const parent = outer[0]?.type === "JSXExpressionContainer" ? outer[1] : outer[0];
    const attr = parent?.type === "JSXAttribute" ? (parent.name.name ?? "") : "";
    const imported = /^(?:Import|Export\w*)Declaration$/.test(parent?.type ?? "");
    // Strings handed to class-name helpers are styling, whatever their content.
    const styling = ancestors.some(
      (ancestor) =>
        ancestor.type === "CallExpression" &&
        ancestor.callee.type === "Identifier" &&
        /^(?:cn|cva|clsx|twMerge)$/.test(ancestor.callee.name),
    );
    const directive =
      parent?.type === "ExpressionStatement" && typeof parent.directive === "string";
    // Console and logger output and Error messages are developer diagnostics, never interface copy.
    // An application that renders `error.message` must route it through its own translated fallback.
    const diagnostic = ancestors.some(
      (ancestor) =>
        (ancestor.type === "CallExpression" &&
          ancestor.callee.type === "MemberExpression" &&
          ancestor.callee.object.type === "Identifier" &&
          /^(?:console|logger)$/.test(ancestor.callee.object.name)) ||
        (ancestor.type === "CallExpression" &&
          ancestor.callee.type === "Identifier" &&
          diagnosticCallees.includes(ancestor.callee.name)) ||
        (ancestor.type === "NewExpression" &&
          ancestor.callee.type === "Identifier" &&
          /Error$/.test(ancestor.callee.name)),
    );
    const templateCopy = templateFragment && /\s/.test(text) && /[A-Za-zÀ-ž]{2}/.test(trimmed);
    const fieldMapping = ancestors
      .slice(
        0,
        ancestors.findIndex((ancestor) => functionLike.has(ancestor.type)) + 1 || ancestors.length,
      )
      .some(
        (ancestor) =>
          (ancestor.type === "Property" && keyName(ancestor) === "serverFields") ||
          (ancestor.type === "VariableDeclarator" && ancestor.id.name === "serverFields"),
      );
    const propertyCopy =
      !fieldMapping &&
      parent?.type === "Property" &&
      parent.value === node &&
      /^(?:label|title|placeholder|description|alt)$/.test(keyName(parent));
    const visible =
      templateCopy ||
      isJsxText ||
      parent?.type === "JSXElement" ||
      copyAttribute.test(attr) ||
      propertyCopy;
    if (
      /[A-Za-zÀ-ž]/.test(trimmed) &&
      !imported &&
      (all || (!directive && !diagnostic && !styling)) &&
      (all || visible || /\s/.test(trimmed)) &&
      (all ||
        (!/^(?:className|rel|target|href|src|srcSet|id|htmlFor|role|type|name|data-.+)$/.test(
          attr,
        ) &&
          (visible || !machine(trimmed))))
    ) {
      result.push({
        line: lineAt(source, start + text.length - text.trimStart().length),
        text: trimmed,
      });
    }
  }
  walk(parse(source, file), (node, ancestors) => {
    if (node.type === "Literal" && typeof node.value === "string")
      consider(node, ancestors, node.value, node.start);
    else if (node.type === "JSXText") consider(node, ancestors, node.value, node.start);
    else if (node.type === "TemplateLiteral") {
      const single = node.quasis.length === 1;
      for (const quasi of node.quasis)
        // A template without substitutions behaves like a string literal; fragments of a substituted one are copy hints.
        single
          ? consider(node, ancestors, quasi.value.cooked ?? quasi.value.raw, quasi.start, false)
          : consider(
              quasi,
              [node, ...ancestors],
              quasi.value.cooked ?? quasi.value.raw,
              quasi.start,
              true,
            );
    }
  });
  return result;
}
/** A top-level message call freezes copy before any locale switch. Store the function instead. */
export function frozenMessageCalls(source, file = "source.tsx") {
  const lines = [];
  walk(parse(source, file), (node, ancestors) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      node.callee.object.type === "Identifier" &&
      node.callee.object.name === "m" &&
      !ancestors.some((ancestor) => functionLike.has(ancestor.type))
    )
      lines.push(lineAt(source, node.start));
  });
  return lines;
}
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "paraglide" ? [] : files(file);
    return /\.(?:tsx?|js)$/.test(file) &&
      !/(?:\.test\.|\.spec\.|test-|fake-api|test-utils)/.test(file)
      ? [file]
      : [];
  });
}
function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const all = process.argv.includes("--all");
  const { errors, locales } = projectErrors(root);
  const sources = files(path.join(root, "src"));
  const reviewed = sources.filter((file) => {
    const relative = path.relative(path.join(root, "src"), file).split(path.sep).join("/");
    return !Object.keys(excludedFiles).some((entry) =>
      entry.endsWith("/") ? relative.startsWith(entry) : relative === entry,
    );
  });
  for (const file of reviewed) {
    const relative = path.relative(path.join(root, "src"), file);
    for (const line of frozenMessageCalls(fs.readFileSync(file, "utf8"), relative))
      errors.push(
        `${relative}:${line}: module-level translated snapshot; retain the message function`,
      );
    for (const candidate of sourceCandidates(fs.readFileSync(file, "utf8"), relative, all)) {
      const reason = exclusions[relative]?.[candidate.text];
      const entry = `${relative}:${candidate.line} ${JSON.stringify(candidate.text)}`;
      if (all) process.stdout.write(`${entry}${reason ? ` — ${reason}` : ""}\n`);
      else if (!reason) errors.push(entry);
    }
  }
  if (errors.length) {
    process.stderr.write(`${errors.join("\n")}\n`);
    process.exitCode = 1;
  } else
    process.stdout.write(
      `Locale audit passed: ${reviewed.length} production source files; ${locales} locale catalogues match.\n`,
    );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
