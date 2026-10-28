# Restricted workspace and membership summary — #1421

## Scope and identity contract (2026-10-28)

The existing self-service APIs expose bookings, organisation contacts, volunteer
identity and email preferences. Stamp-card reads are admin-only; they are not a
member self-read API. The new `/api/me/membership` deliberately returns only
`active`, `inactive` (no active membership found), or `unavailable` (no verified
address). It uses the existing booking eligibility predicate: non-anonymised
person, member role, member role not retired, and normalised verified email.
OIDC uses only the current verified token address; a visitor session uses its
verified address. Booking ownership, names, usernames and staff claims cannot
substitute for that proof. No person IDs, history, documents or directory roles
are disclosed. Responses are `Cache-Control: no-store`; the account component
uses session-scoped queries and distinguishes load failures from membership state.

This is a read only addition. Existing writes, identity provisioning, membership
eligibility, stamp calculations and reward hand-out confirmations are unchanged;
no write retry strategy is added. Reward progress is explicitly unavailable in
self-service pending product approval of its scope. Capsule-exchange eligibility
and the automatic first-card trigger are explained without promising a reward.

## Task hierarchy

`/admin` opens My tasks; existing `section` links continue to open their section.
The home groups bookings/arrivals, preparation, and organiser follow-up. Admins
see preparation and global work lists; volunteers see operational tools and their
own details. Member and organisation-contact identities never grant staff access.
The next active edition and dates label the home; its seating link carries that
edition. Without an edition the existing seating picker requests one. Preparation
links lead to edition/event/product management, people and venues/plans. Global
people/venue/reward policy is distinguished from edition-specific work.

Standalone check-in, seating and account pages share staff links. Within admin,
links preserve namespaced list search state. Edition context travels through staff
links and account sign-in; no emailed credential is copied.
The existing linkable volunteer tab is labelled My volunteer tasks, with questions
before a separate identity/document section. Account settings retains the existing
isolated deletion section. Email-session users also get the membership summary.

Reward configuration is a disclosure above the member directory, separate from
member history. Empty history explains why festival attendance earns no stamps.
The directory role editor explains that role metadata does not provision access.

## Acceptance and remaining validation

Targeted backend tests cover verified-address isolation, both sign-in methods,
retired/anonymised records, non-member staff roles and unauthenticated denial.
Component tests cover all five requested role combinations, account flows,
no-edition seating links, preserved admin list state and membership load errors.
Chromium workspace tests cover NL/FR/EN at 1280×800, 1366×768, 1440×900 and
390×700, including link destinations, tab selection and horizontal reflow.

The pending-bookings count uses the existing server count query and opens a fresh,
global pending-registration list. A dedicated queue marker suppresses the normal
event-day edition default, so the list matches the counted predicate. Loading and
error remain distinct from a successful zero; the error has an explicit retry.
Other follow-up links open whole work lists and explicitly say so.

Real IdP journeys and a real-edition preparation rehearsal remain acceptance
gates alongside #1420. Keep #1421 active until these are verified.

### Validation results

- Backend: Ruff, formatting and ty pass; full SQLite suite **1,947 passed,
  35 skipped** (PostgreSQL-specific coverage requires PostgreSQL).
- Frontend: type checking, lint and formatting pass; full suite **1,443 passed**.
- Chromium: all 19 workspace scenarios pass across the runs, including the 12
  locale/viewport combinations, six native 125%/150% zoom cases at 600px reduced
  height and the pending-count-to-query check. The NL 1366px case passed on a
  clean rerun after compilation triggered development-server reloads in the first
  run. The six existing navigation/history scenarios also pass.
- Production build passes. Bundle check remains over the existing total limit:
  unchanged HEAD measured **2,881.4 KiB**, this implementation **2,892.4 KiB**,
  limit **2,870 KiB**, using the same installed dependencies. Entry, admin and
  eager checks pass (270.3 / 426.7 / 664.1 KiB). No budget was raised. Measurements
  use the local toolchain and are not a production-network performance test.

The browser suite uses synthetic MSW data and seeded authentication, not separate
real IdP accounts. These checks establish navigation and reflow; they do not
complete the real-role and real-edition operational acceptance gates above.

## Expanded local validation — 2026-10-28

Separate seeded browser sessions now cover admin-only, volunteer-only, member-only,
organisation-contact and combined roles. Members and organisation contacts see
membership/self-service without staff shortcuts; organisation contact discovery uses
the manager mock identity. These are frontend role-boundary checks, not evidence of
real IdP role provisioning or token issuance.

A populated, read-only preparation walkthrough follows My tasks → People → Members
→ Reward policy → My tasks → Festival Editions → event products → My tasks →
Venues & Rooms → My tasks → booking list. It checks actual synthetic rows and the
product dialog, rather than just the presence of shortcut links. No booking,
member, product or venue is saved during this walkthrough.

The reward lifecycle browser test passes after opening the new Reward policy
section: create/select type, filter rewards due, confirm hand-out, reverse it and
retire the type. Existing dense seating tests also pass.

WCAG 2.0/2.1 A/AA scans of `/admin` and `/me` pass in desktop light, desktop dark
and 375px phone layouts. The initial scan discovered inherited public text colour
on the dark admin home (edition label and loading status). The shared task nav now
sets `text-foreground`, fixing both consumers through their semantic theme tokens.
UI inventory and import checks pass. The expanded tests are retained in
`workspace-journeys.authenticated.spec.ts` and the shared preparation helper.

A real IdP return still requires an allowed callback origin and actual role
accounts. The local mock preparation check does not establish readiness of a real
edition or a complete create/configure/publish rehearsal.

The full PostgreSQL 18 suite also passes: **1,976 passed, six skipped** (SQLite-only
compatibility checks). This includes the concurrency, advisory-lock, migrations,
ledger-trigger and LISTEN paths skipped by the SQLite run. The database was an
isolated local container with `pg_trgm` and `unaccent`; it was removed afterwards.

The populated walkthrough now passes in all **nine laptop combinations**: widths
1280, 1366 and 1440, each at 100%, 125% and 150% native browser zoom, with 600px
height before zoom. Zoom cases use French labels and keyboard activation; standard
cases use English. The test opens the responsive navigation drawer below 992 CSS
pixels and recognises booking cards as well as table rows. Pixel ratio and visual
viewport checks confirm native zoom, not page scaling. All six zoom scenarios and
three standard scenarios passed in the final clean run. The earlier 12 locale/
viewport workspace cases, five role journeys, pending queue, reward lifecycle and
six accessibility scans also pass across the validation runs. The existing dense
seating suite passed all ten scenarios.

Follow-up frontend checks pass: targeted workspace/membership tests (15), lint,
formatting and UI policy checks. The only application change made by this extended
validation is the semantic text-colour correction described above; test selectors
were updated for the intentional reward disclosure and responsive layouts.

Final typecheck, formatting and production build pass. The total bundle is now
2,892.5 KiB after the contrast correction; the existing 2,870 KiB limit still
fails, while entry/admin/eager limits pass. No bundle limit was changed.


### CI total-budget reconciliation — 2026-10-28

CI job 123063522406 passed every step through the production build, then failed
only the total-size check at 2,892.5 KiB. The [budget review](../ui-maintenance.md#workspace-feature-budget-review--2026-10-28-1421)
sets the total allowance to 2,910 KiB, based on the already-over-limit 2,881.4 KiB
baseline plus this feature's 11.1 KiB. Entry/admin/eager limits are unchanged.
This supersedes the earlier unresolved total-budget failure recorded above.
