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

#992's repo-side implementation is complete and tested (2026-09-07), but
blocked from taking live effect by an unmade `tjorim/apps` infra companion
change — see its row below. #953's backend and frontend session mechanism is
implemented; one acceptance criterion (the public navigation entry) stays
deliberately undone — see its row below. #941 is complete — see **Completed
or superseded work**.

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 1 | #953 — visitor passwordless account and order history | Implemented 2026-09-07 per [`docs/decisions/953-visitor-passwordless-session.md`](decisions/953-visitor-passwordless-session.md), with one acceptance criterion deliberately left undone. `User.oidc_subject` is now nullable alongside a new `verified_email` (exactly one set, DB-enforced), backing a magic-link request/redeem/status/sign-out flow (`visitor_magic_links`, `visitor_sessions` — 7-day idle / 30-day hard-cap, `HttpOnly` cookie) that establishes the same `User` read paths `/api/me/*` already had for OIDC — `list_my_registrations`, the communication-preference endpoints, and `claim_my_registrations` now resolve the caller through either credential via a single `get_current_user` dependency structurally separate from `require_admin`/`require_volunteer` (never wired into either, so a visitor session cannot reach them). Redeeming a link immediately claims any currently-unowned registration matching the verified email, sharing `claim_unowned_registrations_for_email` with the pre-existing OIDC claim path rather than duplicating it. The frontend's pre-existing `/my-registrations` page (built for the one-shot guest lookup) now also auto-detects a returning visitor's session on load, so checking an order weeks later needs no fresh email, with a sign-out control and session-expiry display added. **Left undone, on purpose:** the public navigation entry stays off — advertising "My orders" before production transactional email delivery is verified end to end (per #953 and #924/#947's own gate) would be worse than not offering it — and the DB-stored privacy/account policy text (#944) hasn't been republished to describe the new session, the same kind of legal-content edit #934 left for the project owner rather than auto-editing. The old one-shot `POST /api/registrations/my/access` lookup stays in the backend, unused by this page now but not removed — a separate cleanup decision, not part of this scope. | L |
| 2 | #992 — live backend rendering of `/` and `/privacy` | Split out of #936 (now superseded, see **Completed or superseded work**) once build-time prerendering turned out to be the wrong fit for admin-editable, live-DB-backed content. Original proposal: backend route handlers for those two paths only, rendering real meta/JSON-LD/FAQ/schedule content per request straight from the database, plus a routing change in `tjorim/apps`. Decisions confirmed 2026-09-07 in [`docs/decisions/992-live-public-render.md`](decisions/992-live-public-render.md): inject into the Vite-built shell through inert markers rather than adopting a template engine that would drift from the build artifact; a 60-second TTL with a last-known-good fallback as the correctness floor, with proactive `NOTIFY`-based invalidation built in the same change rather than deferred; the backend as the single JSON-LD source for these routes, with a shared fixture and contract tests on both sides; and equivalent, not pixel-matched, server markup. Moved behind #953 on 2026-09-06. **Implementation status (2026-09-07):** backend and frontend implementation complete and tested — see the decision doc's "Implementation summary". `GET /`/`GET /privacy` inject live-rendered meta tags, JSON-LD, and FAQ/schedule/policy content into the built shell via marker replacement; JSON-LD is built server-side from the same fixed fixture a frontend contract test also builds from, byte-for-byte equal. **Not yet in effect in production:** the `tjorim/apps` infra companion change (exact-path Caddy routing to the API, plus mounting the built frontend into the API container) has not been made — this session has no access to that repository. Until it ships, Caddy's existing static `file_server`/SPA fallback keeps serving `/` and `/privacy` exactly as before; this repo's new routes are correct and fully tested but currently unreachable. Needs a `tjorim/apps` PR before this can move to Completed. | L |

### Phase 5 — central composer

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 3 | #942 — central announcement and push composer | **Blocked by #947 (complete); #941 is complete (see Completed or superseded work); #945 is complete.** Scheduled work uses the durable outbox, immutable snapshots, atomic claims, and per-channel results. It adds no bulk e-mail channel. | L |

### Phase 6 — deferred visitor account

