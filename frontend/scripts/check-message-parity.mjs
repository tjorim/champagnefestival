// Shared by the Travel, Worktime, Daynest, Champagne Festival and Bordertax frontends: keep the logic in step.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const placeholders = (text) =>
  [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();

/** Compare declarations as well as interpolation: an unused input is still part of the typed contract. */
export function catalogueErrors(base, translation) {
  const errors = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(translation)])) {
    if (!(key in base) || !(key in translation)) {
      errors.push(`${key}: missing catalogue key`);
      continue;
    }
    const signature = (message) =>
      typeof message === "string"
        ? { inputs: placeholders(message) }
        : message.map((variant) => ({
            declarations: [...(variant.declarations ?? [])].sort(),
            selectors: variant.selectors ?? [],
            matches: Object.fromEntries(
              Object.entries(variant.match)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([selector, text]) => [selector, placeholders(text)]),
            ),
          }));
    if (JSON.stringify(signature(base[key])) !== JSON.stringify(signature(translation[key])))
      errors.push(`${key}: interpolation, declaration or selector mismatch`);
  }
  return errors;
}

/** Check every locale in project.inlang/settings.json against the base locale. */
export function projectErrors(root) {
  const settings = JSON.parse(
    fs.readFileSync(path.join(root, "project.inlang/settings.json"), "utf8"),
  );
  const pattern = settings["plugin.inlang.messageFormat"].pathPattern;
  const load = (locale) =>
    JSON.parse(fs.readFileSync(path.join(root, pattern.replace("{locale}", locale)), "utf8"));
  const directory = path.join(root, path.dirname(pattern));
  const known = new Set(
    settings.locales.map((locale) => path.basename(pattern.replace("{locale}", locale))),
  );
  const errors = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".json") && !known.has(file))
    .map(
      (file) =>
        `${path.relative(root, path.join(directory, file))}: file is not listed in project.inlang locales`,
    );
  const base = load(settings.baseLocale);
  for (const locale of settings.locales.filter((candidate) => candidate !== settings.baseLocale))
    for (const error of catalogueErrors(base, load(locale))) errors.push(`${locale}: ${error}`);
  return { errors, locales: settings.locales.length, keys: Object.keys(base).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors, locales, keys } = projectErrors(fileURLToPath(new URL("../", import.meta.url)));
  if (errors.length) {
    process.stderr.write(`${errors.join("\n")}\n`);
    process.exitCode = 1;
  } else
    process.stdout.write(
      `Message parity passed: ${locales} locales, ${keys} keys in the base catalogue.\n`,
    );
}
