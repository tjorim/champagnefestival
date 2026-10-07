# Public navigation and disclosure widgets

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

The `/` and `/privacy` pre-render slot contract is unchanged: no index template,
slot marker, backend injection or route-loading changes are involved. Leaflet,
Swiper, charting, drag/drop and QR libraries retain their existing integration.
No write endpoint, payload, retry policy or mutation ownership changes.
