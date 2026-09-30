# Remaining Bootstrap migration audit

Issue: [#1109](https://github.com/tjorim/champagnefestival/issues/1109), under
[#1103](https://github.com/tjorim/champagnefestival/issues/1103).
Snapshot: 2026-09-30, checkout `31fc53a`. Counts describe this checkout, not
production or the original 2026-09-29 issue inventory. Re-audit before each change.

## Inventory and measurement

There are 52 source files importing `react-bootstrap`: 36 admin components,
15 other components and `src/main.tsx`. No barrel imports remain. The remaining
control types and full importer inventory appear below. There are 34 Form
importers (28 admin, six public), and 21 TSX files importing TanStack Form.
Dialogs, tables, Comboboxes and navigation/disclosure primitives already have
#1106–#1108 owners; preserve their behavior rather than reopen those migrations.
Their surrounding raw Bootstrap classes are still in scope here.

Owned CSS totals 6,149 lines: 5,285 in recursive `public/themes/**/*.css`
(including Remuage's imported sheets), and 864 in component stylesheets
(admin 697, announcements 108, theme switcher 34, analytics 25). Lines are
physical lines, including comments/blank lines, not bundle size or migration effort.
Keep all five visual themes and required Leaflet/Swiper vendor styling.

The #1104 generator currently produces 4,343 unique allowed class names from
Bootstrap, icons, retained vendors and owned CSS. The frozen baseline has
40 file override entries, including test files. The following family
counts use the actual generated allow-list. Lexical references are distinct
matching tokens in TS/TSX source, not an AST or rendered-DOM count: imported
components generate many classes at runtime, so zero literal references does
not mean unused CSS. Dynamic constructions need manual review.

| Family | Generated allowed classes | Lexically referenced classes |
| --- | ---: | ---: |
| Layout, spacing, sizing and typography | 1,049 | 127 |
| Cards and lists | 34 | 1 |
| Forms and validation | 29 | 0 |
| Buttons and groups | 29 | 10 |
| Alerts, spinners and badges | 17 | 5 |

Families use prefixes `container`, `row`, `col`, `d-`, spacing `m`/`p`, `gap-`,
`g-`/`gx-`/`gy-`, alignment, positioning, `w-`/`h-`, `text-`, `fw-`, float and
overflow; `card`/`list-group`; `form-`/`input-group`/validation;
`btn`; and `alert`/`spinner`/`badge`, respectively. The table is not exhaustive
or additive: icons, vendors and custom theme hooks account for other entries.

Reproduction: run `cd frontend && node scripts/generate-legacy-classes.mjs`,
inspect `rules["shadcn/no-unknown-classes"][1].allow` in the generated config,
and cross-reference source plus the CSS sources in that script. Count imports
with `rg 'react-bootstrap' frontend/src`, form ownership with
`rg '@tanstack/react-form' frontend/src`, and recursively inspect owned CSS.
Do not hand-edit the generated allow-list. Removing a usage does not remove
Bootstrap's vendor class from that list; record declining source references,
owned selectors and frozen exceptions during migration. The vendor entries
can disappear only when #1111 removes the stylesheet and generator.

## Implementation status (2026-09-30)

#1117 is implemented locally; see the [layout migration audit](1117-layout-utilities.md)
for current source/selector counts, retained ownership and verification. All
Container/Row/Col imports and ordinary application layout utilities are replaced.
Keep it in the active order until review and screenshot publication on the eventual
PR satisfy its remaining gate. #1118–#1123 remain implementation prerequisites
of #1111; this status does not authorize final removal. The original snapshot
and inventories below remain historical context.

#1118 is implemented locally; see the [card/list migration audit](1118-cards-lists.md).
All 38 Bootstrap card/list imports across 31 files are replaced with owned
presentation components. Theme selectors use stable slots; frozen exceptions
decrease from 36 to 34. Keep active pending review and screenshot publication.
#1111 remains blocked; no final vendor removal is authorized.

#1119 is implemented locally (2026-10-01); see the [admin form migration audit](1119-admin-forms.md).
All 28 scoped Bootstrap Form imports are replaced with owned field/control primitives;
all 21 TanStack Form source importers and domain submission ownership remain.
Obsolete admin form selectors are removed; public form selectors retain #1120 ownership.
Frozen exception entries decrease from 34 to 17, with dynamic floor-plan/room-colour
exceptions narrowly documented in source. Keep active pending review and screenshot
publication; #1111 remains blocked by its remaining prerequisites and cleanup gates.

## Preferred implementation order and ownership

| Order | Issue | Scope |
| --- | --- | --- |
| 1 | [#1117](https://github.com/tjorim/champagnefestival/issues/1117) | Migrate remaining Bootstrap layout and utility classes |
| 2 | [#1118](https://github.com/tjorim/champagnefestival/issues/1118) | Migrate Bootstrap cards and lists to owned presentation components |
| 3 | [#1119](https://github.com/tjorim/champagnefestival/issues/1119) | Migrate remaining admin Bootstrap form controls |
| 4 | [#1120](https://github.com/tjorim/champagnefestival/issues/1120) | Migrate remaining public Bootstrap form controls |
| 5 | [#1121](https://github.com/tjorim/champagnefestival/issues/1121) | Migrate remaining Bootstrap buttons and button groups |
| 6 | [#1122](https://github.com/tjorim/champagnefestival/issues/1122) | Migrate Bootstrap alerts, spinners and badges |
| 7 | [#1123](https://github.com/tjorim/champagnefestival/issues/1123) | Migrate custom views and resolve remaining legacy CSS exceptions |

This order prioritizes the largest removable class families. Admin and public
forms share the same family but have separate validation/ownership contracts;
admin goes first because it has 28 importers versus six public. Buttons and
forms tie at 29 classes; forms go first because of their larger state/validation
surface. Custom views finish the residual coverage audit after ordinary
controls have owners. Shared generated primitives may be introduced earlier
when needed by another group; coordinate overlapping files and let the owning
issue remove its selector family. This is a preferred order, not a requirement
to block independent changes. Every issue in this table is a prerequisite of
#1111, alongside #1110 and the original migration steps.

## Replace-or-keep decisions

### [#1117 — Migrate remaining Bootstrap layout and utility classes](https://github.com/tjorim/champagnefestival/issues/1117)

Replace Container/Row/Col with semantic HTML and Tailwind responsive grid/flex utilities. Audit all `src/` and tests, not just importers: spacing, sizing, display, typography, positioning and raw row/col/container classes remain in already migrated views, shells and `main.tsx`. Preserve breakpoints, column order, overflow, standalone fixed headers and anchor offsets. Keep site-specific layout wrappers where they encode theme design; restyle them rather than introduce a Base UI primitive. Coordinate form-row edits with the forms issues and custom geometry with the custom-view issue. This group owns ordinary static utilities throughout the app.

### [#1118 — Migrate Bootstrap cards and lists to owned presentation components](https://github.com/tjorim/champagnefestival/issues/1118)

Generate and restyle shadcn Card; use semantic `ul`/`li` or `dl` for ListGroup, keeping actionable rows as links/buttons and preserving headings, selection, grouping and empty states. Keep edition/schedule/booking domain components custom around these presentation pieces. Replace hard-coded dark variants with admin tokens. This group owns card/list selectors; feedback owns badges inside them.

### [#1119 — Migrate remaining admin Bootstrap form controls](https://github.com/tjorim/champagnefestival/issues/1119)

Replace admin Form and nested Label/Control/Select/Check/Group/Text/feedback with generated Field/Input/Textarea/Select/Checkbox/Switch equivalents as appropriate. Preserve existing TanStack Form in the 21 source files that import it; keep field metadata, dirty-state baselines, validation, numeric/date parsing and submission ownership. Do not add TanStack Form to simple search/filter controls merely for styling. Keep generated Combobox and Dialog behavior from #1107 and table filtering/manual pagination from #1106. Preserve settings refresh protection and event draft behavior.

### [#1120 — Migrate remaining public Bootstrap form controls](https://github.com/tjorim/champagnefestival/issues/1120)

Scope: MyAccountPage, MyRegistrationsPage, PushOptIn, RegistrationModal, CheckInPage and ContactForm. Generate Field/Input/Textarea/Select/Checkbox/Switch equivalents as needed. Keep existing registration/contact/account/check-in domain state and validation unless a demonstrated behavior requirement needs TanStack Form; do not introduce a new form library solely for styling. Preserve labels, descriptions, error association, locale copy, browser autofill, required/product constraints, consent, passwordless flows, scanner/manual input and duplicate-submit protection.

### [#1121 — Migrate remaining Bootstrap buttons and button groups](https://github.com/tjorim/champagnefestival/issues/1121)

Use the owned generated Button (including semantic link rendering), adding only token-backed variants required by the app. Replace ButtonGroup with labelled semantic groups and Tailwind spacing; use ToggleGroup only where selection semantics warrant it. Audit raw `btn*` classes, including `main.tsx`, MaintenancePage and theme hero links in addition to importers. Preserve submit vs button type, destructive actions, busy/disabled handling and accessible icon-only names. Do not change existing Base UI menus/dialogs.

### [#1122 — Migrate Bootstrap alerts, spinners and badges](https://github.com/tjorim/champagnefestival/issues/1122)

Generate Alert/Badge/Spinner equivalents on demand and restyle with semantic tokens. Keep status/error domain logic custom. Preserve live-region urgency, error dismissal/retry actions, loading accessible text and reduced-motion support; avoid duplicate announcements. Badges must convey meaning beyond color, including check-in/payment/availability states. Include root suspense/error fallbacks in main.tsx and all admin/public async paths.

### [#1123 — Migrate custom views and resolve remaining legacy CSS exceptions](https://github.com/tjorim/champagnefestival/issues/1123)

Audit every remaining frozen exception and custom selector across src and tests after the control/layout groups. Keep floor-plan rendering (LayoutEditor/VenuePlanPage), jsQR scanner, QR output, ResponsiveImage, Leaflet map, Swiper carousel, analytics and theme-specific Remuage/Riviera artwork custom: they are domain rendering or vendor integration, not interchangeable shadcn controls. Move static styles to semantic utilities or owned CSS; computed coordinates/rotations/aspect ratios need narrowly documented lint exceptions consistent with docs/floor-plan-coordinates.md. Replace MaintenancePage's embedded stylesheet/blanket lint exemption with owned styling while preserving the flyer interaction and artwork. Remove stale hooks/test placeholder exceptions; use real styles/classes or narrowly justified vendor allowances. Preserve Leaflet/Swiper vendor CSS while used and all five themes' tokens and visual identity. Inventory ThemeSwitcher/announcement/admin/analytics CSS and recursive theme-remuage imports; ordinary Bootstrap control selectors belong to the corresponding group, with orphan selectors resolved here. This group owns the final source-and-selector coverage audit, including files with no react-bootstrap import.

## Definition of done

Each follow-up must replace every scoped import and raw class use, remove
obsolete owned CSS and file-specific exceptions, preserve domain logic and
write retry behavior, and update this inventory. New primitives follow the
committed shadcn/Base UI generator and semantic-token conventions. Static
styling does not justify blanket inline-style exceptions; genuinely computed
geometry requires narrow documented allowances.

Required evidence per group: targeted interaction coverage; format, lint,
typecheck, unit tests, app and service-worker builds; relevant Playwright
checks; responsive keyboard/focus behavior; all five visual themes and the
fixed-dark admin; desktop/mobile light/dark screenshots of affected views.
Individual migrations keep the coexistence cascade intact.

Only [#1111](https://github.com/tjorim/champagnefestival/issues/1111) removes
Bootstrap/reboot and its dependencies, `data-bs-theme`/`--bs-*`, Bootstrap
Icons after #1110, the generated legacy allow-list and frozen migration
exceptions. Its source/test grep audit must also catch raw classes in files
without imports. Retained custom/vendor styling must have explicit ownership
and narrowly scoped allowances, rather than a general legacy baseline.

The final change enables verified Tailwind preflight, removes `tw:` and global
utility `important`, updates `components.json`/`cn`, removes migration markers
and helper exclusions, and verifies the intended cascade across retained
vendors. Record before/after bundle and CSS size and complete the full
Playwright and screenshot gates. See the authoritative
[coexistence cleanup gates](1104-tailwind-coexistence.md) and #1111 body.
Finishing this audit is completion of planning, not completion of the migration.

## Complete remaining import inventory

Paths are relative to `frontend/`. Multiple group owners can touch a file;
each owns only its scoped controls. Files without imports are covered by the
layout, raw-button and custom-view audits above.

### Alert (44 files)

- `src/components/CheckInPage.tsx`
- `src/components/CheckInScanner.tsx`
- `src/components/ContactForm.tsx`
- `src/components/FAQ.tsx`
- `src/components/MyAccountPage.tsx`
- `src/components/MyRegistrationsPage.tsx`
- `src/components/OtherEvents.tsx`
- `src/components/PebblePairPage.tsx`
- `src/components/PrivacyPolicyPage.tsx`
- `src/components/PushOptIn.tsx`
- `src/components/RegistrationModal.tsx`
- `src/components/VenuePlanPage.tsx`
- `src/components/admin/AdminDashboard.tsx`
- `src/components/admin/AdminLoginForm.tsx`
- `src/components/admin/AnalyticsDashboard.tsx`
- `src/components/admin/AnnouncementManagement.tsx`
- `src/components/admin/AuditLogViewer.tsx`
- `src/components/admin/BookingEditor.tsx`
- `src/components/admin/ComposerManagement.tsx`
- `src/components/admin/ContactMessagesManagement.tsx`
- `src/components/admin/ContentManagement.tsx`
- `src/components/admin/EditionModal.tsx`
- `src/components/admin/EditionPollOptionsModal.tsx`
- `src/components/admin/EmailComposeModal.tsx`
- `src/components/admin/EventProductsModal.tsx`
- `src/components/admin/FaqManagement.tsx`
- `src/components/admin/LayoutEditor.tsx`
- `src/components/admin/LayoutRevisionsModal.tsx`
- `src/components/admin/LedgerModal.tsx`
- `src/components/admin/MemberFormModal.tsx`
- `src/components/admin/MembersManagement.tsx`
- `src/components/admin/PeopleManagement.tsx`
- `src/components/admin/PersonFormModal.tsx`
- `src/components/admin/PolicyManagement.tsx`
- `src/components/admin/RegistrationCreateModal.tsx`
- `src/components/admin/RegistrationDetail.tsx`
- `src/components/admin/RegistrationList.tsx`
- `src/components/admin/ScratchpadManagement.tsx`
- `src/components/admin/SettingsManagement.tsx`
- `src/components/admin/VenueManagement.tsx`
- `src/components/admin/VolunteerFormModal.tsx`
- `src/components/admin/VolunteersManagement.tsx`
- `src/components/admin/WaitlistManagement.tsx`
- `src/main.tsx`

### Badge (20 files)

- `src/components/CheckInPage.tsx`
- `src/components/MyRegistrationsPage.tsx`
- `src/components/Schedule.tsx`
- `src/components/VenuePlanPage.tsx`
- `src/components/admin/AnnouncementManagement.tsx`
- `src/components/admin/ComposerManagement.tsx`
- `src/components/admin/ContentManagement.tsx`
- `src/components/admin/EditionCard.tsx`
- `src/components/admin/EventProductsModal.tsx`
- `src/components/admin/FaqManagement.tsx`
- `src/components/admin/LayoutCompareModal.tsx`
- `src/components/admin/LayoutEditor.tsx`
- `src/components/admin/LayoutRevisionsModal.tsx`
- `src/components/admin/MembersManagement.tsx`
- `src/components/admin/PeopleManagement.tsx`
- `src/components/admin/PolicyManagement.tsx`
- `src/components/admin/RegistrationDetail.tsx`
- `src/components/admin/RegistrationList.tsx`
- `src/components/admin/VenueManagement.tsx`
- `src/components/admin/VolunteersManagement.tsx`

### Button (43 files)

- `src/components/AnnouncementBanner.tsx`
- `src/components/CheckInPage.tsx`
- `src/components/ContactForm.tsx`
- `src/components/MyAccountPage.tsx`
- `src/components/MyRegistrationsPage.tsx`
- `src/components/OtherEvents.tsx`
- `src/components/PebblePairPage.tsx`
- `src/components/PushOptIn.tsx`
- `src/components/RegistrationModal.tsx`
- `src/components/admin/AdminLoginForm.tsx`
- `src/components/admin/AdminSidebar.tsx`
- `src/components/admin/AnalyticsDashboard.tsx`
- `src/components/admin/AnnouncementManagement.tsx`
- `src/components/admin/AuditLogViewer.tsx`
- `src/components/admin/BookingEditor.tsx`
- `src/components/admin/ComposerManagement.tsx`
- `src/components/admin/ContactMessagesManagement.tsx`
- `src/components/admin/ContentManagement.tsx`
- `src/components/admin/EditionCard.tsx`
- `src/components/admin/EditionModal.tsx`
- `src/components/admin/EditionPollOptionsModal.tsx`
- `src/components/admin/EmailComposeModal.tsx`
- `src/components/admin/EventModal.tsx`
- `src/components/admin/EventProductsModal.tsx`
- `src/components/admin/FaqManagement.tsx`
- `src/components/admin/ItemModal.tsx`
- `src/components/admin/LayoutEditor.tsx`
- `src/components/admin/LayoutRevisionsModal.tsx`
- `src/components/admin/LedgerModal.tsx`
- `src/components/admin/MemberFormModal.tsx`
- `src/components/admin/MembersManagement.tsx`
- `src/components/admin/PeopleManagement.tsx`
- `src/components/admin/PersonFormModal.tsx`
- `src/components/admin/PolicyManagement.tsx`
- `src/components/admin/RegistrationCreateModal.tsx`
- `src/components/admin/RegistrationDetail.tsx`
- `src/components/admin/RegistrationList.tsx`
- `src/components/admin/ScratchpadManagement.tsx`
- `src/components/admin/SettingsManagement.tsx`
- `src/components/admin/VenueManagement.tsx`
- `src/components/admin/VolunteerFormModal.tsx`
- `src/components/admin/VolunteersManagement.tsx`
- `src/components/admin/WaitlistManagement.tsx`

### ButtonGroup (3 files)

- `src/components/admin/ContentManagement.tsx`
- `src/components/admin/PolicyManagement.tsx`
- `src/components/admin/RegistrationList.tsx`

### Card (25 files)

- `src/components/CheckInPage.tsx`
- `src/components/ContactForm.tsx`
- `src/components/LocationInfo.tsx`
- `src/components/MyRegistrationsPage.tsx`
- `src/components/OtherEvents.tsx`
- `src/components/PushOptIn.tsx`
- `src/components/Schedule.tsx`
- `src/components/VenuePlanPage.tsx`
- `src/components/admin/AdminDashboard.tsx`
- `src/components/admin/AnnouncementManagement.tsx`
- `src/components/admin/ComposerManagement.tsx`
- `src/components/admin/ContactMessagesManagement.tsx`
- `src/components/admin/ContentManagement.tsx`
- `src/components/admin/EditionCard.tsx`
- `src/components/admin/FaqManagement.tsx`
- `src/components/admin/LayoutEditor.tsx`
- `src/components/admin/MembersManagement.tsx`
- `src/components/admin/PeopleManagement.tsx`
- `src/components/admin/PolicyManagement.tsx`
- `src/components/admin/RegistrationList.tsx`
- `src/components/admin/ScratchpadManagement.tsx`
- `src/components/admin/SettingsManagement.tsx`
- `src/components/admin/VenueManagement.tsx`
- `src/components/admin/VolunteersManagement.tsx`
- `src/components/admin/WaitlistManagement.tsx`

### Col (5 files)

- `src/components/LocationInfo.tsx`
- `src/components/PrivacyPolicyPage.tsx`
- `src/components/admin/MemberFormModal.tsx`
- `src/components/admin/PersonFormModal.tsx`
- `src/components/admin/VolunteerFormModal.tsx`

### Container (5 files)

- `src/components/CheckInPage.tsx`
- `src/components/MyAccountPage.tsx`
- `src/components/PebblePairPage.tsx`
- `src/components/PrivacyPolicyPage.tsx`
- `src/components/admin/AdminLoginForm.tsx`

### Form (34 files)

- `src/components/CheckInPage.tsx`
- `src/components/ContactForm.tsx`
- `src/components/MyAccountPage.tsx`
- `src/components/MyRegistrationsPage.tsx`
- `src/components/PushOptIn.tsx`
- `src/components/RegistrationModal.tsx`
- `src/components/admin/AnnouncementManagement.tsx`
- `src/components/admin/AuditLogViewer.tsx`
- `src/components/admin/BookingEditor.tsx`
- `src/components/admin/ComposerManagement.tsx`
- `src/components/admin/ContentManagement.tsx`
- `src/components/admin/EditionModal.tsx`
- `src/components/admin/EditionPollOptionsModal.tsx`
- `src/components/admin/EmailComposeModal.tsx`
- `src/components/admin/EventModal.tsx`
- `src/components/admin/EventProductsModal.tsx`
- `src/components/admin/FaqManagement.tsx`
- `src/components/admin/ItemModal.tsx`
- `src/components/admin/LayoutCompareModal.tsx`
- `src/components/admin/LayoutEditor.tsx`
- `src/components/admin/LayoutRevisionsModal.tsx`
- `src/components/admin/MemberFormModal.tsx`
- `src/components/admin/MembersManagement.tsx`
- `src/components/admin/PeopleManagement.tsx`
- `src/components/admin/PersonFormModal.tsx`
- `src/components/admin/PolicyManagement.tsx`
- `src/components/admin/RegistrationCreateModal.tsx`
- `src/components/admin/RegistrationDetail.tsx`
- `src/components/admin/RegistrationList.tsx`
- `src/components/admin/ScratchpadManagement.tsx`
- `src/components/admin/SettingsManagement.tsx`
- `src/components/admin/VenueManagement.tsx`
- `src/components/admin/VolunteerFormModal.tsx`
- `src/components/admin/VolunteersManagement.tsx`

### ListGroup (13 files)

- `src/components/CheckInPage.tsx`
- `src/components/MyRegistrationsPage.tsx`
- `src/components/admin/BookingEditor.tsx`
- `src/components/admin/ContentManagement.tsx`
- `src/components/admin/EditionCard.tsx`
- `src/components/admin/EditionPollOptionsModal.tsx`
- `src/components/admin/EventProductsModal.tsx`
- `src/components/admin/LayoutCompareModal.tsx`
- `src/components/admin/LayoutEditor.tsx`
- `src/components/admin/LayoutRevisionsModal.tsx`
- `src/components/admin/PeopleManagement.tsx`
- `src/components/admin/RegistrationDetail.tsx`
- `src/components/admin/VenueManagement.tsx`

### Row (5 files)

- `src/components/LocationInfo.tsx`
- `src/components/PrivacyPolicyPage.tsx`
- `src/components/admin/MemberFormModal.tsx`
- `src/components/admin/PersonFormModal.tsx`
- `src/components/admin/VolunteerFormModal.tsx`

### Spinner (35 files)

- `src/components/CheckInPage.tsx`
- `src/components/CheckInScanner.tsx`
- `src/components/ContactForm.tsx`
- `src/components/MyAccountPage.tsx`
- `src/components/MyRegistrationsPage.tsx`
- `src/components/PebblePairPage.tsx`
- `src/components/PrivacyPolicyPage.tsx`
- `src/components/PushOptIn.tsx`
- `src/components/RegistrationModal.tsx`
- `src/components/VenuePlanPage.tsx`
- `src/components/admin/AdminDashboard.tsx`
- `src/components/admin/AdminLoginForm.tsx`
- `src/components/admin/AdminSidebar.tsx`
- `src/components/admin/AnalyticsDashboard.tsx`
- `src/components/admin/AuditLogViewer.tsx`
- `src/components/admin/ContactMessagesManagement.tsx`
- `src/components/admin/ContentManagement.tsx`
- `src/components/admin/EditionCard.tsx`
- `src/components/admin/EditionModal.tsx`
- `src/components/admin/EditionPollOptionsModal.tsx`
- `src/components/admin/EventProductsModal.tsx`
- `src/components/admin/FaqManagement.tsx`
- `src/components/admin/LayoutRevisionsModal.tsx`
- `src/components/admin/LedgerModal.tsx`
- `src/components/admin/MemberFormModal.tsx`
- `src/components/admin/MembersManagement.tsx`
- `src/components/admin/PeopleManagement.tsx`
- `src/components/admin/PersonFormModal.tsx`
- `src/components/admin/RegistrationCreateModal.tsx`
- `src/components/admin/ScratchpadManagement.tsx`
- `src/components/admin/SettingsManagement.tsx`
- `src/components/admin/VolunteerFormModal.tsx`
- `src/components/admin/VolunteersManagement.tsx`
- `src/components/admin/WaitlistManagement.tsx`
- `src/main.tsx`

