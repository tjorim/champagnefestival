# UI dependency and component maintenance

This app uses the `base-vega` shadcn registry, locally owned components and the `@base-ui/react` runtime. The exact shadcn CLI version is a dev dependency; Dependabot can update it alongside the other package declarations.

## Ownership and records

Dependabot proposes package and lockfile updates. It does not update copied
component source or prove interaction compatibility. Keep Base UI runtime
updates separate from registry-source changes so regressions are attributable.

`frontend/ui-maintenance.json` inventories the shared UI directory and selected direct
Base UI compositions, with the source origin and maintenance decision for each.
CI runs `pnpm ui:check` offline: missing files, new untracked components, invalid
registry baselines and an unpinned CLI fail the check. Screens and consumers
outside the shared directory still need review when their primitive APIs change.

`ui-upstream.json` preserves canonical registry source and dependency snapshots.
The SHA-256 content hash is the captured upstream revision. A pinned CLI does
**not** pin the remotely served registry, which can change independently.
`capturedAt` means a comparison baseline was saved, not that a component was
approved. A null `reviewedAt` explicitly means source review is pending.
Reviewed entries include a decision, validation note and local source hash;
`ui:check` reports when local source has changed since that historical review.
Do not label the initial captured inventory as a completed visual/source audit.

## Routine review

Run from `frontend/`, using the project's Node and pnpm versions:

```sh
pnpm install --frozen-lockfile
pnpm ui:check
pnpm ui:test
pnpm ui:upstream
```

Run the upstream comparison monthly, and whenever a Base UI or shadcn update
PR is reviewed. With no pending record to recover, it writes only ignored
`.ui-maintenance/` reports. Exit code 0
means no captured upstream definitions changed, 1 means review is needed, and
2 means validation/network/tooling failed. None of these means a UI change is
safe to merge. Package installation is frozen; never overwrite all components
or raise bundle budgets just to make an update pass.

Compare a selected component with the owned source:

```sh
pnpm ui:upstream checkbox
pnpm ui:diff checkbox
```

`ui:diff` resolves the locally installed, pinned shadcn entry and launches it
with the current Node executable, avoiding Windows batch-file launchers or a
shell. It passes component names before
`--dry-run --diff`. It never installs or overwrites application components.
The upstream snapshot comparison detects changes since our captured revision;
the CLI diff compares today's registry with our customised local component.
Read both to distinguish an upstream fix from a deliberate local difference.
The CLI may show dependent components too. Preserve localisation, tokens,
accessible names, focus return, dirty guards, component APIs and documented
keep/extend decisions. Optional new exports are not automatically requirements.

After reviewing a component, applying relevant fixes and completing validation,
record the exact upstream snapshot and decision:

```sh
pnpm ui:record checkbox --note "Describe the upstream changes reviewed, keep/apply decision, and validation actually run."
pnpm exec oxfmt ui-maintenance.json ui-upstream.json
pnpm ui:check
```

Use a truthful note describing what was reviewed and tested. `ui:record` fetches
the current definition, updates that baseline and saves the local source hash.
Inspect its diff against the snapshot you reviewed before committing: if the
registry changed during review, compare again. Never run it as an automatic
blanket approval or merely to silence a changed-upstream report.

For a new component, generate only what has a consumer with
`pnpm exec shadcn add <name>`. Add its files, registry origin and decision to the
inventory; `pnpm ui:record <name> --note "..."` records its snapshot after review.
Initial registration with `ui:record` captures the snapshot and hash for that
new inventory entry; `ui:check` requires them on subsequent runs.
For a local composition, set `registry: null`, `origin: "local"` and explain
why the custom implementation stays.

## Interrupted review-record saves

`ui:record` publishes a complete exclusive `.ui-maintenance-record.json` journal
before replacing either metadata file. Each file is staged and atomically
replaced. The journal stores the exact before/after contents of both files and
stays in place if a replacement fails or the process stops.

The next maintenance command finishes that saved update **before** reading and
validating the snapshot hashes, without fetching another registry revision.
After fixing any filesystem permission problem, run `pnpm ui:check` first to
recover, then format the metadata and retry the review command if needed.
Successful completion removes the journal. Staging files and the journal are
ignored by Git; never commit them.

Run metadata commands serially in a checkout. A live journal owner is refused
rather than taken over. If either file differs from both its recorded before
and after contents, recovery stops to preserve the independent edit. Keep the
current files and journal, reconcile those edits with the saved update, then
retry; do not delete the journal merely to silence validation. This recovery
plan addresses process interruption, not conflicting concurrent edits or a
blanket approval of the saved source.

## Validation before merging

