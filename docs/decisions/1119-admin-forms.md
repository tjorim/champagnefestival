# Owned admin form controls

Issue: [#1119](https://github.com/tjorim/champagnefestival/issues/1119).
Local implementation: 2026-10-01. Bootstrap removal remains owned by #1111.

## Implementation

Generated Field, Input, Textarea and Switch on demand with the committed
`base-vega` configuration, moved the CLI's literal `@/` output into
`src/components/ui`, and restyled the source with the prefix-aware `cn` helper,
semantic runtime tokens and `tw:` utilities. Existing owned Select and Checkbox
primitives are reused. Bootstrap reboot and runtime theme-link ordering remain.

`AdminFields` shares label, description and validation-error associations across
TanStack render props. Explicit control IDs are preserved; unnamed groups receive
stable React IDs. Input/textarea controls keep browser types, rows, constraints,
autofill, change/blur callbacks and validation state. Native forms keep submission
ownership. Checkboxes and switches retain labels and pending disabled states.
Select descriptors preserve dynamic option lists, groups, disabled options,
empty-string values and numeric-ID conversion while rendering Base UI Select
items. Callers receive values directly; no synthetic browser events are created.
Select popups now use the shared popup z-index above dialog backdrops, limit
height and wrap long option labels; selected labels truncate within narrow fields.

All 21 existing TanStack Form source importers remain (17 in this scoped inventory).
No form library is added to searches or filters. State, validators, numeric/date
parsing, dirty baselines, reset logic, settings refresh protection, event drafts,
manual table pagination and submission payloads retain their existing owners.
No API write operation or retry strategy changes, so `docs/retry-safety.md` needs
no new entry.

## Final source and CSS audit

- Scoped Bootstrap Form imports: **28 → 0**. Scoped opening Form/nested tags:
  **486 → 0**. No raw Bootstrap form/validation classes remain in admin TSX.
  Searches: `rg 'react-bootstrap/Form|<Form[. >]' frontend/src/components/admin`
  and `rg 'form-control|form-select|form-check|form-label|invalid-feedback|valid-feedback|input-group' frontend/src/components/admin --glob '*.tsx'`.
- Six public Form importers remain, explicitly owned by #1120. Shared PushOptIn
  can still appear beneath admin; its public consent renderer retains that owner.
  Remaining button/feedback/custom-plan classes have #1121/#1122/#1123 owners.
- Recursive owned CSS form-family selector references: **44 → 26**. All 18
  obsolete admin references are removed from `admin.css` and Remuage admin CSS;
  remaining 26 references style public forms and remain for #1120. Refresh and
  Riviera retain standalone check-in/account overrides, Cuvée and Remuage retain
  public control/label/input-group styles, and Classic has no obsolete form rule.
  None of these retained selectors match the new admin control slots.
- Vendor-generated form/validation classes remain **29 → 29**, using prefixes
  `form-`, `input-group`, `invalid-`, `valid-`, `is-invalid`, `is-valid` and
  `was-validated`. Bootstrap still generates them until #1111. Regenerated with
  `pnpm lint`; the generated file is never edited manually.
- Frozen override entries: **34 → 17**. Explicit allowed inline properties:
  **88 → 49**. Every scoped file's frozen inline exception is removed. Static
  dimensions and typography use utilities, including image/search presentation
  in the migrated files. LayoutEditor's former file-wide disabled rule is removed;
  retained dynamic floor-plan geometry, interaction state and saved room colours
  have narrowly bounded, documented source exceptions around each style expression.
  VenueManagement similarly retains only a narrow saved room-colour exception.
  Domain coordinates and custom canvas artwork remain owned by #1123. Remaining
  baseline entries cover other public/custom/vendor/test owners, never new controls.

## Verification and evidence

The existing domain tests now open visible select popups and choose options
through pointer interaction instead of dispatching native select change events.
They still check allocations, booking payloads, product constraints, filters,
venue shape/dimension changes, edit prefills and dirty refresh/draft protection.
Four new field tests cover keyboard selection and focus restoration, generated
label/description/error association, grouped/empty/disabled options, labelled
switch interaction and prevention of accidental submission.

The browser matrix covers all five themes, light/dark preferences and 1440/390px
viewports. Each case captures public check-in and an admin member form, verifies
fixed-dark control colours, labels, keyboard switch activation, selecting through
a portal above a dialog, focus restoration, removal of legacy form DOM classes
and page/dialog overflow. Screenshots are untracked evidence in
`/tmp/1119-evidence/admin-forms*`; inspect and publish them on the eventual PR.

Final checks pass: `pnpm format:check`, `pnpm lint` (existing warnings only),
`pnpm typecheck`, all **764 unit tests**, app and service-worker builds, and
**66 Playwright checks** including authentication setup, 20 form-matrix cases
and 45 existing relevant checks. The matrix produces 40 public/admin screenshots;
[local gallery](/tmp/1119-evidence/index.html). Desktop and mobile samples were
visually reviewed. `git diff --check` passes.
Production translation generation and Vite must run sequentially: their different
Paraglide settings can otherwise overwrite the dev runtime during browser tests.
The build uses `TMPDIR=/home/jorim/.cache/champagne-1119-tmp` because the shared
system temporary filesystem reached its quota during an initial build.

Keep #1119 active pending review and screenshot publication on an eventual PR.
Update #1109 and #1111 with this local status; their historical specification and
remaining final-removal gates remain in force.
