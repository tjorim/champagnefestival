#!/usr/bin/env node
// Release helper shared by the tjorim/* repositories. Dependency-free; the file is
// identical in every repo and each repo configures it in release.config.json:
//
//   {
//     "repo": "tjorim/example",            // for CHANGELOG compare links
//     "versionFile": "VERSION",             // default
//     "changelog": "CHANGELOG.md",          // default
//     "targets": [                          // files that must carry the version
//       { "file": "package.json", "pattern": "\"version\": \"([^\"]+)\"" }
//     ],
//     "scopes": ["Web", "Android", "Backend"],  // optional: allowed `**Scope:**` bullet prefixes
//     "platforms": ["Web", "Android"],          // optional: scopes that are one client's own
//     "categories": ["Added", ...]              // optional: replaces the allowed `###` headings
//   }
//
// Each target `pattern` is a regular expression with exactly one capture group around
// the version. It must match `expect` times (default 1), so a pattern that silently stops
// matching fails loudly instead of leaving a file behind.
//
// CHANGELOG.md is the hand-edited source. Beyond Keep a Changelog's headings it has two
// conventions for deciding who sees an entry:
//   - audience: entries under `### Internal` (backend, infra, CI, dependencies) are for
//     maintainers; `--audience app` leaves them out of what an app shows its users.
//   - platform: a bullet that starts with `**Android:**` (any scope listed in "platforms")
//     belongs to that client only; unprefixed bullets apply to every client.
// Only `[Unreleased]` is validated against "scopes"/"categories": released sections are history.
//
// Commands:
//   check [--tag vX.Y.Z]           VERSION, every target and the CHANGELOG agree
//   next [--date YYYY-MM-DD]       print the next CalVer (YYYY.M.MICRO)
//   bump [version] [--date D]      write the version everywhere and cut the CHANGELOG
//                                  ([Unreleased] becomes the dated release section)
//   notes [version] [--audience app] [--platform P] [--max-chars N]
//                                  print one version's CHANGELOG body (for release notes)
//   export [--audience app] [--platform P] [--limit N]
//                                  print the CHANGELOG as JSON for an in-app "what's new" view

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const VERSION_RE = /^(\d{4})\.([1-9]|1[0-2])\.([1-9]\d*)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UNRELEASED_RE = /^## \[Unreleased\]\s*$/;
const REF_RE = /^\[[^\]]+\]:\s+\S+/;
const DEFAULT_MAX_NOTES_CHARS = 120_000; // GitHub rejects release bodies over 125,000
const DEFAULT_CATEGORIES = [
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
  "Internal",
  "Planned",
];
const INTERNAL_CATEGORY = "internal";
const SCOPE_RE = /^\*\*([^*]+?)(?::\*\*|\*\*:)\s*/;
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sectionRe = (version) =>
  new RegExp(`^## \\[${escapeRe(version)}\\] - (\\d{4}-\\d{2}-\\d{2})\\s*$`);

export function parseVersion(version) {
  const match = VERSION_RE.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(a, b) {
  const [pa, pb] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/** CalVer is YYYY.M.MICRO: MICRO counts releases within a month and restarts at 1. */
export function nextVersion(current, today) {
  const [year, month] = today.split("-").map(Number);
  const parsed = parseVersion(current);
  if (parsed && parsed[0] === year && parsed[1] === month)
    return `${year}.${month}.${parsed[2] + 1}`;
  return `${year}.${month}.1`;
}

export function readConfig(root) {
  const config = JSON.parse(readFileSync(join(root, "release.config.json"), "utf8"));
  return { versionFile: "VERSION", changelog: "CHANGELOG.md", targets: [], ...config };
}

const readVersion = (root, config) => readFileSync(join(root, config.versionFile), "utf8").trim();

function scanTarget(root, target) {
  const text = readFileSync(join(root, target.file), "utf8");
  const matches = [...text.matchAll(new RegExp(target.pattern, "gd"))];
  return { text, matches };
}

function trimBlankLines(lines) {
  let [from, to] = [0, lines.length];
  while (from < to && lines[from].trim() === "") from++;
  while (to > from && lines[to - 1].trim() === "") to--;
  return lines.slice(from, to);
}

/** First line index after `start` that ends the section: next heading, rule or link reference. */
function sectionEnd(lines, start) {
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]) || lines[i] === "---" || REF_RE.test(lines[i])) return i;
  }
  return lines.length;
}

/**
 * Split a section body into `###` categories, each with bullet entries and any other prose.
 * Bullets before the first `###` land in a category named null. A bullet is its first line
 * plus indented or directly following lines, so wrapped and nested text stays together.
 */
