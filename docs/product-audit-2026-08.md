# Product audit — August 2026

A full-stack review of the backend, frontend, Android surface, and public site,
carried out against `f392ab9` (`main`, version `2026.8.2`), together with the
approved communications and policy feature roadmap. Every finding and feature
request is filed as a GitHub issue. This document is the single source of truth
for scope, product boundaries, dependencies, and preferred implementation
order across both shipped defects and planned work.

## Maintenance

Keep this document current in the same pull request that implements, closes,
splits, supersedes, or materially changes a tracked item. Preserve findings as
historical evidence rather than deleting their index/specification context.

When an item is completed or superseded:

1. Remove it from the active phase table and renumber the remaining preferred
   order.
2. Add it to **Completed or superseded work** with the date, outcome, issue and
   pull-request or commit reference, and one concise sentence describing the
   verified change.
3. Update affected dependency-map edges, index/specification text, and
   acceptance-criteria checkboxes.

Partial work remains in its active phase with revised notes. Do not record an
item as complete until its documented acceptance criteria are satisfied. The
GitHub issue remains the source for discussion and workflow state; this file
records the product-level evidence and the resulting order.

## How the findings were verified

- **Frontend:** `pnpm typecheck` clean, `pnpm test` 530/530 passing across 73
  files, `pnpm lint` exit 0 with 30 React Compiler warnings.
- **Backend:** tests were **not** run — the audit environment had no PostgreSQL
  instance. Every backend finding is therefore derived from reading code, and
  each issue cites the `file:line` that demonstrates it rather than a failing
  test. Where a claim depends on absence (for example "nothing writes this
  column"), the issue records the `grep` that establishes it.
- **Cross-surface:** the Android Retrofit interface and the Pebble package were
  read to establish which endpoints actually have consumers.

Findings are not ordered by how they were discovered. Several only became
visible by comparing two surfaces — the backend CSV exports against the
frontend's `csvExport.ts`, the web check-in page against the Android app's
offline handling.

## Preferred order

Severity alone is a poor guide here, because three of the cheapest fixes are
also the most urgent and two of the most severe findings are blocked behind
smaller ones. The order below is by *readiness and consequence*, not by label.

The communications roadmap was filed after the initial review as epic #946.
Its children are integrated into the phases below according to the subsystem
they change. A shipped defect takes precedence over a feature that touches the
same path, but independent feature work does not wait for every audit finding.

Effort markers are rough: **S** ≈ under a day, **M** ≈ a few days, **L** ≈ a
week or more, or requiring a decision first.

### How to use this order

The order is a preferred queue, not a requirement to run only one issue at a
time. The arrows in the dependency map are the hard sequencing constraints.
Rows described as “coordinate” may proceed in parallel, but must settle a
shared contract before either implementation merges. Independent **S** fixes
may be pulled forward whenever they do not interrupt an event-day blocker.

### Phase 0 — before the next event

Everything here fails on the day, in front of guests, with no workaround.

No Phase 0 defects remain open. #925 was completed on 2026-08-29.

Phase 0 is deliberately all-**S**. It is the shortest path to a system that
survives an event day.

### Phase 1 — close the contact and booking loops

The public booking, confirmation, and registration-ownership gaps identified in
this phase were completed through #924, #947, and #922 on 2026-08-30.

No Phase 1 defects remain open.

### Phase 2 — data integrity in the admin and seating layer

No sufficiently defined Phase 2 findings remain open. Broader seating-allocation
work is intentionally outside this audit until the bourse requirements are clear.

### Phase 3 — operational workflows and admin communication

No sufficiently defined Phase 3 findings remain open — #937 is complete (see
below).

### Phase 4 — compliance and platform foundations

