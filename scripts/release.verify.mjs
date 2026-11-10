import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  bump,
  check,
  compareVersions,
  exportChangelog,
  nextVersion,
  notes,
  parseArgs,
  parseBody,
} from "./release.mjs";

const CHANGELOG = `# Changelog

## [Unreleased]

### Fixed

- Something new

## [2026.11.1] - 2026-11-10

### Added

- First release

[Unreleased]: https://github.com/tjorim/example/compare/v2026.11.1...HEAD
[2026.11.1]: https://github.com/tjorim/example/compare/v2026.9.3...v2026.11.1
`;

let root;
const write = (file, text) => writeFileSync(join(root, file), text);
const read = (file) => readFileSync(join(root, file), "utf8");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "release-test-"));
  write("VERSION", "2026.11.1\n");
  write("package.json", '{\n  "name": "x",\n  "version": "2026.11.1"\n}\n');
  write("app.py", 'app = App(version="2026.11.1")\nother = Thing(version="9.9.9")\n');
  write("CHANGELOG.md", CHANGELOG);
  write(
    "release.config.json",
    JSON.stringify({
      repo: "tjorim/example",
      targets: [
        { file: "package.json", pattern: '"version": "([^"]+)"' },
        { file: "app.py", pattern: 'App\\(version="([^"]+)"' },
      ],
    }),
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("versions", () => {
  it("counts MICRO within a month and restarts it in a new month", () => {
    assert.equal(nextVersion("2026.11.1", "2026-11-20"), "2026.11.2");
    assert.equal(nextVersion("2026.11.2", "2026-12-01"), "2026.12.1");
    assert.equal(nextVersion("2026.12.4", "2027-01-03"), "2027.1.1");
  });

  it("compares numerically, not lexically", () => {
    assert.equal(compareVersions("2026.9.3", "2026.11.1"), -1);
    assert.equal(compareVersions("2026.11.10", "2026.11.9"), 1);
    assert.equal(compareVersions("2026.11.1", "2026.11.1"), 0);
  });
});

describe("check", () => {
  it("passes on consistent metadata", () => {
    assert.deepEqual(check(root), []);
    assert.deepEqual(check(root, { tag: "v2026.11.1" }), []);
  });

  it("rejects a tag that does not match VERSION", () => {
    assert.match(check(root, { tag: "v2026.11.2" })[0], /does not match/);
  });

  it("rejects a malformed VERSION", () => {
    write("VERSION", "1.2.3\n");
    assert.match(check(root)[0], /not CalVer/);
    write("VERSION", "2026.13.1\n");
    assert.match(check(root)[0], /not CalVer/);
  });

  it("reports a drifted target", () => {
    write("package.json", '{ "version": "2026.9.3" }\n');
    assert.deepEqual(check(root), [
      'package.json: version "2026.9.3" does not match VERSION "2026.11.1"',
    ]);
  });

  it("reports a pattern that stopped matching", () => {
    write("app.py", "app = App()\n");
    assert.match(check(root)[0], /expected 1 match\(es\).*found 0/);
  });

  it("requires the changelog section and link references", () => {
    write("VERSION", "2026.11.2\n");
    write("package.json", '{ "version": "2026.11.2" }\n');
    write("app.py", 'App(version="2026.11.2")\n');
    const errors = check(root);
    assert.equal(errors.length, 2);
    assert.match(errors[0], /missing "## \[2026\.11\.2\]/);
    assert.match(errors[1], /missing link reference "\[2026\.11\.2\]/);
  });
});

describe("bump", () => {
  it("updates every file, cuts the changelog and leaves a consistent repo", () => {
    const result = bump(root, { date: "2026-11-20" });
    assert.deepEqual(result, { from: "2026.11.1", to: "2026.11.2", date: "2026-11-20" });
    assert.equal(read("VERSION"), "2026.11.2\n");
    assert.match(read("package.json"), /"version": "2026\.11\.2"/);
    assert.match(read("app.py"), /App\(version="2026\.11\.2"\)/);
    assert.match(read("app.py"), /Thing\(version="9\.9\.9"\)/); // untouched
    const changelog = read("CHANGELOG.md");
    assert.match(
      changelog,
      /## \[Unreleased\]\n\n## \[2026\.11\.2\] - 2026-11-20\n\n### Fixed\n\n- Something new/,
    );
    assert.match(changelog, /\[Unreleased\]: .*\/compare\/v2026\.11\.2\.\.\.HEAD/);
    assert.match(changelog, /\[2026\.11\.2\]: .*\/compare\/v2026\.11\.1\.\.\.v2026\.11\.2/);
    assert.deepEqual(check(root), []);
  });

  it("accepts an explicit version and rejects one that is not newer", () => {
    assert.equal(bump(root, { version: "2026.12.1", date: "2026-12-01" }).to, "2026.12.1");
    assert.throws(() => bump(root, { version: "2026.11.9", date: "2026-12-01" }), /not newer/);
  });

  it("refuses to cut an empty release unless asked", () => {
    bump(root, { date: "2026-11-20" });
    assert.throws(() => bump(root, { date: "2026-11-21" }), /\[Unreleased\] is empty/);
    assert.equal(bump(root, { date: "2026-11-21", allowEmpty: true }).to, "2026.11.3");
  });

  it("writes nothing when a target does not match", () => {
    write("app.py", "app = App()\n");
    assert.throws(() => bump(root, { date: "2026-11-20" }), /found 0/);
    assert.equal(read("VERSION"), "2026.11.1\n");
    assert.match(read("package.json"), /2026\.11\.1/);
    assert.equal(read("CHANGELOG.md"), CHANGELOG);
  });
});

describe("notes", () => {
  it("returns one section without the next heading or link references", () => {
    assert.equal(notes(root, "2026.11.1"), "### Added\n\n- First release");
    assert.equal(notes(root), "### Added\n\n- First release");
  });

  it("fails for a version without a section", () => {
    assert.throws(() => notes(root, "2026.11.9"), /no section for 2026\.11\.9/);
  });

  it("truncates oversized notes at a paragraph boundary and says so", () => {
    const bullets = Array.from({ length: 50 }, (_, i) => `- Entry ${i} ${"x".repeat(40)}`).join(
      "\n\n",
    );
    write("CHANGELOG.md", `## [Unreleased]\n\n## [2026.11.1] - 2026-11-10\n\n${bullets}\n`);
    const out = notes(root, "2026.11.1", { maxChars: 500 });
    assert.ok(out.length < 600);
    assert.match(out, /_Notes truncated — see CHANGELOG\.md/);
    assert.doesNotMatch(out, /Entry 4[0-9]/);
  });
});

const AUDIENCE_CHANGELOG = `# Changelog

## [Unreleased]

### Fixed

- **Android:** Sign-in survives a token refresh failure

## [2026.11.1] - 2026-11-10

### Added

- Calendar export
- **Android:** Widget for today's schedule
- **Web:** Keyboard navigation in the month grid
  that wraps onto a second line

### Fixed

- Timer starts at zero

### Internal

- **Backend:** Stable error codes on every router
- Python 3.15 in containers

## [2026.9.3] - 2026-09-29

### Internal

- Dependency updates

## 2026-01-01

- Legacy heading that is not a release

[Unreleased]: https://github.com/tjorim/example/compare/v2026.11.1...HEAD
[2026.11.1]: https://github.com/tjorim/example/compare/v2026.9.3...v2026.11.1
`;

describe("audiences and platforms", () => {
  beforeEach(() => {
    write("CHANGELOG.md", AUDIENCE_CHANGELOG);
    write(
      "release.config.json",
      JSON.stringify({
        repo: "tjorim/example",
        scopes: ["Android", "Web", "Backend"],
        platforms: ["Android", "Web"],
        targets: [
          { file: "package.json", pattern: '"version": "([^"]+)"' },
          { file: "app.py", pattern: 'App\\(version="([^"]+)"' },
        ],
      }),
    );
  });

  it("parses bullets with scopes, wrapped lines and category prose", () => {
    const categories = parseBody([
      "- Plain",
      "- **Web:** Wrapped",
      "  second line",
      "",
      "### Fixed",
      "",
      "- **Backend**: colon outside the bold",
      "",
      "Some prose.",
    ]);
    assert.deepEqual(categories[0], {
      name: null,
      entries: [
        { scope: null, text: "Plain" },
        { scope: "Web", text: "Wrapped\nsecond line" },
      ],
      prose: [],
    });
    assert.deepEqual(categories[1].entries, [{ scope: "Backend", text: "colon outside the bold" }]);
    assert.deepEqual(categories[1].prose, ["Some prose."]);
  });

  it("exports every release newest first, skipping non-release headings", () => {
    const data = exportChangelog(root);
    assert.deepEqual(
      data.releases.map((r) => r.version),
      ["2026.11.1", "2026.9.3"],
    );
    assert.equal(data.unreleased.categories[0].entries[0].scope, "Android");
  });

  it("hides Internal for the app audience and drops releases left empty", () => {
    const data = exportChangelog(root, { audience: "app" });
    assert.deepEqual(
      data.releases.map((r) => r.version),
      ["2026.11.1"],
    );
    assert.deepEqual(
      data.releases[0].categories.map((c) => c.name),
      ["Added", "Fixed"],
    );
  });

  it("keeps unscoped and matching entries for one platform", () => {
    const android = exportChangelog(root, { audience: "app", platform: "android" });
    const added = android.releases[0].categories[0].entries.map((e) => e.text);
    assert.deepEqual(added, ["Calendar export", "Widget for today's schedule"]);
    const web = exportChangelog(root, { audience: "app", platform: "Web" });
    assert.deepEqual(
      web.releases[0].categories[0].entries.map((e) => e.text),
      ["Calendar export", "Keyboard navigation in the month grid\nthat wraps onto a second line"],
    );
    assert.equal(web.unreleased, null); // the only unreleased entry is Android's
  });

  it("limits releases and rejects an unconfigured platform", () => {
    assert.equal(exportChangelog(root, { limit: 1 }).releases.length, 1);
    assert.throws(() => exportChangelog(root, { platform: "ios" }), /unknown platform "ios"/);
  });

  it("re-renders filtered notes as Markdown and leaves unfiltered notes untouched", () => {
    assert.equal(
      notes(root, "2026.11.1", { audience: "app", platform: "Android" }),
      "### Added\n\n- Calendar export\n- **Android:** Widget for today's schedule\n\n### Fixed\n\n- Timer starts at zero",
    );
    assert.match(notes(root, "2026.11.1"), /### Internal\n\n- \*\*Backend:\*\* Stable error codes/);
  });

  it("validates categories and scopes in [Unreleased] only", () => {
    write("package.json", '{ "version": "2026.11.1" }\n');
    write("app.py", 'App(version="2026.11.1")\n');
    assert.deepEqual(check(root), []);
    write(
      "CHANGELOG.md",
      AUDIENCE_CHANGELOG.replace(
        "### Fixed\n\n- **Android:** Sign-in survives a token refresh failure",
        "### Fix\n\n- **Andriod:** typo\n\n### Added\n\n- **Ios:** not configured",
      ).replace("### Added\n\n- Calendar export", "### Addd\n\n- Calendar export"),
    );
    const errors = check(root);
    assert.equal(errors.length, 3);
    assert.match(errors[0], /unknown category "### Fix"/);
    assert.match(errors[1], /scope "\*\*Andriod:\*\*"/);
    assert.match(errors[2], /scope "\*\*Ios:\*\*"/); // released "### Addd" is history, not validated
  });

  it("merges same-named categories on export and rejects them in [Unreleased]", () => {
    const stacked = `## [Unreleased]

### Fixed

- One

### Added

- Two

### Fixed

- Three

## [2026.11.1] - 2026-11-10

### Fixed

- Old A

### Added

- Old B

### Fixed

- Old C

[Unreleased]: https://github.com/tjorim/example/compare/v2026.11.1...HEAD
[2026.11.1]: https://github.com/tjorim/example/releases/tag/v2026.11.1
`;
    write("CHANGELOG.md", stacked);
    write("package.json", '{ "version": "2026.11.1" }\n');
    write("app.py", 'App(version="2026.11.1")\n');
    const [release] = exportChangelog(root).releases;
    assert.deepEqual(
      release.categories.map((c) => [c.name, c.entries.map((e) => e.text)]),
      [
        ["Fixed", ["Old A", "Old C"]],
        ["Added", ["Old B"]],
      ],
    );
    assert.deepEqual(check(root), [
      'CHANGELOG.md: [Unreleased] has "### Fixed" more than once; merge them',
    ]);
  });

  it("leaves a ### Planned list under [Unreleased] when cutting a release", () => {
    write(
      "CHANGELOG.md",
      `## [Unreleased]

### Planned

- Calendar export
- Team carousel

### Fixed

- Shipped fix

## [2026.11.1] - 2026-11-10

### Added

- First

[Unreleased]: https://github.com/tjorim/example/compare/v2026.11.1...HEAD
[2026.11.1]: https://github.com/tjorim/example/releases/tag/v2026.11.1
`,
    );
    bump(root, { date: "2026-11-20" });
    const changelog = read("CHANGELOG.md");
    assert.match(
      changelog,
      /## \[Unreleased\]\n\n### Planned\n\n- Calendar export\n- Team carousel\n\n## \[2026\.11\.2\] - 2026-11-20\n\n### Fixed\n\n- Shipped fix\n\n## \[2026\.11\.1\]/,
    );
    assert.deepEqual(check(root), []);
    // Only Planned left: nothing to release.
    write("CHANGELOG.md", changelog.replace("### Fixed\n\n- Shipped fix\n\n", ""));
    assert.throws(() => bump(root, { date: "2026-11-21" }), /nothing to release/);
  });

  it("rejects an unknown audience instead of silently showing Internal entries", () => {
    for (const audience of ["App", "apps", "internal"]) {
      assert.throws(() => exportChangelog(root, { audience }), /unknown audience/);
      assert.throws(() => notes(root, "2026.11.1", { audience }), /unknown audience/);
    }
  });
});

describe("command line", () => {
  const script = fileURLToPath(new URL("./release.mjs", import.meta.url));
  const run = (...args) =>
    spawnSync(process.execPath, [script, ...args], {
      env: { ...process.env, RELEASE_ROOT: root },
      encoding: "utf8",
    });

  it("parses values, booleans and positionals", () => {
    assert.deepEqual(parseArgs(["2026.12.1", "--date", "2026-12-01", "--allow-empty"]), {
      flags: { date: "2026-12-01", allowEmpty: true },
      positional: ["2026.12.1"],
    });
    assert.equal(parseArgs(["--limit", "3"]).flags.limit, "3");
    assert.equal(parseArgs(["--tag", ""]).flags.tag, "");
  });

  it("rejects a flag without a value, an unknown flag and a bad count", () => {
    assert.throws(() => parseArgs(["--tag"]), /--tag needs a value/);
    assert.throws(() => parseArgs(["--tag", "--audience", "app"]), /--tag needs a value/);
    assert.throws(() => parseArgs(["--bogus", "x"]), /unknown option --bogus/);
    for (const bad of ["abc", "0", "-1", "1.5", "12x"]) {
      assert.throws(() => parseArgs(["--limit", bad]), /positive whole number/);
      assert.throws(() => parseArgs(["--max-chars", bad]), /positive whole number/);
    }
  });

  it("fails check instead of skipping the tag comparison when --tag has no value", () => {
    const result = run("check", "--tag");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--tag needs a value/);
    assert.equal(run("check", "--tag", "v2026.11.1").status, 0);
  });

  it("reports bad option values through the normal error path", () => {
    assert.match(run("notes", "--max-chars", "abc").stderr, /positive whole number/);
    assert.match(run("export", "--audience", "App").stderr, /unknown audience/);
    assert.match(run("next", "--date", "tomorrow").stderr, /not YYYY-MM-DD/);
    assert.equal(run("export", "--audience", "App").status, 1);
  });
});
