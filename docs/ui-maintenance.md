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

The eager limit was raised from 720 to 725 KiB (2026-10-25). The graph measured 719.7 KiB on main, so
the one new translated API error message (`payment_reversal_amount_invalid`, three languages) was
enough to cross it (720.1 KiB). Messages are bundled eagerly, so each stable error code costs a few
hundred bytes; the 5 KiB of headroom covers a handful of them before the next review.

The total limit was raised from 2,800 to 2,820 KiB (2026-10-26) for the public-site and admin
usability pass (+4.4 KiB: 2,797.5 to 2,801.9). The new code is small and the eager graph moved
720.1 to 722.5 KiB, still inside its 725 KiB ceiling; no dependencies were added.

Re-verified on main with Base UI 1.9.0 (2026-10-24): `pnpm typecheck` and
`pnpm test` (174 files, 1,229 tests) pass, and `pnpm bundle:check` reports
total 2,729.7 KiB, entry 367.5 KiB, AdminDashboard 388.8 KiB and eager graph
712.5 KiB against unchanged budgets. The regression was chunk placement, not
added code, so no application code was deferred. The eager graph has only
7.5 KiB of headroom; investigate before adding eager dependencies.

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

### Workspace feature budget review — 2026-10-28 (#1421)

The total JavaScript limit is now 2,910 KiB (from 2,870). The same-dependency
baseline measured 2,881.4 KiB before the workspace implementation, already above
the previous limit. The workspace, verified membership summary and NL/FR/EN copy
bring it to 2,892.5 KiB (+11.1 KiB). CI run 40758357206 reproduced that total;
its locale audit, typecheck, lint, tests and build passed. The new limit leaves
17.5 KiB of headroom. No dependency or browser target changed, and no runtime
code was removed to meet the size check.

Entry (270.3 / 325 KiB), AdminDashboard (426.7 / 450 KiB) and eager graph
(664.1 / 665 KiB) retain their existing limits. In particular, the eager graph
remains tight and must be reviewed before adding another eager dependency.


### Public offline feature budget review — 2026-10-29 (#1440 / PR #1466)

CI run 40912655767 and the local production build both measured total JavaScript
2,915.7 KiB, entry 333.7 KiB, AdminDashboard 425.0 KiB and eager graph 666.4 KiB.
The offline notice, cache-timestamp lookup, public write guards and NL/FR/EN
messages add application behaviour without introducing dependencies. The worker
itself is emitted separately as `sw.js`, outside the measured application graph.

Raise total 2,910 → 2,920 KiB, entry 325 → 335 KiB and eager 665 → 670 KiB.
These limits leave 4.3, 1.3 and 3.6 KiB of headroom respectively. AdminDashboard
retains its 450 KiB limit. Keep all four checks, eager dependency traversal and
OIDC isolation enforcement enabled. The failed CI job passed every earlier step;
the correction changes only the reviewed limits, with no runtime changes.