Two of these need a decision before code, and are labelled `needs-discussion`.

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 1 | #934 — no retention or erasure mechanism | Its #923 persistence prerequisite is complete. #944 (versioned policy publishing) shipped ahead of this item rather than waiting: its initial migrated version tightened the data-retention and rights-request text so it stops short of claiming an automated deletion/anonymisation pipeline, so the current publication does not overstate what exists yet. Decide and implement the retention schedule and rights workflow, then publish an updated version through #944's admin editor. | L |
| 2 | #932 — single-process state | Its #921 limiter prerequisite and #929 bus-recovery prerequisite are complete. Direction decided in [`docs/decisions/932-multi-worker-state.md`](decisions/932-multi-worker-state.md): Postgres-backed rate limiter (with #921's keying work) — corrected from an earlier Redis-backed proposal, since the deployed infra (`tjorim/apps`) has no Redis and no plan to add one — plus Postgres `LISTEN`/`NOTIFY` for the live bus (`tjorim/worktime` already runs this pattern in production), metrics deferred. Implementation still open. | L |
| 3 | #936 — public-site discoverability | The wrong-domain sitemap is an **S** fix worth pulling forward independently; per-locale metadata and prerendering are the **M** part. | S + M |
| 4 | #941 — Web Push/VAPID subscription foundation | Uses #947 (complete) and follows #932's multi-worker decisions above. Its service-worker contract is documented in [`docs/decisions/941-web-push-foundation.md`](decisions/941-web-push-foundation.md) (one worker file, per-feature cache versions and additive handlers, so a future consumer can share it without redesign). That doc also proposes defaults for #941's required pre-implementation decisions (subscription model, retention, consent copy) — pending the project owner's confirmation before implementation starts. Remains opt-in/test-delivery infrastructure only. | L |

### Phase 5 — central composer

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 6 | #942 — central announcement and push composer | **Blocked by #941 and #947; #945 is complete.** Scheduled work uses the durable outbox, immutable snapshots, atomic claims, and per-channel results. It adds no bulk e-mail channel. | L |

### Phase 6 — deferred visitor account

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 8 | #953 — visitor passwordless account and order history | Follow #922's ownership model and require verified production delivery from #924/#947 before exposing the navigation entry. The existing authenticated `/my-registrations` view now lets owners update the communication preference across their linked registration people; the broader navigation and passwordless-account acceptance criteria remain active. Visitors use single-use email magic links; staff remain on OIDC. Treat registrations and their line items as the customer order history rather than inventing a parallel order concept. | L |

### Dependency map

```text
#923 contact form (complete) ─> #934 retention/erasure
                └────────────> #947 durable outbox ──> #924 confirmation e-mail
                                             ├───────> #941 Web Push foundation
                                             └───────> #942 central composer

#922 registration ownership ──┐
#924 confirmation e-mail ─────┼──────────────> #953 visitor magic-link account
#947 production delivery ─────┘

#928 order resolution ────────> #933 registration lifecycle (complete)


#929 SSE recovery ────────────> #932 single-process (bus half)

#925 settings failure semantics ─────────────> #940 public contact settings (complete)

#934 retention/erasure decision ─────────────> #944 policy publishing (complete, ahead of this item — see Phase 4 notes)

#945 announcement banner ────────┐
#941 Web Push foundation ────────┼────────────> #942 central composer
#947 durable outbox ─────────────┘
```

Everything not shown is independent and can be picked up in any order.

## Completed or superseded work

Move items here only after applying the maintenance procedure above. Keep this
ledger as durable audit history; do not move completed items back into the
active preferred-order tables.