No Phase 6 items remain. #953 was promoted into Phase 4 on 2026-09-06 once its
remaining prerequisites (#922, #924, #947) turned out to already be complete —
its "deferred" placement had been an ordering choice, not a technical
blocker, and it was sitting behind lower-value work as a result.

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
| #932 | Completed | 2026-09-07 | #932, `docs/decisions/932-multi-worker-state.md` | Moved check-in's per-registration limit and shared-IP backstop (`app.ratelimit.check_check_in_rate_limit`) off the in-process deque onto a Postgres-backed fixed-window counter (`rate_limit_buckets`, one atomic `INSERT ... ON CONFLICT ... RETURNING`), swept daily by `app.worker` alongside the outbox cleanup; the remaining three `check_rate_limit` scopes (contact submission, registration create, registration access-request) stay in-process, an accepted narrower-than-module scope matching the decision doc's own text and given the same treatment as slowapi's blanket per-route limiter. Replaced the live bus's fire-and-forget post-commit `live_bus.publish` at all 22 call sites with a transactional `notify_live_event` (`SELECT pg_notify(...)`) issued before `db.commit()` on the same session, so publication is atomic with the mutation; a new `app.live.listener.PgLiveListener` (dedicated asyncpg LISTEN connection, reconnect with backoff, started/stopped from `app.main`'s lifespan) relays every notification — including a worker's own — into that worker's local `LiveBus`, so delivery is uniform across single- and multi-worker deployments. `GET /api/metrics` gained a `per_process: true` response field and a docstring caveat (decision 3, documented rather than fixed). `DEPLOYMENT.md` documents the interim single-worker constraint and its two remaining exceptions (slowapi's blanket limiter, the in-memory metrics collector). |
| #934 | Completed | 2026-09-07 | #934, `docs/decisions/934-data-retention-and-erasure.md`, `tjorim/apps#192` | Added `people_service.anonymise_person` (blanks name/phone/address/notes, keeps email and consent for anyone with `marketing_opt_in`, refuses anyone with a NISS/eID on file since volunteer retention is indefinite by separate decision), exposed as admin-triggered `POST /api/people/{id}/anonymise` plus `GET /api/people/due-for-anonymisation` surfacing candidates by `MAX(events.date)` — never a fully automatic sweep. Restricted `national_register_number`/`eid_document_number` out of the generic people/members list and single-person reads (REST `PersonSummaryOut`; MCP `get_person`/`get_member`/`list_members`), leaving create/update/merge and `/api/volunteers` unchanged since those already show the caller data they just provided or are actively verifying, with existing tests asserting exactly that for merge. Added `Person.marketing_opt_in`/`marketing_opt_in_at` with an unticked-by-default registration checkbox in `nl`/`en`/`fr` and an admin-only correction path. Corrected a pre-existing mislabelling: `write_audit_entry` had no way to record a client-IP actor as anything but a spurious OIDC subject; added an explicit `auth_source` parameter, and check-in's two audit writes now pass `auth_source="token"`. Two of the three proposed retention sweeps turned out to already exist as VPS-scheduled jobs (`tjorim/apps#177`, closed before this work) rather than needing new backend code; the third (30-day audit-IP redaction) ships the same way (`tjorim/apps#192`) rather than as in-process worker code, correcting the decision doc's original assumption that none of the three existed. Not done: republishing the privacy policy through #944's editor to describe the new pipeline — left for the project owner, since it's a legal-content edit outside this implementation's scope. |
| #941 | Completed | 2026-09-07 | #941, `docs/decisions/941-web-push-foundation.md`, PR #1014 | Added an anonymous, device-scoped `PushSubscription` model (natural-key upsert by `endpoint`, free-form `categories`/`event_ids` built now rather than deferred, consent/created/last-seen timestamps) with `GET /api/push/vapid-public-key` and `POST /api/push/subscriptions`(`/unsubscribe`), VAPID-signed delivery via `pywebpush` in `app/push.py` that retires a subscription on a 404/410 response instead of retrying it, and a `POST /api/push/test` admin-only endpoint that enqueues through #947's durable outbox (its own `"delivery_queued"` audit entry, not a second one). Subscribe/unsubscribe extend #932's Postgres-backed `check_rate_limit_pg` with a new `push-subscription-mutation` scope (anonymous public writes); the authenticated admin test-send uses the in-process limiter, matching #932's narrower scope for lower-volume admin actions. Retention combines 404/410 retirement and explicit unsubscribe with a new daily `cleanup_expired_subscriptions` sweep (`push_subscription_expiry_days`, default 180) in `app/worker.py`. Frontend: `usePushSubscription` hook and a `PushOptIn` consent card (explicit checkbox before the browser permission prompt, matching #934's marketing opt-in) on both the public landing page and the admin dashboard (with a test-send button there only); `frontend/src/sw/push.ts` adds `push`/`notificationclick` listeners to the shared service worker per the additive-module contract in the decision doc, with `notificationclick` always navigating to a fixed `"/"` path rather than any payload-supplied URL. 32 backend tests and 18 frontend tests (including axe accessibility checks) cover both opt-in states, rate limiting, retirement, and cleanup. A post-review hardening pass (same PR) fixed an SSRF gap (delivery-time private-address rejection plus redirect-disabled delivery), a rate-limit bypass (bucket increment could roll back with a rejected request), retention correctness (successful delivery now refreshes `last_seen_at`), a missing config validator, and two frontend gaps (mount-time backend reconciliation for an existing subscription, an unbounded "checking" state when no service-worker registration ever activates); see the decision doc's "Post-review hardening" section, including one deliberately deferred item (`pushsubscriptionchange` handling). Not built: #942's actual broadcast composer — #941 was scoped to the subscription foundation plus a one-off admin test-send only. |
| #936 | Superseded | 2026-09-05 | #936, PR #990 | Fixed the wrong-domain `robots.txt`/`sitemap.xml`/`baseUrl` (generated from `VITE_PUBLIC_URL` instead of hardcoding `champagnefestival.be`), added the missing `/privacy` sitemap entry with `xhtml:link` hreflang alternates, disallowed and `noindex`'d the staff-only routes, localised the static shell's default description/OG/Twitter tags to the `nl` base locale with `og:locale`/`og:locale:alternate` added, and added a minimal installability-only production service worker (no caching, no offline queue) per the shared-worker contract in `docs/decisions/941-web-push-foundation.md`. The remaining part — making schedule/FAQ/exhibitor content and `EventStructuredData` visible without JS — turned out not to be a prerendering problem: that content is live, admin-editable data (schedule/FAQ via the API, `/privacy`'s body via #944) with no redeploy involved, so a build- or deploy-time snapshot would go stale. Split out to #992, which proposes rendering `/` and `/privacy` live from the backend on every request instead. |
| #944 | Completed | 2026-09-04 | #944, PR (this change) | Added a versioned Markdown policy model (`policies`/`policy_versions`) with a draft → publish → superseded lifecycle enforced by partial-unique indexes and a policy-row lock (concurrency-tested against a double-publish race), a full audit trail, per-locale content with an explicit required-locale contract enforced at publish time (never silently serves another locale), and rollback by seeding a new draft from an older version's content and republishing it. Markdown renders through one shared `markdown-it-py` + `nh3` allowlist renderer/sanitizer used identically by the admin live preview and the public endpoint — raw HTML, scripts, iframes, event handlers, and unsafe link schemes are stripped or sanitised, and only h2/h3, paragraphs, emphasis, links, lists, blockquotes, and code survive. Added an admin editor (Markdown source, a small formatting toolbar, live preview, version history, rollback) and switched the public privacy-policy page from static compiled content to this backend. Migrated the currently-published privacy policy text into the initial published version unchanged, except that the data-retention and rights-request sections were tightened to stop asserting an automated deletion/anonymisation pipeline that #934 had not built yet — per this document's own guidance that the migration "must not preserve promises the product still cannot fulfil." #934's retention schedule and anonymisation mechanism are now implemented; the policy text has not yet been republished to describe them — a legal-content edit for the project owner to make through this editor. |
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
| #932 | backend (completed 2026-09-07) | constraint — scaling |
| #933 | backend, frontend (completed 2026-09-01) | gap — lifecycle |
| #934 | backend (completed 2026-09-07) | gap — compliance |
| #935 | frontend (completed 2026-09-02) | quality — UI/UX, a11y |
| #936 | frontend (superseded 2026-09-05, split to #992) | gap — discoverability |
| #937 | frontend (completed 2026-09-03) | gap — event-day resilience |
| #938 | docs (completed 2026-08-29) | accuracy |
| #939 | backend, frontend (completed 2026-08-29) | bug — oversell risk |
| #992 | backend, frontend (implemented 2026-09-07, blocked on `tjorim/apps` infra) | gap — discoverability (split from #936's "M" part) |

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
| #941 | backend, frontend, security (completed 2026-09-07) | Web Push foundation | Uses #947; accounts for #932; service-worker contract documented for reuse |
| #942 | backend, frontend, admin | central composer | Blocked by #947 (complete); #941 is complete |

## Cross-cutting feature and audit relationships

- Completed **public contact settings (#940)** and completed **#923 (durable contact
  submissions)** both concern the contact path. #940 moves the public-facing
  values into settings; #923 established persistence, organiser notification,
  and an admin inbox independently of those settings.
- Completed **versioned policy publishing (#944)** and completed **#934
  (retention and erasure)** are two halves of the same compliance story. #944
  shipped the infrastructure — draft/publish, immutability, locale
  enforcement, sanitized Markdown, audit trail — ahead of #934 rather than
  waiting on it; its initial migrated version carried the previously-compiled
  policy text over unchanged, except that the data-retention and
  rights-request sections were rewritten to stop asserting an automated
  deletion/anonymisation pipeline that didn't exist yet, so the publication
  didn't overstate what #934 hadn't built. #934's retention schedule and
  anonymisation mechanism are now implemented; the policy text itself has not
  been republished to describe it — that's a legal-content edit for the
  project owner to make and publish through #944's admin editor, not part of
  #934's implementation (see the decision doc's "Implemented" section).
- **The announcement banner (#945)** and **#935 (UI/UX pass, complete)** both
  added live regions, for different surfaces: the banner's static,
  urgent-only `aria-live` on a persistent public banner, and #935's
  `role="status"`/`role="alert"` on transient admin mutation-result alerts —
  the pattern already established in `CheckInPage`, now carried through
  `RegistrationList`, `VenueManagement`, `LayoutEditor`, `PeopleManagement`,
  and `ContentManagement`. No parallel convention was introduced.
- **The shared outbox (#947)** is the bridge between the audit's individual
  delivery gaps (#923 and #924) and the roadmap's push/composer work (#941,
  complete, and #942). It owns persistence, claiming, retry, and
  crash-recovery mechanics, but deliberately owns no audience or
  message-composition product surface.
- **Web Push (#941, complete)** added the production service worker's `push`/
  `notificationclick` listeners. Offline web check-in (#937) was decided
  **not** to need a service worker at all — check-ins require live
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
  deletion/anonymisation pipeline #934 had not built yet at the time. #934's
  retention schedule and anonymisation mechanism are now implemented; the
  policy text has not yet been republished to describe them — a legal-content
  edit for the project owner to make through this editor, not automated by
  #934's implementation.

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

Decisions confirmed 2026-09-07 in
[`docs/decisions/941-web-push-foundation.md`](decisions/941-web-push-foundation.md):

- Anonymous, public subscribers — corrected from the doc's original
  authenticated-only proposal; "administrator-only" describes who can send a
  test push, not who can subscribe.
- Device-scoped subscriptions (not account fan-out).
- Multi-category schema and event-specific subscription support, both built
  now rather than deferred to #942.
- Retention: unsubscribe or `404`/`410` retirement, plus a time-based expiry
  sweep.
- Browser/iOS support expectations and future Android boundary — documented
  platform constraints, not choices.
- Consent and privacy-policy wording — Claude drafts during implementation
  (matching the existing `privacyPolicy.ts` pattern), project owner reviews.
- Service-worker ownership, cache, and update strategy — settled: #937 was
  descoped to need no service worker, so this worker has no other co-tenant
  today, but the same file/versioning/additive-handler shape from the
  decision doc still applies to whichever future feature needs one next.

Acceptance criteria:

- [x] A production service worker coexists safely with application updates.
- [x] The VAPID public key is client-visible; the private key remains an
      environment secret.
- [x] Users explicitly opt in and can unsubscribe.
- [x] Subscription locale, preferences, consent, and lifecycle are persisted.
- [x] Mutation endpoints and test delivery are authorised and rate-limited
      through multi-worker-safe state. Subscribe/unsubscribe use #932's
      Postgres-backed limiter (public, anonymous endpoints); the
      authenticated admin test-send uses the in-process limiter, the same
      narrower-scope treatment #932 already gives contact/registration
      endpoints.
- [x] `404`/`410` responses retire invalid subscriptions.
- [x] Payload size and target URLs are validated.
- [x] A restricted admin test notification uses #947 and is audited.
- [x] Consent, retention, privacy, and retry/idempotency decisions are tested
      and documented.
- [x] No general broadcast composer is included.

### #942 — central announcement and push composer

[GitHub issue](https://github.com/tjorim/champagnefestival/issues/942)

#941 and #947 are complete; #945's announcement destination is complete. Compose one operational message centrally and
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

One remaining note, kept for historical context; the judgement calls
themselves have all been resolved by the project owner as decision docs
(#934 on 2026-09-06; #941, #953, and #992 on 2026-09-07 — see
`docs/decisions/`; #953 and #992's implementation status is tracked in
Phase 4 above; #941 is implemented — see **Completed or superseded work**).

1. **#924** exposes `check_in_token` only from the short-lived, single-use
   email-token-protected guest endpoint so a guest can retrieve their own QR;
   the public registration response continues to omit it.