export function parseBody(bodyLines) {
  const categories = [];
  let category = null;
  let bullet = null;
  let blanks = 0;
  const open = (name) => {
    category = { name, entries: [], prose: [] };
    categories.push(category);
  };
  const flush = () => {
    if (!bullet) return;
    const text = bullet
      .map((line, i) => (i === 0 ? line.replace(/^[-*]\s+/, "") : line.replace(/^ {1,2}/, "")))
      .join("\n")
      .trimEnd();
    const match = SCOPE_RE.exec(text);
    category.entries.push({
      scope: match ? match[1].trim() : null,
      text: match ? text.slice(match[0].length) : text,
    });
    bullet = null;
  };

  for (const line of bodyLines) {
    const heading = /^### (.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      blanks = 0;
      open(heading[1]);
      continue;
    }
    if (line.trim() === "") {
      blanks++;
      continue;
    }
    if (!category) open(null);
    if (/^[-*]\s/.test(line)) {
      flush();
      bullet = [line];
    } else if (bullet && (/^\s/.test(line) || blanks === 0)) {
      bullet.push(...Array(blanks).fill(""), line);
    } else {
      flush();
      category.prose.push(...(category.prose.length ? Array(blanks).fill("") : []), line);
    }
    blanks = 0;
  }
  flush();
  return categories.filter((c) => c.entries.length || c.prose.length);
}

/** Every `## [x] - date` release plus `[Unreleased]`, newest first, as parsed categories. */
export function parseChangelog(text) {
  const lines = text.split("\n");
  const result = { unreleased: null, releases: [] };
  lines.forEach((line, i) => {
    const release = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?/.exec(line);
    if (!release) return;
    const categories = parseBody(lines.slice(i + 1, sectionEnd(lines, i)));
    if (release[1] === "Unreleased") result.unreleased = { categories };
    else if (release[2])
      result.releases.push({ version: release[1], date: release[2], categories });
  });
  return result;
}

/** Same-named `###` blocks (stacked "Unreleased" blocks that were never merged) become one. */
function mergeCategories(categories) {
  const merged = new Map();
  for (const c of categories) {
    const existing = merged.get(c.name);
    if (existing) {
      existing.entries.push(...c.entries);
      existing.prose.push(...c.prose);
    } else {
      merged.set(c.name, { ...c, entries: [...c.entries], prose: [...c.prose] });
    }
  }
  return [...merged.values()];
}

function filterCategories(categories, config, { audience, platform } = {}) {
  if (platform && !(config.platforms ?? []).some((p) => sameName(p, platform))) {
    throw new Error(
      `unknown platform "${platform}" (configured: ${(config.platforms ?? []).join(", ") || "none"})`,
    );
  }
  const isPlatformScope = (scope) => (config.platforms ?? []).some((p) => sameName(p, scope));
  return mergeCategories(categories)
    .filter((c) => !(audience === "app" && c.name && sameName(c.name, INTERNAL_CATEGORY)))
    .map((c) => ({
      ...c,
      entries: c.entries.filter(
        (e) => !platform || !e.scope || !isPlatformScope(e.scope) || sameName(e.scope, platform),
      ),
    }))
    .filter((c) => c.entries.length || c.prose.length);
}

function renderMarkdown(categories) {
  return categories
    .map((c) => {
      const entries = c.entries.map(
        (e) => `- ${e.scope ? `**${e.scope}:** ` : ""}${e.text.replaceAll("\n", "\n  ")}`,
      );
      return [c.name ? `### ${c.name}` : null, entries.join("\n"), c.prose.join("\n")]
        .filter(Boolean)
        .join("\n\n");
    })
    .join("\n\n");
}

/** Problems in `[Unreleased]` that would make the next release's notes wrong. */
function checkUnreleased(parsed, config) {
  const errors = [];
  const allowed = config.categories ?? DEFAULT_CATEGORIES;
  const seen = new Set();
  for (const c of parsed.unreleased?.categories ?? []) {
    if (c.name !== null && seen.has(c.name)) {
      errors.push(
        `${config.changelog}: [Unreleased] has "### ${c.name}" more than once; merge them`,
      );
    }
    seen.add(c.name);
    if (c.name === null && c.entries.length) {
      errors.push(`${config.changelog}: [Unreleased] has entries outside a "###" category`);
    } else if (c.name !== null && !allowed.some((a) => a === c.name)) {
      errors.push(
        `${config.changelog}: [Unreleased] has unknown category "### ${c.name}" (allowed: ${allowed.join(", ")})`,
      );
    }
    for (const e of c.entries) {
      if (e.scope && config.scopes && !config.scopes.includes(e.scope)) {
        errors.push(
          `${config.changelog}: [Unreleased] scope "**${e.scope}:**" is not one of ${config.scopes.join(", ")}`,
        );
      }
    }
  }
  return errors;
}