| Issue | Outcome | Completed | Evidence | Verified change |
| --- | --- | --- | --- | --- |
| #944 | Completed | 2026-09-04 | #944, PR (this change) | Added a versioned Markdown policy model (`policies`/`policy_versions`) with a draft → publish → superseded lifecycle enforced by partial-unique indexes and a policy-row lock (concurrency-tested against a double-publish race), a full audit trail, per-locale content with an explicit required-locale contract enforced at publish time (never silently serves another locale), and rollback by seeding a new draft from an older version's content and republishing it. Markdown renders through one shared `markdown-it-py` + `nh3` allowlist renderer/sanitizer used identically by the admin live preview and the public endpoint — raw HTML, scripts, iframes, event handlers, and unsafe link schemes are stripped or sanitised, and only h2/h3, paragraphs, emphasis, links, lists, blockquotes, and code survive. Added an admin editor (Markdown source, a small formatting toolbar, live preview, version history, rollback) and switched the public privacy-policy page from static compiled content to this backend. Migrated the currently-published privacy policy text into the initial published version unchanged, except that the data-retention and rights-request sections were tightened to stop asserting an automated deletion/anonymisation pipeline that #934 has not built yet — per this document's own guidance that the migration "must not preserve promises the product still cannot fulfil." #934 remains open; its retention schedule and rights workflow should be published as a new version through this editor once implemented. |
| #937 | Completed | 2026-09-03 | #937, PR #975 | Added in-page QR check-in scanning (native `BarcodeDetector`, `jsqr` fallback) that hands decoded credentials straight to the existing lookup mutation with no navigation or OS-camera-app switch, an auto-return-to-scanner "Scan next" flow, and an online/offline connectivity banner. The offline queue/service-worker precaching from the original proposal was explicitly descoped: check-in requires live connectivity by product decision, so the banner (which already states check-ins can't be submitted while offline) is the intended behaviour rather than a gap. This issue no longer needs a service worker at all; the shared-worker contract the audit originally asked it to coordinate with #941 on now belongs to #941 alone, per `docs/decisions/941-web-push-foundation.md`. |
| #945 | Completed | 2026-09-02 | #945, PR (this change) | Added purpose-built localised announcements with UTC publication windows, safe optional links, deterministic ordering, publication metadata, complete mutation auditing, admin editing/status/preview controls, and an explicitly localised public API. The public site uses a static reduced-motion-safe banner; ordinary notices are not live while urgent notices receive a one-time alert region. |
| #935 | Completed | 2026-09-02 | #935, PR (this change) | Extracted a shared themed `ConfirmModal` and converted all eight `window.confirm` destructive-action dialogs (venue archive/delete, table-type dimension-change/delete, layout/table/area delete, account delete) to it, fixing the "prevent additional dialogs" browser suppression that silently broke repeated deletes in `LayoutEditor`. Added `role="status"`/`role="alert"` live-region coverage to mutation-result alerts in `RegistrationList`, `VenueManagement`, `LayoutEditor`, `PeopleManagement`, and `ContentManagement`, following the pattern already established in `CheckInPage`. Added `jest-axe` assertions to each of those five components' render tests, which caught and fixed a real violation: `aria-sort` on a `<th role="button">` is invalid ARIA (the role override drops the implicit `columnheader` role `aria-sort` requires) — removed the redundant `role="button"` override across `RegistrationList`, `PeopleManagement`, `MembersManagement`, and `VolunteersManagement`, since the existing `tabIndex`/`onKeyDown` already made the header keyboard-operable. Reduced `pnpm lint`'s React Compiler warning count from 30 to 11 by converting the "reset state when a prop changes" effects (all seven form-modal reset-on-open effects, plus `AuthContext`, `AdminDashboard`, `SettingsManagement`, `CheckInPage`, `RegistrationList`, and four in `LayoutEditor`) to the adjust-state-during-render pattern, and fixing three genuine ref-during-render reads (`Countdown`, `ContactForm`, plus one `MyRegistrationsPage` `useCallback` dependency-array gap); the 11 remaining warnings are documented, verified-legitimate exceptions (client-only hydration mount guards, an impure `Date.now()` seed, an async session-recovery effect, and two dnd-kit/TanStack-table ref-accessor patterns that the linter cannot distinguish from an unsafe render-time read). Corrected three genuinely wrong translations (NL check-in mislabelled as clocking-in, NL "Standalone" left in English, FR "Email" missing its hyphen). |
| #943 | Completed | 2026-09-01 | #943, PR (this change) | Added previewed, individually addressed email-client actions for member/person rows and four localised registration templates and server-delivered confirmations, including an explicit persisted communication-language preference collected during registration and editable by administrators, with encoded `mailto:` links, a long-message clipboard fallback, accessibility labels, and strict exclusion of internal registration fields. No backend write or delivery audit is created. |
| #933 | Completed | 2026-09-01 | #933, PR (this change) | Added capacity-safe party-size editing with bundled-order recalculation and audit history, optional public accessibility requirements, and validated per-event registration closing deadlines exposed through REST, MCP, admin editing, and the public closed state. |
| #931 | Completed | 2026-09-01 | #931, PR (this change) | `GET /api/registrations` now returns a `{items, total, limit, page}` envelope with one shared default page size and filter set (search and browse, including edition/date/person/edition-category filters and server-side sort) instead of "20 when searching, unbounded when not", with a ceiling decoupled from the volunteer door-lookup limit. `RegistrationList` is now genuinely server-paginated (page controls, page-size selector) rather than fetching everything into the browser; per-event capacity and status/edition counts still read the full working set, which they need for correct totals. Bulk actions and CSV export — which paginating the table would otherwise have silently capped at one page — got a Gmail-style "select all N matching" expansion and now cover every filtered row, with bulk mutations batched instead of fired all at once. `GET /api/people`, `/api/volunteers`, and `/api/members` got the same `{items, total, limit, page}` envelope and admin-sized default/ceiling (also decoupled from the door-lookup limit) — `/api/people`'s search path had the same "silently capped at 50" bug as registrations had at 20; the People/Volunteers/Members admin tabs stay full client-side tables (their datasets are far smaller than the guest list), so `fetchPeople`/`fetchPeopleSearch`/`fetchMembers` now fetch one bounded "everything" page and log loudly if it was ever truncated, instead of trusting an unbounded query forever. Kept `/api/volunteers` as a separate endpoint from `/api/people` — it carries `help_periods` plus NISS/eID uniqueness rules that don't map onto generic Person CRUD. `/api/members` was narrower: its `GET` list route was a pure `role=member` filter with an independently-written (and already-drifted) search predicate, so it was retired — the member list is now read via `/api/people?role=member` — while `POST`/`PUT`/`DELETE /api/members` stayed, since "delete a member" is a role removal (soft archive), not a generic person delete, and deserves its own named operation. `admin` and `visitor` are plain `Person.roles` tags with no dedicated endpoint, so `/api/people?role=` already covers them. The People/Volunteers/Members tables also gained TanStack's built-in client-side pagination (`rowPaginationFeature`, opt-in per table via `manualPagination: false` so `RegistrationList`'s server-paginated table is unaffected) — previously every filtered row rendered in one unpaginated `<tbody>`; CSV export and the "no results"/export-disabled checks were updated to read the pre-pagination row model so they still cover every filtered row, not just the visible page. |
| #926 | Completed | 2026-08-30 | #926, PR (this change) | Removed the dead table reservation column, derived non-cancelled occupancy from registrations, and shipped a volunteer read-only floor plan linked from check-in. |
| #927 | Completed | 2026-08-30 | #927, PR (this change) | Made the table type the single stored soft capacity source, added locked guest-capacity checks across REST/MCP assignment, preserved plan type editing, and added confirmation, audited override, and distinct overfilled styling. |
| #928 | Completed | 2026-08-30 | #928, PR (this change) | Re-resolved admin/MCP order edits against event products, preserved clamped delivery state, and restricted volunteer edits to validated delivery counts. |
| #929 | Completed | 2026-08-30 | #929, PR (this change) | Triggered blanket cache recovery on each server `ready` frame, before consuming later stream events, including the first connection for restored tabs. |
| #930 | Completed | 2026-08-30 | #930, PR (this change) | Applied one shared spreadsheet-formula guard to every backend registration and volunteer CSV cell, aligned it with the frontend rule, and added export regression coverage. |
| #922 | Completed | 2026-08-30 | #922, PR (this change) | Attached authenticated bookings at creation, added email-proven ownership claims for older unowned bookings, and made owned registrations available to the web and Pebble self-service reads without trusting OIDC email claims. |
| #947 | Completed | 2026-08-30 | #947, PR #952 | Added a durable database-backed outbox, atomic token-bound worker claims, bounded retries, delivery diagnostics and retention, plus independently supervised worker deployment wiring. |
| #924 | Completed | 2026-08-30 | #924, PR #952 | Queued confirmations for public and admin bookings and provided guests with booking references, QR/check-in access, calendar links, and order details through email and the protected guest view. |
| #940 | Completed | 2026-08-29 | #940, PR #951 | Added validated, audited public contact settings with a translated admin form and shared last-good/fallback rendering across contact, maintenance, and privacy pages. |
| #923 | Completed | 2026-08-29 | #923, PR #950 | Persisted retry-safe contact submissions before success, added best-effort organiser notification and scoped limiting, exposed an admin inbox with idempotent handling, and corrected public error surfacing. |
| #938 | Completed | 2026-08-29 | #938, PR #948 | Corrected the backend API and SMTP documentation, removed shipped event CRUD and CSV exports from the backlog, and replaced speculative implementation plans with the canonical audit link. |
| #921 | Completed | 2026-08-29 | #921, PR #948 | Split public-operation buckets, keyed QR check-in limits per registration with a high shared-IP backstop, and added same-IP event-day regression coverage. |
| #939 | Completed | 2026-08-29 | #939, PR #948 | Blocked cancelled registrations across QR, volunteer, and admin check-in paths; rotated cancellation tokens; and disabled cancelled entrance actions in the volunteer UI. |
| #925 | Completed | 2026-08-29 | #925, PR #949 | Kept the last good maintenance value, distinguished HTTP client failures from outages, backed off failed polling, added response caching, and added regression coverage. |

