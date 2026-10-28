# Volunteer plan navigation (#1424)

Implementation record, 2026-10-28. Scope is the read-only authenticated volunteer
plan; the admin preparation workspace remains #1430.

- Search matches table names across the permitted edition response. Room, event
  and date selectors combine with it. A structured list is the initial view;
  every entry names its table, room, event/date, occupied/total seats and status.
  Exclusive bookings and over-capacity tables have explicit text.
- Selecting a result reveals its room/event/date map and focuses a readable
  destination summary outside the canvas. Direct table links do the same;
  missing ids focus recovery guidance. Search remains available above the map.
- The map preserves canvas-relative top-left anchors and clockwise rotation.
  Its scrollable minimum width is 960 CSS pixels (or the natural canvas width
  for larger rooms), with surrounding space for edge labels. It can be focused
  and scrolled with arrow keys; touch/trackpad scrolling uses the browser's
  native overflow. Browser zoom remains available. Custom zoom/pan controls are
  unnecessary for the tested fixtures: native two-axis scrolling, keyboard
  navigation and the textual alternative cover the inspection tasks.
- Laptop map mode places search results beside the map. Phone map mode keeps a
  search result list visible while typing, and always exposes the selected
  destination outside potentially overlapping markers. List mode is usable
  without interpreting the map, colour or hover.
- The route reuses StandaloneRoute's skip link. The check-in link carries only
  the registration id into the plan so the return link can reopen the original
  task; credentials and arbitrary return URLs are not copied.
- No backend payload, visibility rule or write operation changes. Registration
  ids in the existing response are not rendered. Retry-safety contracts are
  unaffected.

## Acceptance

- [x] Table-name search, combined filters, map/list choice and textual statuses.
- [x] Selected/missing table focus and recovery guidance; registration return path.
- [x] Dense 24-table fixture and keyboard/component regression coverage.
- [x] Synthetic browser checks at 390px, 1280px, 1366px and 1440px, keyboard
  activation/scrolling, long labels and axe scans; real browser zoom at 125%,
  150% and 200% (390×844 physical viewport at 200%).
- [x] Reduced-height laptop coverage at 1280×600, 1366×568 and 1440×650,
  with 1-, 24- and 96-table fixtures. Two-axis wheel events verify the native
  trackpad scroll path; arrow keys verify keyboard map navigation.
- [x] Browser coverage verifies missing-table guidance and the originating
  registration return link.

Coverage lives in `frontend/e2e/venue-plan.authenticated.spec.ts` and
`frontend/tests/components/VenuePlanPage.test.tsx`. The phone zoom case reflows
below the themes’ 320px body floor using the same scoped rule as check-in.
The view selectors use semantic foreground/background colours for selected
state after axe detected insufficient contrast with the active primary pair.
Repository acceptance uses reproducible dummy data, as confirmed by the owner.
These tests validate the application's behaviour without requiring production
venue data or a physical trackpad. Wheel input exercises the browser scroll
path; it does not claim physical hardware testing. An actual venue walkthrough
can still be useful operational preparation, but is not an implementation gate.
The admin preparation workspace remains separately tracked in #1430.
