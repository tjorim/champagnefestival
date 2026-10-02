import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

// Parse selectors, including escaped names and nested/minified vendor CSS.
const root = resolve(import.meta.dirname, "..");
const sources = [
  "node_modules/bootstrap/dist/css/bootstrap.css",
  "node_modules/leaflet/dist/leaflet.css",
  "node_modules/swiper/swiper.css",
  "src/components/admin/admin.css",
  "src/components/admin/analyticsDashboard.css",
  "src/components/announcementBanner.css",
  "src/components/maintenancePage.css",
  "src/components/ThemeSwitcher.css",
  ...(await readdir(resolve(root, "public/themes")))
    .filter((name) => name.endsWith(".css"))
    .map((name) => `public/themes/${name}`),
];
const classes = new Set();
const seen = new Set();
// Theme entry points (e.g. theme-remuage.css) only @import their partials, so
// follow relative imports to catch every class a theme defines.
async function collect(source) {
  const file = resolve(root, source);
  if (seen.has(file)) return;
  seen.add(file);
  const css = postcss.parse(await readFile(file, "utf8"));
  const imports = [];
  css.walkAtRules("import", (rule) => {
    const target = /^(?:url\()?["']?(\.{1,2}\/[^"')]+)/.exec(rule.params.trim());
    if (target) imports.push(resolve(dirname(file), target[1]));
  });
  css.walkRules((rule) => {
    selectorParser((selectors) => {
      selectors.walkClasses((node) => classes.add(node.value));
    }).processSync(rule.selector);
  });
  for (const target of imports) await collect(relative(root, target));
}
for (const source of sources) await collect(source);
const allow = [...classes].sort();
const legacyColors = allow.filter((name) =>
  /^(bg|text|border|ring|fill|stroke|divide|outline|decoration|shadow|from|via|to)-/.test(name),
);
const exceptions = JSON.parse(
  await readFile(resolve(root, ".oxlint-legacy-exceptions.json"), "utf8"),
);
for (const exception of exceptions) {
  const rule = exception.rules["shadcn/no-unknown-classes"];
  if (rule) {
    rule[1].allow = [...allow, ...rule[1].allow];
    rule[1].deny = ["tw:*"];
  }
  const colors = exception.rules["shadcn/no-raw-colors"];
  if (colors) {
    colors[1].allow = [...legacyColors, ...colors[1].allow];
    colors[1].deny = ["tw:*"];
  }
}
await writeFile(
  resolve(root, ".oxlint-legacy-classes.json"),
  `${JSON.stringify(
    {
      rules: {
        "shadcn/no-unknown-classes": ["error", { allow, deny: ["tw:*"] }],
        "shadcn/no-raw-colors": [
          "error",
          {
            allow: legacyColors,
            deny: ["tw:*"],
          },
        ],
      },
      overrides: exceptions,
    },
    null,
    2,
  )}\n`,
);
