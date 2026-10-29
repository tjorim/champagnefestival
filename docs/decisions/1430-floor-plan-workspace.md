# Floor-plan preparation workspace (#1430)

The 2026-10-26 browser finding described a 20 × 15 m room with 24 tables:
selecting Table 24 revealed its controls below the plan, requiring the organiser
to leave the map behind. The room badge also counted 48 tables after copying a
24-table layout, without explaining that its scope included every layout.

## Implementation — 2026-10-29

- At viewport widths of at least 1200 px and heights of at least 600 px, the
  editor uses adjacent map and inspector columns. Each scrolls independently
  within 65% of the viewport height. No sticky or overlay panel covers controls.
- Smaller or zoom-reduced viewports use normal stacked document flow. Selecting
  an object brings its inspector into view there. Changing selection resets the
  inspector scroll position, including after a long allocation list.
- The inspector explains empty selection and save behaviour. A labelled search
  filters the current layout's table buttons. Tab and Enter/Space select a result;
  selection remains when the search changes. Selection also scrolls the map to
  the table. The map's scroll region is keyboard focusable.
- Room badges explicitly say “All layouts”; the count's underlying scope is
  unchanged. Layout, event, capacity and physical room semantics are unchanged.
- Existing naming/dimensions/guest-count blur handlers, type/rotation handlers,
  booking assignment/move/removal, deletion confirmations and revision dialogs
  remain the write owners. Search and selection are local state only. There are
  no changed writes, automatic retries, autosave policies or retry-safety changes.

## Acceptance and evidence

- [x] Table/area identity and controls share a visible, named inspector.
- [x] Laptop map and inspector can be inspected together without overlays.
- [x] Searchable table list supports keyboard selection and retained selection.
- [x] Translated save/apply guidance explains field blur, immediate controls,
  explicit assignment and geometry-only revisions.
- [x] Authenticated Chromium uses a synthetic 24-table room with 15 bookings on
  one table at 1280×800, 1366×768 and 1440×900; native browser zoom is exercised
  at 100%, 125% and 150%. Additional 853×512 and 390×844 cases preserve access.
  Tests cover search, keyboard selection, retained selection, map position,
  scrolling a long booking list, reselecting from the canvas and area selection.
- [x] Existing editor component tests cover geometry callbacks, allocations and
  revision compare/restore conflicts; the locator regression verifies that search
  and selection do not invoke write handlers.

Browser evidence uses dummy data and does not claim an actual venue rehearsal.

Validation: all 1,467 frontend unit tests (including 25 LayoutEditor tests), the
11-case authenticated Chromium matrix plus auth setup, typecheck, lint,
formatting and three-locale message parity pass. Production build is also
validated as part of handoff.
