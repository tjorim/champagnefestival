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
PR is reviewed. It writes only ignored `.ui-maintenance/` reports. Exit code 0
means no captured upstream definitions changed, 1 means review is needed, and
2 means validation/network/tooling failed. None of these means a UI change is
safe to merge. Package installation is frozen; never overwrite all components
or raise bundle budgets just to make an update pass.

Compare a selected component with the owned source:

```sh
pnpm ui:upstream popover
pnpm ui:diff popover
```

`ui:diff` invokes the pinned CLI with component names before
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
pnpm ui:record popover --note "Keep local tokens; reviewed upstream focus fix; keyboard and browser checks passed."
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
- Menus/popovers/tabs/accordions actually used: focus navigation, dismissal,
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

Base UI 1.9 upgrade PR #1298 has a verified entry-bundle regression: the same PR code built to 476,274 bytes on 1.8 and 583,290 bytes on 1.9, above the 520 KiB budget. Tests and E2E passed. A component-subpath import did not reduce the regression. Tracked in [#1398](https://github.com/tjorim/champagnefestival/issues/1398). This workflow does not resolve or approve that runtime upgrade.

## References

- [Base UI releases](https://base-ui.com/react/overview/releases)
- [shadcn CLI dry-run/diff](https://ui.shadcn.com/docs/cli)
- [shadcn changelog](https://ui.shadcn.com/docs/changelog)
