# Preparation editors (#1429)

Implemented 2026-10-29 with the owned Base UI dialog and tabs adapters. Edition
artwork already follows the schedule (merged #1441).

- Event scheduling and access/registration precede optional text maintenance.
  Language tabs group each title and description together, keep all fields mounted,
  and retain Dutch-required/fallback validation. A text validation failure selects
  Dutch and focuses the relevant input. Date guidance distinguishes the first
  standalone event from an edition with an existing date and sits beside Date.
  Edition ID/month inputs explain their required values before submission; the
  permanent ID example and month/date guidance are associated field descriptions.
- Product editing replaces the product list, with a distinct heading and explicit
  Cancel/Save actions. Price, availability and stock precede translated text.
  Language tabs retain draft values; Dutch validation selects the Dutch tab.
- Packages and existing-booking choices remain expanded. The separate preview
  continues to show before/after quantities and totals, paid/refund values and
  shortages, with required shortage acknowledgement. Review actions remain outside
  the scrolling content, as do both editors' primary actions.
- No payment, availability, translation fallback, backend or retry contract changes.

## Acceptance and verification

- [x] Scheduling, price and stock precede optional translations.
- [x] All locales retain draft values; missing Dutch text reveals Dutch validation.
- [x] Editor and review actions stay within the viewport at laptop heights and zoom.
- [x] Existing-booking scope, before/after quantities/totals, payments/refunds and
  shortages remain in a deliberate preview; acknowledgement gates shortage saves.
- [x] Product list, editor and review have distinct headings and actions.
- [x] Keyboard, errors, long translations and populated data checked at 1280×800,
  1366×768 and 1440×900, each at native browser zoom 100%, 125% and 150%.

`preparation-editors.authenticated.spec.ts` uses isolated synthetic product/preview
responses with twelve affected bookings. It checks draft retention, Dutch error
discovery, date-to-time keyboard order, keyboard shortage acknowledgement,
checkbox/footer separation, action bounds and review overflow. Screenshots include
the event and populated review at every size/zoom combination. This is local
Chromium evidence, not a production or real-edition rehearsal. Existing component
coverage verifies product writes, preview tokens and shortage confirmation; the
event tests cover required Dutch text, translation suggestions and first-date help.


Repository checks: all 201 frontend test files (1,466 tests), typecheck, lint,
format check, UI import/inventory policy and production build pass. The browser
matrix has nine size/zoom cases plus its authentication setup. Edition creation
also verifies ID/month guidance before any failed submission.