## Findings index

Four issues carry `priority-high`; the rest are unlabelled for priority
deliberately, since the phase order above is a better signal than a flat label.

| Issue | Area | Kind |
| --- | --- | --- |
| #921 | backend, android (completed 2026-08-29) | bug — event-day blocker |
| #922 | backend, auth (completed 2026-08-30) | bug — dead feature |
| #953 | frontend, backend, auth | gap — visitor account and order-history experience |
| #923 | backend, frontend (completed 2026-08-29) | bug — silent data loss |
| #924 | backend, frontend (completed 2026-08-30) | gap — core flow incomplete |
| #925 | frontend, backend | bug — availability |
| #926 | backend, frontend (completed 2026-08-30) | bug — wrong data, dead column |
| #927 | backend, frontend, mcp (completed 2026-08-30) | bug — missing enforcement |
| #928 | backend, mcp (completed 2026-08-30) | bug — broken invariant |
| #929 | frontend (completed 2026-08-30) | bug — stale state |
| #930 | backend (completed 2026-08-30) | bug — export safety |
| #931 | backend, frontend (completed 2026-09-01) | bug — silent truncation |
| #932 | backend | constraint — scaling |
| #933 | backend, frontend (completed 2026-09-01) | gap — lifecycle |
| #934 | backend | gap — compliance |
| #935 | frontend (completed 2026-09-02) | quality — UI/UX, a11y |
| #936 | frontend | gap — discoverability |
| #937 | frontend (completed 2026-09-03) | gap — event-day resilience |
| #938 | docs (completed 2026-08-29) | accuracy |
| #939 | backend, frontend (completed 2026-08-29) | bug — oversell risk |

