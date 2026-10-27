# Registration and entrance workspaces (#1427)

Repository implementation and local acceptance evidence, 2026-10-27.
Original findings and scope remain in [#1427](https://github.com/tjorim/champagnefestival/issues/1427).
This record does not establish a production release.

## Behaviour

- Scanner/offline guidance fills the available width. Unavailable cameras retain
  their explanation while hiding the empty video area. Scanning and manual lookup
  have labelled choices above the scanner. The Scan QR / Manual lookup choices are
  mutually exclusive: choosing or focusing manual lookup stops the camera; choosing
  Scan QR starts it again. Selecting a guest removes scanner/search chrome, focuses
  the guest workspace and puts the entrance action above fulfilment, even for a
  long order. Booking and attendance states are explicit. Returning restores focus
  to the Scan QR choice and reopens search.
- The check-in page reflows below the themes' 320 px body floor at high phone zoom.
  This exception is scoped to check-in; the visual themes are otherwise unchanged.
- Registration cards below the established 992 px navigation breakpoint show
  identity/contact, event, guest count, booking/payment/attendance status and named
  entrance actions. The existing page-selection checkbox remains available on cards.
  Only one responsive registration composition mounts at a time, avoiding duplicate
  controls and IDs. A compact shared sort menu retains ascending/descending/reset
  controls on mobile registration and people cards. Laptop tables keep sorting,
  column preferences and pagination.
- Shared registration/people/member/volunteer table action cells and headers stay
  pinned to the right edge of their table scroll container. Registration action
  buttons stay in one line on laptops; confirmation and cancellation remain distinct.
  Default People tables prioritise identity/contact, roles and registration counts;
  Members omit secondary phone/start-date/notes columns, while Volunteers omit
  government identifiers, start dates and detailed help periods. The member
  attendance and volunteer last-helped summaries stay visible. Explicit saved or
  URL column choices always win, including a choice to show a secondary column.
  Mobile navigation is docked in the normal content header, not over table controls.
  Shared menus use Base UI available-width/height bounds so long sort and column
  menus remain scrollable and keyboard reachable at reduced usable heights.
- Search stays visible. Registration filters collapse behind a supported
  disclosure, with applied restrictions and reset outside it. Attendance panels
  collapse separately, retaining an explicitly all-events attendance summary.
- Guest names and the explicitly named View/edit booking button/menu open the
  booking editor. QR Code has its own targeted dialog. It reads live booking state,
  follows token rotation, honours the configured base path, and suppresses a QR
  code after cancellation. Booking details show event, guest and payment context above
  links to booking/payment/seating, email, fulfilment, entrance and QR tasks.
  Booking details, seating and payments have labelled groups. The common booking
  save sits outside seating and payment groups, with its field scope explained;
  transaction saving is explained separately. Invalid guest/product quantities and
  incomplete/over-allocated seating explain why booking save is disabled, with
  field-associated accessible feedback. These checks retain the API's existing
  guest/product limits and 0–20 allocation guest-count bound. Task navigation does
  not unmount or submit the form. Fulfilment rows wrap their badges and quantity
  controls: a follow-up browser check found 154 px (NL) and 104 px (FR) of phone
  dialog overflow in the old nowrap arrangement; both now pass the width checks.
- Successful attendance operations show guest-specific visible/live feedback only
  after an acknowledged response; rejected actions never announce success. Checked-in rows offer a named,
  keyboard-accessible Undo check-in menu action. It sets attendance to false;
  strap issuance and fulfilment are separate operations. Existing stamp-card
  restrictions still apply, and failures use translated codes/fallbacks.
- Bulk confirmation retains the selected count and now shows per-event counts
  and an expandable guest/event/date list, including records selected across pages
  through Select all matching. Current cached records supersede captured selection
  metadata. The record list is keyboard-focusable for scrolling, and a review
  action beside pagination returns focus to bulk controls from the end of a long
  list. Selected count changes are announced. Selection metadata does not change
  the executed IDs.
- Public and admin entrance writes remain live-only, with disabled offline controls
  and no deferred write replay. Admin check-in/undo, strap and fulfilment operations
  use a dedicated non-pausing mutation with an offline guard at the HTTP boundary;
  ordinary booking/payment strategies are unchanged. See [retry safety](../retry-safety.md#admin-attendance-correction-1427).

## Browser evidence

`frontend/e2e/entrance-layout.authenticated.spec.ts` uses 25 synthetic bookings
across three events and the normal authenticated Playwright storage state. It
checks action bounds without first scrolling horizontally, page overflow, camera
failure, manual selection/return, and laptop booking-detail/create interactions.
It also tests named check-in/undo at 1024 px and axe WCAG A/AA checks at 390 and
1024 px. Browser fixtures use MSW; backend contracts are tested separately.

Measured fully visible populated rows at initial vertical scroll, after the same
Review search. The baseline is a temporary frontend snapshot of the pre-change
HEAD, with the same injected 25-booking fixture. The after state uses collapsed
filter and event disclosures. These are geometry measurements, not throughput
benchmarks or evidence of accurate production attendance totals.

| CSS viewport | Before | After | First three row heights before / after |
| --- | ---: | ---: | --- |
| 1024 × 768 | 1 | 5 | 121 / 79 px |
| 1280 × 800 | 2 | 5 | 121 / 79 px |
| 1366 × 768 | 2 | 5 | 97 / 79 px |
| 1440 × 900 | 4 | 6 | 77.5 / 79 px |

At 390 × 844 the list uses cards, with zero document horizontal overflow.
Laptop and 1024 px layouts also have zero document horizontal overflow; wide
optional table content can still scroll inside the table while actions stay pinned.

Real browser zoom uses a temporary test-only Chromium extension calling
`chrome.tabs.setZoom`, with assertions on device pixel ratio and visual viewport
scale. CSS zoom and pinch emulation are not substituted for browser zoom:

| Browser zoom | Configured viewport | Measured CSS width | DPR | Visual/pinch scale |
| --- | --- | ---: | ---: | ---: |
| 125% | 1366 × 768 | 1093 | 1.25 | 1 |
| 150% | 1366 × 768 | 911 | 1.5 | 1 |
| 200% | 390 × 844 | 195 | 2 | 1 |

Registration entrance actions remain within the visible width at 125% and 150%
for each 1280 × 800, 1366 × 768 and 1440 × 900 configured viewport, plus a reduced
1280 × 650 viewport. Booking save is focusable/in view in each zoom/viewport case.
Camera and offline guidance reflows in Dutch, French and English at 200% phone
zoom. Camera-denial/manual-search/selection/return flows also pass at ordinary
390 px width in all three languages, including a 15-line order whose entrance
action remains in the initial guest workspace. Dutch/French registration toolbar,
mobile sorting, explicitly named booking entry and modal overflow checks pass at
390 and 1280 px. Pointer-wheel scrolling and hit-testing at 390 px verify that
navigation does not cover the entrance control.

`frontend/e2e/list-action-reachability.authenticated.spec.ts` checks People,
Members and Volunteers at 390, 1024 and 1366 px, opening each edit action through
keyboard focus and Enter, then cancelling. Laptop registration tests at 1280 ×
800, 1366 × 768 and 1440 × 900 check QR task navigation, focus/visibility of the
booking save button, modal horizontal overflow, invalid create-form feedback and
reachable cancel controls and field-associated guest validation. No booking/payment/
fulfilment write is submitted in those modal checks. An additional browser case
reviews 60 selected bookings across pages, checks dated event counts and scrolls
the guest list by keyboard before cancelling without a write.

The existing `admin-tables.authenticated.spec.ts` now checks secondary columns
start hidden, an explicit show choice persists, and mobile cards still work.
`admin-booking-create.authenticated.spec.ts` also passes its existing creation,
exemption, incomplete-form and new-person continuation regressions.

## Contract coverage and limits

- Frontend tests additionally cover offline admin entrance rejection/reconnect
  without replay, positive/negative acknowledgement feedback and live QR token/
  cancellation updates. The browser verifies disabled attendance/undo while offline,
  no replay on reconnect, and named success/correction feedback after deliberate
  online actions.
- Frontend tests cover filter context while collapsed, cross-page bulk scope,
  responsive cards, camera denial, selected-workspace focus/return, offline
  no-write/no-replay behaviour, and absolute undo requests without retries.
- `backend/tests/test_registrations_admin.py` verifies repeated uncheck-in clears
  the attendance timestamp and preserves strap state. `test_stamp_cards.py`
  covers attendance/stamp synchronisation and blocked undo after reward hand-out.
  The targeted SQLite run passed 43 tests; three PostgreSQL-only cases skipped.
- Camera hardware scanning, a physical trackpad, production concurrency and a
  production deployment were not exercised. A rejected camera request is a
  fallback-layout test, not evidence that hardware QR scanning works.
- Booking draft safety remains #1428; paid-booking creation/continuation remains
  #1431. This change does not duplicate either write-flow scope.

## Validation and acceptance

- [x] Readable NL/FR/EN guidance at phone width and real 200% browser zoom.
- [x] Direct camera-failure fallback, explicit lookup choices and camera stop/resume.
- [x] Focused guest identity/event/status and entrance action before long fulfilment lists.
- [x] Reachable named actions at 390 and 1024 px, with mobile sort/selection retained.
- [x] Compact filters with visible restrictions/reset and separately expandable attendance.
- [x] Efficient laptop tables at all requested dimensions, with before/after evidence above.
- [x] View/edit booking discovery, targeted QR dialog and preparation task grouping.
- [x] Booking totals, validation, save ownership, cancel/focus and dialog overflow checks.
- [x] Default People/Members/Volunteers column priority with saved choices preserved.
- [x] Named check-in/undo, live feedback and unchanged permission/retry contracts.
- [x] Reviewable cross-page bulk scope, keyboard scrolling and a return to bulk controls.
- [x] Docked navigation, pointer/keyboard review, real 125%/150% laptop zoom and axe
  at 390/1024 px with populated fixtures.

Final validation: 1,416 frontend tests across 192 files; 43 targeted backend tests
(three PostgreSQL-only skips); 25 Chromium checks including auth setup, the
expanded entrance/list matrix and existing table/booking-creation regressions.
Frontend typecheck, lint, formatting, message parity, UI inventory/verification,
production build and all existing bundle budgets passed. Backend changed-test
lint and formatting passed. Local verification uses synthetic fixtures and does
not replace the hardware/production limits above.
