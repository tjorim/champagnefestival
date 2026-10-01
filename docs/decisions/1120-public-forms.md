# Owned public form controls

Issue: [#1120](https://github.com/tjorim/champagnefestival/issues/1120).
Local implementation: 2026-10-01. Bootstrap removal remains owned by #1111.

## Implementation

Reuses the Field, Input, Textarea, Select, Checkbox and Switch primitives
generated for #1119 and generates one new Base UI primitive, `RadioGroup`
(`src/components/ui/radio-group.tsx`), for the self-service poll. Bootstrap
reboot and runtime theme-link ordering are unchanged.

`src/components/PublicFields.tsx` is a thin layer over `AdminFields`: the same
label/description/error association helpers and owned controls, with
`data-public-form="true"` on each control and label so theme stylesheets can
retain public typography and geometry without matching admin controls. The
Select popup previously always rendered in the fixed-dark admin scope;
`SelectContent` and `AdminSelect` now take `admin` (default `true`, so admin is
unchanged) and public selects pass `false`, so the popup follows the runtime
theme, including inside the public registration/request dialogs.

Domain state is unchanged: TanStack Form stays where it already existed
(`ContactForm`, `RegistrationModal`, `MyAccountPage`, `MyRegistrationsPage` email
form); the account-request dialog, language preference and check-in search keep
their plain React state. No form library is added. Native `<form>` elements
keep submission ownership, `noValidate`, honeypot inputs, `autoComplete`,
`required`, `min`/`max`/`maxLength`, numeric parsing and blur-time identity
number formatting. Controls keep their explicit IDs (`res-name`, `name`,
`my-registrations-email`, `manual-checkin-query`, …) so existing e2e selectors
and labels still resolve. Duplicate-submit protection (`disabled`/`aria-busy`
while pending, the stable contact `submissionId`) is untouched.

Behaviour notes:

- Validation errors render through `PublicError` (`role="alert"`) and the control
  receives `aria-invalid` plus an `aria-describedby` for its description and error.
  The `/me` email form keeps its explicit `aria-describedby` to the existing
  external alert container.
- Help text uses `PublicDescription`, so the notes and language fields are
  described programmatically without hand-written IDs. The marketing opt-in keeps
  an explicit description reference because checkboxes render their own label.
- The meal poll renders a labelled `RadioGroup` (arrow-key navigation, group name
  from the heading) and a labelled checkbox group for dinners; selections still
  save on change and are disabled while a save is pending.
- Language and request-type selects now use the owned popup. Tests choose options
  through the visible popup instead of dispatching native change events.
- Inline `fontSize`/`minWidth`/`textAlign`/`minHeight` styles in
  `RegistrationModal` and `ContactForm` became static utilities.

No write operation, endpoint, payload or retry strategy changed, so
`docs/retry-safety.md` needs no new entry.

## Theme handling

Important Tailwind utilities (layer `utilities`) outrank unlayered theme rules,
so themes cannot override a control's colours or radius by property. They instead
set the `--surface-*` tokens (and `--radius-md`) on the control, which the
utilities consume:

- Refresh and Riviera: the standalone check-in/my-registrations `.form-control`
  and `.form-select` overrides are removed; the controls now consume
  `--card-background` and `--text-color` directly (the old overrides forced the
  same `#fffaf0`/`--text-color` values).
- Cuvée: control background `#fffdf4`, ink text, hairline border, 2px radius and
  foil-deep focus colour via token overrides; labels keep ink colour.
- Remuage: white control, `--rem-line-strong` border, 8px radius, 46px minimum
  height (no competing utility), blue focus border; labels keep grape colour and
  750 weight (`--font-weight-medium` override). The generic `legend` rule stays
  because raw `<fieldset>` legends remain in the registration dialog.
- Classic needed no rule.

## Final source and CSS audit

- Scoped Bootstrap Form imports: **6 → 0**. Scoped opening Form/nested tags:
  **76 → 0** (CheckIn 5, Contact 13, Account 18, Registrations 11, Push 1,
  Registration modal 28). No `react-bootstrap/Form` import remains anywhere in
  `frontend/src`. Searches:
  `rg 'react-bootstrap/Form|<Form[. >]' frontend/src` and
  `rg 'form-control|form-select|form-check|form-label|form-text|invalid-feedback|input-group|is-invalid' frontend/src frontend/e2e frontend/public --glob '!*.md'`
  (only the negative Playwright assertions mention the classes).
- Recursive owned CSS form-family selector references: **26 → 0**. Removed: Refresh
  (3 selector groups), Riviera (1), Cuvée (`.form-control`, `.form-select`,
  `:focus`, `::placeholder`, `.form-label`, `.form-check-label`,
  `.input-group-text`) and Remuage (`.form-label`, `.form-control`, `.form-select`,
  `:focus`, `::placeholder`). Retained custom hooks: Remuage `legend` and the
  generic `.bg-dark`/`.border-secondary` standalone overrides, which still style
  other check-in/account elements owned by #1121–#1123.
- Vendor-generated form/validation classes: **29 → 29**. Bootstrap still generates
  them until #1111. Regenerated with `pnpm lint`; the generated allow-list is never
  edited by hand.
- Frozen override entries: **17 → 15**. Allowed inline properties: **49 → 45**.
  The `ContactForm` and `RegistrationModal` entries are removed. Nothing was added.
- Remaining `react-bootstrap` importers: 51 files (buttons, alerts, spinners,
  badges, tabs-adjacent and custom views), owned by #1121–#1123.

## Verification and evidence

New and updated tests: `PublicFields.test.tsx` (label/description/error
association, axe, theme-following Select popup, keyboard selection and focus
restoration, consent checkbox, radio-group arrow navigation), two
`RegistrationModal` tests (preferred-language payload via the popup, invalid field
association) and the `MyRegistrationsPage` language tests, which now interact with
the popup. Existing domain tests for contact validation, registration products and
waitlist, volunteer poll/identity forms, push consent, passwordless email requests
and check-in search pass unchanged.

`e2e/public-forms.spec.ts` is a theme/viewport matrix: all five themes,
light/dark preferences, 1440/390px. Each case drives the landing contact form
(error association), the registration dialog (real pointer selection through the
popup above the backdrop, popup outside the admin scope, focus restoration,
keyboard checkbox), `/me` and `/check-in`, asserts no legacy form DOM classes or
horizontal overflow, and captures four screenshots (80 total, untracked, in
`/tmp/1120-evidence`). Desktop and mobile samples across Cuvée, Remuage, Refresh,
Riviera and Classic were reviewed.

Final checks: `pnpm format:check`, `pnpm lint` (existing warnings only),
`pnpm typecheck`, app and service-worker builds and all **187 Playwright checks**
pass. The full parallel unit run passes **770 of 771** tests: the one failure,
`admin.RegistrationListBulkSelection`, exceeds its 5s timeout under load, fails
identically on the unmodified base commit and passes alone in about two seconds.

Observation unrelated to forms: Riviera's standalone check-in page shows a narrow
"Scan a QR code" alert beside the scanner at 1440px. That alert is not touched
here (buttons/alerts belong to #1121/#1122).

Keep #1120 active pending review and screenshot publication on an eventual PR.
#1109 and #1111 status below remain in force; this issue alone does not
authorize final Bootstrap removal.
