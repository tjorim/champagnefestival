# Public navigation and disclosure migration

Issue: [#1108](https://github.com/tjorim/champagnefestival/issues/1108), step 5
of [#1103](https://github.com/tjorim/champagnefestival/issues/1103).

## Widget ownership

- Header uses native links and a Base UI Dialog for mobile navigation. The
  dialog owns dismissal, focus containment and return focus. HeaderClassic
  already uses Tailwind and retains its existing mobile layout.
- LanguageSwitcher uses the shared Base UI Menu with `admin={false}`; the
  default stays `true` for existing admin consumers. Public portals inherit
  visitor tokens; admin portals carry the fixed-dark AdminThemeScope.
- Schedule and MyAccountPage use Base UI Tabs with arrow-key activation. Each
  day has its own associated panel. Account panels stay mounted to preserve
  form state while inactive panels are hidden and inert.
- FAQ uses a single-open Base UI Accordion. CheckInPage uses a controlled
  Collapsible; its search panel stays mounted to retain entered search state.
- ContentManagement uses a focusable tooltip trigger. Base UI tooltips are
  sighted hints; edition usage is also exposed through the trigger's
  `aria-description`, following the [Base UI tooltip guidance](https://base-ui.com/react/components/tooltip).
- RegistrationList uses Base UI Progress with its existing accessible label.
- LayoutEditor room selection and PolicyManagement locale selection use
  labelled button groups with `aria-pressed`. Both change one shared editor,
  rather than exposing independent tab panels, so they deliberately use buttons.

No scoped Navbar, Nav, Tabs, Tab, Accordion, Collapse, Dropdown, Tooltip,
OverlayTrigger or ProgressBar imports remain. LocationInfo's barrel import
contains only Card/Row/Col, which belongs to the remaining layout migration.
Other card/form/layout widgets remain owned by their migration steps.

## Runtime themes and coexistence

Bootstrap reboot, stylesheet order and third-party styles remain in place.
Theme widget selectors now address Base UI data slots and active/expanded
states, rather than Bootstrap renderer classes. Unlayered theme surfaces and
navbar geometry retain cascade ownership; structural and interactive utilities
use the `tw:` prefix. The shared defaults restore geometry previously supplied
by Navbar, while allowing Riviera's sidebar and Remuage's wider container to
keep overriding it. The header breakpoint stays at 992px and the header has an
explicit semantic stacking token. Unused custom mobile-menu visibility and
transition rules, Bootstrap disclosure pseudo-icons and the migrated FAQ and
language-switcher lint exceptions are removed.

The `/` and `/privacy` pre-render slot contract is unchanged: no index template,
slot marker, backend injection or route-loading changes are involved. Leaflet,
Swiper, charting, drag/drop and QR libraries retain their existing integration.
No write endpoint, payload, retry policy or mutation ownership changes.

## Verification and review evidence

Component tests cover keyboard activation, single-open answers, focus return,
hidden/inert account panels, retained search input, progress values and tooltip
portal scope and dismissal on pointer exit, blur and Escape, with jest-axe checks
for the migrated primitives. Existing admin accessibility checks remain in place.

`e2e/public-widgets.spec.ts` exercises menus, tabs and FAQ under all five themes
at 1440px and 390px, checks horizontal overflow and public portal ownership,
asserts that tab selection changes the computed theme surface and deselection
restores it, verifies FAQ chevron rotation on expansion and collapse,
and saves full-page PNGs as Playwright attachments. Remuage's existing suite
also checks its desktop composition, 320px minimum width, mobile dialog and
registration/standalone/admin theme behaviour.

Before closing #1108, attach the generated light and dark desktop/mobile PNGs
to the eventual PR. Local screenshot evidence alone does not satisfy that
publication gate; no PR or commit is created automatically.

Local validation on 2026-09-30: 744 unit tests passed, including jest-axe;
69 focused browser checks passed. After visual-review adjustments, 29
public/theme/coexistence checks and 13 authenticated account/check-in/admin
checks passed again. Light/dark desktop/mobile evidence is saved locally for
PR attachment. The publication gate remains open.

- [x] No scoped Bootstrap widget imports remain.
- [x] Keyboard, focus, responsive and jest-axe checks pass.
- [ ] Attach light and dark desktop/mobile screenshots to the eventual PR.