export function check(root, { tag } = {}) {
  const config = readConfig(root);
  const errors = [];
  const version = readVersion(root, config);

  if (!parseVersion(version)) {
    return [`${config.versionFile}: "${version}" is not CalVer (YYYY.M.MICRO, e.g. 2026.11.1)`];
  }
  if (tag !== undefined && tag !== `v${version}`) {
    errors.push(
      `tag "${tag}" does not match ${config.versionFile} "${version}" (expected v${version})`,
    );
  }

  for (const target of config.targets) {
    const expected = target.expect ?? 1;
    const { matches } = scanTarget(root, target);
    if (matches.length !== expected) {
      errors.push(
        `${target.file}: expected ${expected} match(es) of /${target.pattern}/, found ${matches.length}`,
      );
      continue;
    }
    for (const match of matches) {
      if (match[1] !== version) {
        errors.push(
          `${target.file}: version "${match[1]}" does not match ${config.versionFile} "${version}"`,
        );
      }
    }
  }

  const changelogText = readFileSync(join(root, config.changelog), "utf8");
  const lines = changelogText.split("\n");
  errors.push(...checkUnreleased(parseChangelog(changelogText), config));
  if (!lines.some((l) => UNRELEASED_RE.test(l)))
    errors.push(`${config.changelog}: missing "## [Unreleased]"`);
  if (!lines.some((l) => sectionRe(version).test(l))) {
    errors.push(`${config.changelog}: missing "## [${version}] - YYYY-MM-DD"`);
  }
  if (!lines.some((l) => l.startsWith(`[${version}]:`))) {
    errors.push(`${config.changelog}: missing link reference "[${version}]: <url>"`);
  }
  if (!lines.some((l) => l.startsWith("[Unreleased]:"))) {
    errors.push(`${config.changelog}: missing link reference "[Unreleased]: <url>"`);
  }
  return errors;
}