Read the Base UI release notes and map changes to actual imports, including
consumers outside the shared UI folder. Check changed event callbacks,
controlled state, native-button behaviour, unmounting, portal and focus APIs.
Run generation, tests and builds sequentially to avoid translation-file races.

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test --maxWorkers=2
pnpm build
pnpm test:e2e
```

Use the existing E2E/auth setup documented in the repository; do not bypass
real authentication or point tests at production data. At least exercise:

- Dialog/alert dialog: Tab/Shift+Tab, Escape, outside press, initial/return focus,
  nested confirmation, dirty drafts and busy-state dismissal.
- Select/combobox/autocomplete: arrows, Enter/Escape, typeahead, asynchronous
  results, clearing, disabled options and selected values outside results.
- Fields/radio/checkbox/switch: label association, validation, keyboard changes
  and submitted values; calendar/date input: locale and selected dates.
- Menus/checkboxs/tabs/accordions actually used: focus navigation, dismissal,
  disabled controls and kept-mounted content.
- Light and dark, desktop and narrow mobile; both supported locales where
  applicable; accessible names, axe checks and no horizontal overflow.
- Production entry/route chunks against the existing CI bundle budgets. If a
  budget fails, compare old/new runtime on the same code and dependency set.

In the PR, record runtime/CLI versions, components examined, keep/apply decisions,
test commands/results, bundle comparison and any independently reproduced
baseline failures. Include screenshots for visual changes under repo policy.
A passing inventory check is bookkeeping, not a compatibility approval.

## Initial review (2026-10-24)

Base UI 1.9 upgrade PR #1298 exposed an unstable entry-chunk budget
([#1398](https://github.com/tjorim/champagnefestival/issues/1398)). An A/B build
on the same source and dependency set with Vite's manifest showed the entry
moving from 472,542 to 583,315 bytes, while its complete static-import closure
only grew from 727,278 to 729,833 bytes. Total asset JavaScript decreased from
2,797,644 to 2,793,374 bytes. Most of the apparent regression was shared modules
moving into `index`, rather than added code downloaded by visitors.

The build now gives React, React DOM and Scheduler an explicit `react-vendor`
cache boundary. `pnpm bundle:check` retains the existing 520 KiB entry, 450 KiB
AdminDashboard and 2,800 KiB total limits, and adds a 720 KiB limit for the full
eager JavaScript graph. It follows static manifest imports, counts shared
chunks once, and excludes deferred routes; it does not treat a smaller entry
file alone as a smaller first load. Missing manifest dependencies fail the check.
Run it after `pnpm build`; CI also runs its graph/budget regression tests.

## References

- [Base UI releases](https://base-ui.com/react/overview/releases)
- [shadcn CLI dry-run/diff](https://ui.shadcn.com/docs/cli)
- [shadcn changelog](https://ui.shadcn.com/docs/changelog)

## Cross-app import and tooling conventions

Application screens import shared controls from the app's local UI boundary:
`@/components/ui/<component>`. Keep the configured alias; physical folders and existing
visual presets need not match between applications. Use the same rule for type
imports. Cross-directory relative paths into shared UI are rejected.

Only files in the inventoried shared UI directories import Base UI primitives
normally. Use explicit component subpaths, never the `@base-ui/react` barrel.
Local adapters can re-export an existing primitive API unchanged where an app
intentionally owns styling outside the component. Do not generate a second
styled implementation just to create an import boundary.

A composition outside the UI directory may import exact primitive modules only
when its file is inventoried and `importPolicy.baseUiExceptions` records the
owning component, allowed modules and reason. This covers genuine shared
compositions such as guarded dialogs, pointer-anchored menus and chart tooltips;
it is not a blanket exception for screens. New primitive imports require a
local adapter or an explicit reviewed exception. Do not add Radix or the retired
`@base-ui-components` package alongside the Base UI stack.

UI code imports `cn` through `@/lib/utils` where that helper is used. Keep
app-specific variants, classes, locale behaviour, labels and semantics.
Daynest's existing native/Bootstrap controls remain supported; this convention
does not initialise shadcn or introduce a visual migration there.

```sh
pnpm ui:usage  # Parse owned application imports and re-exports with Oxc
pnpm ui:check  # Inventory plus import policy
pnpm ui:test  # Tooling and import-policy regression tests
```

The import check covers static imports/re-exports, literal dynamic imports,
require calls and TypeScript import types. Test files and generated Paraglide
output are excluded; normal lint/type checking still covers application syntax.
It does not execute fetched registry code or replace interaction testing.

Use each package's exact `packageManager` declaration and committed
`.node-version` as the frontend tooling sources of truth. The app packages use
pnpm 10.33.0; CI must read the package declaration rather than keeping a second
hard-coded pnpm version. Frontend Node setup reads `.node-version`. Keep tool
changes in reviewable PRs and preserve runtime-version/bundle investigations as
separate work.