## Communications roadmap index

These issues are planned product work rather than findings against shipped
behaviour. They are tracked by #946 and appear in the combined phases above.

| Issue | Area | Kind | Primary prerequisite or coordination |
| --- | --- | --- | --- |
| #940 | backend, frontend, admin (completed 2026-08-29) | public contact settings | Built on #925 failure semantics; related to #923 |
| #943 | frontend, admin (completed 2026-09-01) | individual email-client actions | Does not replace #924 |
| #945 | backend, frontend, admin, accessibility (completed 2026-09-02) | scheduled announcements | Coordinated with #929, #931, and #935 |
| #944 | backend, frontend, admin, security (completed 2026-09-04) | versioned policy publishing | Shipped ahead of #934's policy decisions; migrated text tightened to avoid overstating them |
| #947 | backend, cross-cutting (completed 2026-08-30) | durable outbox and worker | Follows #923's persistence shape; serves #924, #941, and #942 |
| #941 | backend, frontend, security | Web Push foundation | Uses #947; accounts for #932; service-worker contract documented for reuse |
| #942 | backend, frontend, admin | central composer | Blocked by #941 and #947 |

## Cross-cutting feature and audit relationships

- Completed **public contact settings (#940)** and completed **#923 (durable contact
  submissions)** both concern the contact path. #940 moves the public-facing
  values into settings; #923 established persistence, organiser notification,
  and an admin inbox independently of those settings.
- Completed **versioned policy publishing (#944)** and open **#934 (retention
  and erasure)** are two halves of the same compliance story. #944 shipped the
  infrastructure — draft/publish, immutability, locale enforcement, sanitized
  Markdown, audit trail — ahead of #934 rather than waiting on it; its initial
  migrated version carried the previously-compiled policy text over unchanged,
  except that the data-retention and rights-request sections were rewritten to
  stop asserting an automated deletion/anonymisation pipeline that doesn't
  exist yet, so the publication does not overstate what #934 has not built.
  #934 still needs its retention schedule and rights workflow decided and
  implemented, after which the policy should be republished through #944's
  admin editor to describe the real behaviour.