export function bump(root, { version, date, allowEmpty = false } = {}) {
  const config = readConfig(root);
  const current = readVersion(root, config);
  const today = date ?? new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(today)) throw new Error(`date "${today}" is not YYYY-MM-DD`);
  const next = version ?? nextVersion(current, today);
  if (!parseVersion(next)) throw new Error(`"${next}" is not CalVer (YYYY.M.MICRO)`);
  if (parseVersion(current) && compareVersions(next, current) <= 0) {
    throw new Error(`${next} is not newer than the current version ${current}`);
  }

  // Do every read and validation before writing anything.
  const edits = config.targets.map((target) => {
    const expected = target.expect ?? 1;
    const { text, matches } = scanTarget(root, target);
    if (matches.length !== expected) {
      throw new Error(
        `${target.file}: expected ${expected} match(es) of /${target.pattern}/, found ${matches.length}`,
      );
    }
    let out = text;
    for (const match of [...matches].reverse()) {
      const [from, to] = match.indices[1];
      out = out.slice(0, from) + next + out.slice(to);
    }
    return { file: target.file, out };
  });

  const lines = readFileSync(join(root, config.changelog), "utf8").split("\n");
  const unreleased = lines.findIndex((l) => UNRELEASED_RE.test(l));
  if (unreleased < 0) throw new Error(`${config.changelog}: missing "## [Unreleased]"`);
  const end = sectionEnd(lines, unreleased);
  // A `### Planned` list describes future work, so it stays under [Unreleased] when released.
  let body = lines.slice(unreleased + 1, end);
  const plannedStart = body.findIndex((l) => /^### Planned\s*$/.test(l));
  let planned = [];
  if (plannedStart >= 0) {
    const after = body.findIndex((l, i) => i > plannedStart && /^### /.test(l));
    const plannedEnd = after < 0 ? body.length : after;
    planned = body.slice(plannedStart, plannedEnd);
    body = [...body.slice(0, plannedStart), ...body.slice(plannedEnd)];
  }
  if (!body.join("\n").trim() && !allowEmpty)
    throw new Error("[Unreleased] is empty — nothing to release (--allow-empty overrides)");
  const kept = planned.length ? ["", ...trimBlankLines(planned), ""] : [""];
  const moved = body[0]?.trim() === "" ? body : ["", ...body];
  lines.splice(unreleased + 1, end - unreleased - 1, ...kept, `## [${next}] - ${today}`, ...moved);

  const base = config.repo ? `https://github.com/${config.repo}` : null;
  const unreleasedRef = lines.findIndex((l) => l.startsWith("[Unreleased]:"));
  if (base) {
    const refs = [
      `[Unreleased]: ${base}/compare/v${next}...HEAD`,
      `[${next}]: ${base}/compare/v${current}...v${next}`,
    ];
    if (unreleasedRef >= 0) lines.splice(unreleasedRef, 1, ...refs);
    else lines.push(...(lines.at(-1) === "" ? [] : [""]), ...refs, "");
  }

  for (const { file, out } of edits) writeFileSync(join(root, file), out);
  writeFileSync(join(root, config.versionFile), `${next}\n`);
  writeFileSync(join(root, config.changelog), lines.join("\n"));
  return { from: current, to: next, date: today };
}

export function notes(
  root,
  version,
  { maxChars = DEFAULT_MAX_NOTES_CHARS, audience, platform } = {},
) {
  const config = readConfig(root);
  const v = version ?? readVersion(root, config);
  const lines = readFileSync(join(root, config.changelog), "utf8").split("\n");
  const start = lines.findIndex((l) => sectionRe(v).test(l));
  if (start < 0) throw new Error(`${config.changelog}: no section for ${v}`);
  const sectionLines = lines.slice(start + 1, sectionEnd(lines, start));
  // Unfiltered notes keep the author's exact Markdown; filtered ones are re-rendered.
  const body =
    audience || platform
      ? renderMarkdown(filterCategories(parseBody(sectionLines), config, { audience, platform }))
      : sectionLines.join("\n").trim();
  if (body.length <= maxChars) return body;
  const cut = body.slice(0, maxChars);
  const boundary = cut.lastIndexOf("\n\n");
  return `${cut.slice(0, boundary > 0 ? boundary : maxChars)}\n\n_Notes truncated — see ${config.changelog} for the full list._`;
}

/** The changelog as data for an app's "what's new" view: newest release first. */
export function exportChangelog(root, { audience, platform, limit } = {}) {
  const config = readConfig(root);
  const parsed = parseChangelog(readFileSync(join(root, config.changelog), "utf8"));
  const shape = (categories) =>
    filterCategories(categories, config, { audience, platform }).map((c) => ({
      name: c.name,
      entries: c.entries,
      ...(c.prose.length ? { prose: c.prose.join("\n") } : {}),
    }));
  const releases = parsed.releases
    .map((r) => ({ version: r.version, date: r.date, categories: shape(r.categories) }))
    .filter((r) => r.categories.length);
  const unreleased = shape(parsed.unreleased?.categories ?? []);
  return {
    unreleased: unreleased.length ? { categories: unreleased } : null,
    releases: limit ? releases.slice(0, limit) : releases,
  };
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--allow-empty") flags.allowEmpty = true;
    else if (arg.startsWith("--")) flags[arg.slice(2)] = argv[++i];
    else positional.push(arg);
  }
  return { flags, positional };
}

function main(argv) {
  const root = resolve(
    process.env.RELEASE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const [command, ...rest] = argv;
  const { flags, positional } = parseArgs(rest);
  const fail = (message) => {
    console.error(process.env.GITHUB_ACTIONS ? `::error::${message}` : `error: ${message}`);
    process.exitCode = 1;
  };
  try {
    if (command === "check") {
      const errors = check(root, { tag: flags.tag });
      if (errors.length) errors.forEach(fail);
      else console.log(`release metadata consistent (${readVersion(root, readConfig(root))})`);
    } else if (command === "next") {
      const config = readConfig(root);
      console.log(
        nextVersion(readVersion(root, config), flags.date ?? new Date().toISOString().slice(0, 10)),
      );
    } else if (command === "bump") {
      const result = bump(root, {
        version: positional[0],
        date: flags.date,
        allowEmpty: flags.allowEmpty,
      });
      console.log(
        `bumped ${result.from} -> ${result.to} (${result.date}); review the diff, then run check`,
      );
    } else if (command === "notes") {
      const maxChars = flags["max-chars"] ? Number(flags["max-chars"]) : undefined;
      console.log(
        notes(root, positional[0], {
          maxChars,
          audience: flags.audience,
          platform: flags.platform,
        }),
      );
    } else if (command === "export") {
      const limit = flags.limit ? Number(flags.limit) : undefined;
      const data = exportChangelog(root, {
        audience: flags.audience,
        platform: flags.platform,
        limit,
      });
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error(
        "usage: release.mjs check [--tag vX] | next [--date D] | bump [version] [--date D] [--allow-empty] | notes [version] [--audience app] [--platform P] [--max-chars N] | export [--audience app] [--platform P] [--limit N]",
      );
      process.exitCode = 2;
    }
  } catch (error) {
    fail(error.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2));
