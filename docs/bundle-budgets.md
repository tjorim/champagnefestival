# Bundle budget contract

Run these commands from the app package (the repository root for Bordertax,
`frontend/` for Champagnefestival, Daynest, Travel and Worktime):

```sh
pnpm build
pnpm bundle:report
pnpm bundle:report --json
pnpm bundle:test
pnpm bundle:check
```

The five apps keep identical `scripts/bundle-budget.mjs` and
`scripts/bundle-budget.verify.mjs` implementations. Propagate measurement or
fixture-test changes to all five repositories together. Paths, limits and
application-specific guards belong in each package's `bundle-budget.json`.
A separate published package is not required to run the checks offline with
frozen dependencies.

## Measurement

- Initial JavaScript is the union of each HTML entry's local module scripts,
  modulepreload links and their transitive static imports and re-exports.
  Count shared dependencies once per entry; do not follow dynamic `import()`.
- Resolve relative, parent-relative and base-prefixed URLs, including query
  strings. Parse JavaScript with Oxc rather than matching imports with regexes.
  Missing local entries/imports, invalid JavaScript and incorrect bases fail
  instead of silently undercounting. External URLs are excluded: this measures
  first-party build assets, not all browser network traffic.
- Total JavaScript includes all `.js` and `.mjs` files recursively below
  `dist/assets`, including lazy chunks and emitted workers. Root service-worker
  scripts, source maps, CSS, fonts and images are not included. Total is counted
  once across HTML entries, rather than summing their overlapping closures.
- Store limits and JSON output in **bytes**. Human-readable output uses decimal
  **kB (1000 bytes)**. Gzip is level 6 per file, summed to reflect separate
  downloads; raw bytes remain a separate parsing/execution-size signal.

## Configuration and policy

`entries` maps stable entry names to built HTML files. `base` matches Vite's
public base path. `budgets.entries` sets per-entry `raw` and `gzip` ceilings;
`budgets.total` sets total `raw` and `gzip` ceilings. Optional `entryRaw` guards
only an entry's module scripts, not its whole closure. Optional named `chunks`
budgets aggregate a file-pattern match and require that chunk to exist.
`forbidInitial` rejects matching files anywhere in an entry's initial closure.
Champagnefestival retains its public OIDC exclusion and admin/entry chunk
ceilings through these optional guards.

`bundle:report` reports without enforcing size limits; `bundle:check` applies
limits and returns a nonzero exit code on a breach or measurement error. Both
accept `--json` with the same measurements and explicit failure messages. CI
runs the fixture tests and enforcing check after building in every app.

Limits are app-specific, not universal performance targets. Newly measured
limits have about 5% headroom. Existing byte ceilings are preserved during
migration. Keep initial-load limits as the primary signal, and total size as a
secondary regression guard. Explain justified changes in `docs/ui-maintenance.md`;
do not freeze useful features out because of an arbitrary threshold. Revisit
limits after dependencies or splitting change. A passing budget does not prove
responsiveness, accessibility or browser compatibility.

Legacy package commands remain aliases to this implementation where they
already existed. There is only one measurement/check implementation per app.