- **The announcement banner (#945)** and **#935 (UI/UX pass, complete)** both
  added live regions, for different surfaces: the banner's static,
  urgent-only `aria-live` on a persistent public banner, and #935's
  `role="status"`/`role="alert"` on transient admin mutation-result alerts —
  the pattern already established in `CheckInPage`, now carried through
  `RegistrationList`, `VenueManagement`, `LayoutEditor`, `PeopleManagement`,
  and `ContentManagement`. No parallel convention was introduced.
- **The shared outbox (#947)** is the bridge between the audit's individual
  delivery gaps (#923 and #924) and the roadmap's push/composer work (#941 and
  #942). It owns persistence, claiming, retry, and crash-recovery mechanics, but
  deliberately owns no audience or message-composition product surface.
- **Web Push (#941)** requires a production service worker. Offline web
  check-in (#937) was decided **not** to need one — check-ins require live
  connectivity by design; the connectivity banner covers the failure mode
  instead of a queue-and-replay flow. The service-worker contract in
  [`docs/decisions/941-web-push-foundation.md`](decisions/941-web-push-foundation.md)
  (one worker file, per-feature cache versions, additive event handlers) still
  stands so a future consumer can share #941's worker without redesigning it.
- **The central composer (#942)** also depends on the multi-process conclusions
  of #932. Its scheduling and deduplication are DB-backed through #947; its rate
  limits and any live invalidation must not rely on per-process state.

## Communications and policy feature specification

Epic: [#946 — Lightweight public communications and policy management —
without building a CMS](https://github.com/tjorim/champagnefestival/issues/946).

Administrators should be able to manage content that changes during normal
festival operations. Application structure, branding, credentials, and
infrastructure remain code- or deployment-managed. The feature set is
deliberately not a general-purpose CMS.

### Product boundary

In scope:

- Public contact details.
- Short, scheduled, localised public announcements.
- Versioned legal policies written in a restricted Markdown subset.
- Individual email-client actions for members and registrations.
- Opt-in Web Push after a subscription and consent foundation exists.
- A central composer for supported announcement and push channels.

Out of scope:

- Arbitrary pages, layouts, blocks, HTML, or CSS.
- Navigation, themes, logos, and hero composition.
- SMTP or VAPID credentials in the database.
- Uploaded recipient lists or arbitrary database audience queries.
- Bulk marketing email until consent, unsubscribe, suppression, bounce, and
  delivery requirements have a separate approved design.
- Uploaded executable content.

Every feature keeps a narrowly defined schema and fixed frontend rendering.
Public content is escaped or sanitised, admin changes are audited, all three
locales and accessibility behaviour are tested, and each write operation has a
documented retry-safety decision.

### #940 — public contact settings

[GitHub issue](https://github.com/tjorim/champagnefestival/issues/940)

Move only the public-facing contact values into the existing application
settings:

- `public_email`
- `public_phone`
- `facebook_url`

SMTP credentials, sender identity, the internal contact-form recipient, VAPID
keys, and other secrets stay in deployment configuration.

Acceptance criteria:

- [x] `GET /api/settings` exposes the public values without exposing secrets.
- [x] `PUT /api/settings` remains admin-only and validates email, phone, and
      HTTPS social URLs.
- [x] The Settings dashboard provides a small form with translated labels.
- [x] Contact, maintenance, and policy pages consume the settings.
- [x] Empty optional values hide the corresponding public action cleanly.
- [x] Compiled defaults and the last good response cover rollout and API-error
      paths without incorrectly enabling maintenance mode; follow #925.
- [x] Changes create audit entries.
- [x] Backend, frontend, and public rendering tests are included.
- [x] The non-retry-safe `PUT` decision is documented; the client does not
      retry automatically.

### #945 — scheduled localised announcement banner

[GitHub issue](https://github.com/tjorim/champagnefestival/issues/945)

Publish short operational messages such as sold-out notices, entrance changes,
or timing updates. The data model is an announcement, not a generic content
block.

Proposed fields:

- Stable ID.
- Dutch, English, and French short text.
- `info`, `warning`, or `urgent` level.
- Active flag and deterministic display order.
- Optional `starts_at` and `ends_at` timestamps.
- Optional safe link and translated link label.
- Created, updated, and published metadata.

Acceptance criteria:

- [ ] Admins can create, preview, schedule, disable, reorder, and expire
      announcements.
- [ ] Locale completeness is visible; missing text never silently falls back to
      another language.
- [ ] Publication windows are evaluated server-side in UTC and visibility is
      database-derived across restarts.
- [ ] The public API returns only currently visible announcements.
- [ ] The default presentation is a static, accessible banner.
- [ ] Optional motion pauses on hover/focus, has a pause control, and is
      disabled by `prefers-reduced-motion`.
- [ ] Ordinary notices do not repeatedly announce through a live region;
      urgent notices use one only when appropriate.
- [ ] Live invalidation, if added, follows #929's corrected recovery contract.
- [ ] Admin lists/history use explicit pagination rather than silent caps.
- [ ] Create, update, publish, unpublish, reorder, and delete are audited.
- [ ] Write retry-safety decisions and scheduling tests are included.

### #943 — individual email-client actions

[GitHub issue](https://github.com/tjorim/champagnefestival/issues/943)

Open an administrator's configured email client with a prepared individual
message. The application must not claim that it sent the message, and this
feature does not replace the server-delivered confirmation and QR in #924.

Scope:

- Member/person row action when an email address exists.
- Registration-detail action with templates for a general registration
  message, event information, order summary, and outstanding-payment reminder.
- Optional order context limited to the selected registration: event,
  registration reference, product names/quantities, amount due, and payment
  status.

Internal notes, check-in/access tokens, audit history, and unrelated
registrations must never be included.

Acceptance criteria:

- [x] The UI says **Open in email client**, never **Send**.
- [x] Admins preview recipient, subject, and body before opening `mailto:`.
- [x] Recipient, subject, and body are correctly encoded.
- [x] Long messages offer copy-to-clipboard instead of an oversized URL.
- [x] The order template uses only the selected registration.
- [x] No backend write or false “sent” audit record is created.
- [x] Bulk recipients and uploaded address lists are out of scope.
- [x] Accessibility and sensitive-field exclusion are tested.

### #944 — versioned Markdown policy publishing

[GitHub issue](https://github.com/tjorim/champagnefestival/issues/944)

Manage policies through immutable published versions and derive “last updated”
from publication time. Use a Markdown source editor with rendered preview
rather than stored WYSIWYG HTML. A small toolbar may assist authors, but the
source remains visible and portable.

Proposed model:

- Stable policy key, initially `privacy`, and translated title.
- Version ID/sequence and optional internal change summary.
- Per-locale Markdown source.
- `draft`, `published`, or `superseded` status.
- Created, updated, and `published_at` timestamps.
- Creating and publishing actor.

Publication rules:

- Drafts are editable; published versions are immutable.
- Publishing atomically supersedes the previous current version.
- Historical versions cannot be deleted and remain inspectable.
- “Last updated” is `published_at`, never manually entered.
- Rollback republishes old content as a new version.
- Concurrent publication is protected by a precondition or database row lock.
- The initial migration does not preserve promises the product still cannot
  fulfil: rather than wait for #934's retention/rights decisions, the migrated
  text was carried over unchanged except for tightening the data-retention and
  rights-request sections, which are the two that claimed an automated
  deletion/anonymisation pipeline #934 has not built. #934 remains open; its
  eventual retention schedule and rights workflow should be published as a new
  version through this editor.

Markdown safety and acceptance criteria:

- [x] Support an explicit Markdown subset only.
- [x] Disallow raw HTML and unsafe URL schemes.
- [x] Sanitize rendered HTML with an allowlist and apply safe link attributes.
- [x] Preview and public output use exactly the same renderer/sanitizer.
- [x] Admins can create a draft from the current version and preview every
      locale.
- [x] Locale publication requirements are explicit and enforced.
- [x] Publish is atomic, audited, and concurrency-tested.
- [x] The public page serves only the latest published version.
- [x] Historical versions and publishing actors remain visible to admins.
- [x] The compiled policy is migrated into an initial published version.
- [x] Tests cover scripts, raw HTML, unsafe links, and malformed Markdown.
- [x] Publish retry-safety is implemented and documented before automatic
      retry.

### #947 — durable outbox and scheduled-delivery worker

[GitHub issue](https://github.com/tjorim/champagnefestival/issues/947)

Provide a small database-backed delivery contract shared by contact
notifications (#923), registration confirmations (#924), administrator test
pushes (#941), and scheduled composer delivery (#942). This is infrastructure,
not a campaign or audience feature.

Acceptance criteria:

- [x] Durable jobs have stable identity, type, schedule, state, attempts, and
      timestamps; payloads contain only necessary references or snapshots.
- [x] Business state and enqueueing are atomic where the workflow requires it.
- [x] Multiple workers claim work atomically; duplicate execution is prevented.
- [x] Jobs survive restarts and abandoned claims recover safely.
- [x] Retry classification, bounded backoff, terminal failure, and poison-job
      isolation are implemented and tested.
- [x] Scheduling uses UTC database/server time.
- [x] Delivery diagnostics and audit events distinguish queued work from actual
      outcomes without exposing credentials, tokens, endpoints, or secrets.
- [x] Cleanup and retention coordinate with #934; shared rate limits account
      for #932.
- [x] At least one individual transactional path adopts the foundation before
      broader delivery work.

### #941 — Web Push/VAPID subscription foundation

[GitHub issue](https://github.com/tjorim/champagnefestival/issues/941)

Build secure opt-in and delivery infrastructure before adding an administrator
broadcast button. There is currently no production notification service worker
or VAPID subscription lifecycle.

Decisions to record first — proposed defaults for all of these are in
[`docs/decisions/941-web-push-foundation.md`](decisions/941-web-push-foundation.md),
pending the project owner's confirmation:

- Anonymous, authenticated, or both kinds of subscribers.
- Account- versus device-scoped subscriptions.
- Notification categories and default preferences.
- Event-specific subscription support.
- Retention and expired-subscription cleanup.
- Browser/iOS support expectations and future Android boundary.
- Consent and privacy-policy wording.
- Service-worker ownership, cache, and update strategy — settled: #937 was
  descoped to need no service worker, so this worker has no other co-tenant
  today, but the same file/versioning/additive-handler shape from the
  decision doc still applies to whichever future feature needs one next.

Acceptance criteria:

- [ ] A production service worker coexists safely with application updates.
- [ ] The VAPID public key is client-visible; the private key remains an
      environment secret.
- [ ] Users explicitly opt in and can unsubscribe.
- [ ] Subscription locale, preferences, consent, and lifecycle are persisted.
- [ ] Mutation endpoints and test delivery are authorised and rate-limited
      through multi-worker-safe state.
- [ ] `404`/`410` responses retire invalid subscriptions.
- [ ] Payload size and target URLs are validated.
- [ ] A restricted admin test notification uses #947 and is audited.
- [ ] Consent, retention, privacy, and retry/idempotency decisions are tested
      and documented.
- [ ] No general broadcast composer is included.

### #942 — central announcement and push composer

[GitHub issue](https://github.com/tjorim/champagnefestival/issues/942)

Blocked by #941 and #947; #945's announcement destination is complete. Compose one operational message centrally and
deliver it only through explicitly selected public-announcement and Web Push
channels. Server-sent bulk email remains out of scope.

Proposed fields and audiences:

- Translated short title/body, selected channels, severity/category, and an
  optional validated internal URL.
- Explicit supported audience, draft/scheduled/published/sent state, immutable
  send snapshot, delivery counts, and failure summary.
- Initially, all opted-in subscribers and optionally event-specific opted-in
  subscribers. No arbitrary queries or uploaded lists.

Acceptance criteria:

- [ ] Every locale/channel has an accurate preview.
- [ ] The estimated audience is shown before explicit confirmation.
- [ ] Scheduled sends use #947's durable, idempotent worker contract.
- [ ] Duplicate worker execution cannot send twice.
- [ ] The immutable snapshot and admin actor are audited.
- [ ] Failure in one channel does not roll back a successful other channel.
- [ ] Per-channel results are visible without exposing subscription secrets.
- [ ] Authorisation and shared rate limits are enforced.
- [ ] Email remains absent until campaign compliance and delivery handling have
      a separately approved design.

## Examined and found sound

Recorded so this ground does not get re-covered:

- **Authentication and authorisation.** Router-level dependencies are correctly
  applied; every admin router carries `require_admin`, `/api/venue-plan` and
  `/api/volunteer` carry `require_volunteer`. Route ordering puts `/export`
  ahead of `/{id}` in both routers that need it. `DEV_AUTH_BYPASS_TOKEN` is
  structurally prevented from being set outside development.
- **Public event capacity.** `_ensure_public_registration_allowed` takes a
  `SELECT ... FOR UPDATE` row lock before summing guest counts, so concurrent
  bookings cannot both pass the check. #927 now applies the same row-lock pattern
  to tables.
- **Check-in token handling.** 32-byte `secrets.token_urlsafe` tokens compared
  with `secrets.compare_digest`, sent in the request body rather than the query
  string specifically to keep them out of access logs and `Referer` headers.
- **Guest access tokens.** Hashed at rest, single-use, expiry enforced, and the
  request endpoint returns `202` regardless of whether the address exists — no
  account enumeration.
- **Metrics endpoint.** Timestamped HMAC with a 60-second window and constant-
  time comparison; disabled entirely when no secret is configured.
- **Idempotency.** The bulk-create replay contract in `app/services/idempotency.py`
  is genuinely DB-backed and correct, including request-hash mismatch detection.
- **Translations.** All three locales carry all 749 keys with no gaps. The
  handful of values identical across locales are legitimate cognates; the three
  genuine mistranslations are noted in #935.
- **Frontend CSV export.** Already guards formula injection correctly — it is
  the backend that does not (#930).
- **Audit logging.** Broad coverage with before/after detail on the mutations
  that matter, and keyset pagination on the read endpoint.

## Open questions for the maintainer

Two findings propose changes that are judgement calls rather than clear fixes:

1. **#924** exposes `check_in_token` only from the short-lived, single-use
   email-token-protected guest endpoint so a guest can retrieve their own QR;
   the public registration response continues to omit it.
2. **#934** needs a retention schedule decided per table before any code, and
   raises whether `national_register_number` should be stored outside the window
   in which the insurance export is produced.
