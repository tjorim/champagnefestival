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

| Order | Issue | Why first | Effort |
| --- | --- | --- | --- |
| 1 | #925 — maintenance page hijacks the public site | A single failed `/api/settings` poll flips an open tab to the placeholder. Cheap to bound correctly. | S |

Phase 0 is deliberately all-**S**. It is the shortest path to a system that
survives an event day.

### Phase 1 — close the contact and booking loops

The public booking flow currently ends with a success message and nothing else.
This phase is the largest product gain in the audit.

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 2 | #923 — contact form discards every message | Establishes honest persist-before-success semantics, unblocks the rights channel in #934, and supplies the first delivery use case for #947. | M |
| 3 | #940 — public contact settings | Build immediately after #925 settles `/api/settings` failure semantics. It shares the public contact path with #923 but remains independent of message delivery, so the two can run in parallel after their contracts are agreed. | S–M |
| 4 | #947 — durable outbox and scheduled-delivery worker | Extract the shared DB-backed delivery contract after #923 establishes persistence semantics. Adopt it in an individual transactional path before using it for push fan-out. | M–L |
| 5 | #924 — no confirmation e-mail, QR only in the admin UI | The single biggest product gap. Reuses #923's persistence decisions and #947's delivery contract rather than adding inline SMTP or a second queue. | M–L |
| 6 | #922 — `Registration.user_id` never written | Unblocks `/api/me/registrations` and the entire Pebble app (#757). Independent of 2–5, so it can run in parallel. | M |

### Phase 2 — data integrity in the admin and seating layer

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 7 | #930 — CSV formula injection | Standalone, small, and the volunteer export goes to an external insurer. No reason to defer. | S |
| 8 | #928 — update path bypasses product resolution | **Prerequisite for #933.** Splitting delivery updates from order changes is what makes a `guest_count` edit re-resolvable. | M |
| 9 | #926 — venue plan reads a dead column | Decide *before* #927, because the answer determines whether table occupancy has anywhere to be displayed. | S to delete, M–L to build the volunteer view |
| 10 | #927 — no seating capacity enforcement | Enforcement is independent, but surfacing occupancy in the editor depends on #926. | M |

### Phase 3 — operational workflows and admin communication

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 11 | #929 — SSE recovery fires one disconnect late | Small fix, and it must be right before #932 reworks the bus underneath it. | S |
| 12 | #931 — search silently truncates at 20 | Fix pagination before new announcement/history lists repeat the same silent-cap contract. | M |
| 13 | #933 — registration lifecycle gaps | Needs #928. Party-size editing is the most-requested sub-item and settles the registration detail surface before #943 adds another action. | M |
| 14 | #943 — individual member/registration `mailto:` actions | Add to the now-settled registration/member UI. It complements but never replaces #924's server confirmation delivery. | S–M |
| 15 | #945 — scheduled localised announcement banner | Operational communication belongs in this phase, not after all platform work. Reuse #929's recovery contract if live invalidation is added and #931's explicit pagination shape for admin history. | M–L |
| 16 | #935 — UI/UX consistency pass | Follow #945's stricter live-region and reduced-motion pattern rather than creating a parallel convention. Other polish remains independent and may run earlier in parallel. | M |
| 17 | #937 — no scanner, no offline check-in | Its #921 rate-limit prerequisite is complete. Settle one production service-worker ownership/update strategy with #941. Either issue may implement the common worker first, but they must not ship competing registrations or cache policies. | L |

### Phase 4 — compliance and platform foundations

Two of these need a decision before code, and are labelled `needs-discussion`.

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 18 | #934 — no retention or erasure mechanism | **Needs #923.** Decide and implement the retention schedule and rights workflow before publishing policy text through #944. | L |
| 19 | #944 — versioned Markdown policy publishing | Follow #934 directly so the migrated policy describes implemented behaviour. Use existing audit provenance and the proven row-lock pattern for atomic publication. | L |
| 20 | #932 — single-process state | Its #921 limiter prerequisite is complete; it follows #929 for the bus half. Its shared-state conclusions govern #941's rate limits and any live push invalidation; #947 separately owns durable job claiming. | L |
| 21 | #936 — public-site discoverability | The wrong-domain sitemap is an **S** fix worth pulling forward independently; per-locale metadata and prerendering are the **M** part. | S + M |
| 22 | #941 — Web Push/VAPID subscription foundation | Uses #947, follows #932's multi-worker decisions, and shares the service-worker contract settled with #937. Remains opt-in/test-delivery infrastructure only. | L |

### Phase 5 — central composer

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 23 | #942 — central announcement and push composer | **Blocked by #945, #941, and #947.** Scheduled work uses the durable outbox, immutable snapshots, atomic claims, and per-channel results. It adds no bulk e-mail channel. | L |

### Dependency map

```text
#923 contact form ────────────> #934 retention/erasure
                └────────────> #947 durable outbox ──> #924 confirmation e-mail
                                             ├───────> #941 Web Push foundation
                                             └───────> #942 central composer

#928 order resolution ────────> #933 registration lifecycle

#926 venue plan decision ─────> #927 capacity (occupancy display only)

#929 SSE recovery ────────────> #932 single-process (bus half)

#925 settings failure semantics ─────────────> #940 public contact settings

#934 retention/erasure decision ─────────────> #944 policy publishing

#937 offline/service worker <──── coordinate ────> #941 push/service worker

#935 accessible UI conventions <─ coordinate ────> #945 announcement banner

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
| #938 | Completed | 2026-08-29 | #938, PR #948 | Corrected the backend API and SMTP documentation, removed shipped event CRUD and CSV exports from the backlog, and replaced speculative implementation plans with the canonical audit link. |
| #921 | Completed | 2026-08-29 | #921, PR #948 | Split public-operation buckets, keyed QR check-in limits per registration with a high shared-IP backstop, and added same-IP event-day regression coverage. |
| #939 | Completed | 2026-08-29 | #939, PR #948 | Blocked cancelled registrations across QR, volunteer, and admin check-in paths; rotated cancellation tokens; and disabled cancelled entrance actions in the volunteer UI. |

## Findings index

Four issues carry `priority-high`; the rest are unlabelled for priority
deliberately, since the phase order above is a better signal than a flat label.

| Issue | Area | Kind |
| --- | --- | --- |
| #921 | backend, android (completed 2026-08-29) | bug — event-day blocker |
| #922 | backend, auth | bug — dead feature |
| #923 | backend, frontend | bug — silent data loss |
| #924 | backend, frontend | gap — core flow incomplete |
| #925 | frontend, backend | bug — availability |
| #926 | backend | bug — wrong data, dead column |
| #927 | backend | bug — missing enforcement |
| #928 | backend, mcp | bug — broken invariant |
| #929 | frontend | bug — stale state |
| #930 | backend | bug — export safety |
| #931 | backend, frontend | bug — silent truncation |
| #932 | backend | constraint — scaling |
| #933 | backend, frontend | gap — lifecycle |
| #934 | backend | gap — compliance |
| #935 | frontend | quality — UI/UX, a11y |
| #936 | frontend | gap — discoverability |
| #937 | frontend | gap — event-day resilience |
| #938 | docs (completed 2026-08-29) | accuracy |
| #939 | backend, frontend (completed 2026-08-29) | bug — oversell risk |

## Communications roadmap index

These issues are planned product work rather than findings against shipped
behaviour. They are tracked by #946 and appear in the combined phases above.

| Issue | Area | Kind | Primary prerequisite or coordination |
| --- | --- | --- | --- |
| #940 | backend, frontend, admin | public contact settings | Builds on #925 failure semantics; related to #923 |
| #943 | frontend, admin | individual email-client actions | Does not replace #924 |
| #945 | backend, frontend, admin, accessibility | scheduled announcements | Coordinates with #929, #931, and #935 |
| #944 | backend, frontend, admin, security | versioned policy publishing | Follows #934's policy decisions |
| #947 | backend, cross-cutting | durable outbox and worker | Follows #923's persistence shape; serves #924, #941, and #942 |
| #941 | backend, frontend, security | Web Push foundation | Uses #947; accounts for #932; coordinates with #937 |
| #942 | backend, frontend, admin | central composer | Blocked by #945, #941, and #947 |

## Cross-cutting feature and audit relationships

- **Public contact settings (#940)** and **#923 (contact form discards
  messages)** both concern the contact path. #940 moves the public-facing
  values into settings; #923 makes submissions actually arrive. #923 is the
  functional defect and should not wait on #940.
- **Versioned policy publishing (#944)** and **#934 (retention and erasure)**
  are two halves of the same compliance story. Publishing a policy version is
  of limited value while the commitments in its text — deletion, anonymisation,
  a working rights channel — have no implementation behind them. Worth deciding
  the retention schedule (#934, step 1) before authoring the policy version that
  describes it.
- **The announcement banner (#945)** and **#935 (UI/UX pass)** both add live
  regions. The banner's accessibility criteria are stricter and better specified
  than anything in #935; if #945 lands first, #935 should adopt its pattern
  rather than inventing a parallel one.
- **The shared outbox (#947)** is the bridge between the audit's individual
  delivery gaps (#923 and #924) and the roadmap's push/composer work (#941 and
  #942). It owns persistence, claiming, retry, and crash-recovery mechanics, but
  deliberately owns no audience or message-composition product surface.
- **Web Push (#941)** and **offline web check-in (#937)** both require a
  production service worker. They need one explicit ownership and update/cache
  strategy so two independently implemented workers do not overwrite or break
  each other.
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

- [ ] `GET /api/settings` exposes the public values without exposing secrets.
- [ ] `PUT /api/settings` remains admin-only and validates email, phone, and
      HTTPS social URLs.
- [ ] The Settings dashboard provides a small form with translated labels.
- [ ] Contact, maintenance, and policy pages consume the settings.
- [ ] Empty optional values hide the corresponding public action cleanly.
- [ ] Compiled defaults and the last good response cover rollout and API-error
      paths without incorrectly enabling maintenance mode; follow #925.
- [ ] Changes create audit entries.
- [ ] Backend, frontend, and public rendering tests are included.
- [ ] The non-retry-safe `PUT` decision is documented; the client does not
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

- [ ] The UI says **Open in email client**, never **Send**.
- [ ] Admins preview recipient, subject, and body before opening `mailto:`.
- [ ] Recipient, subject, and body are correctly encoded.
- [ ] Long messages offer copy-to-clipboard instead of an oversized URL.
- [ ] The order template uses only the selected registration.
- [ ] No backend write or false “sent” audit record is created.
- [ ] Bulk recipients and uploaded address lists are out of scope.
- [ ] Accessibility and sensitive-field exclusion are tested.

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
- The initial migration follows #934's retention and rights decisions and must
  not preserve promises the product still cannot fulfil.

Markdown safety and acceptance criteria:

- [ ] Support an explicit Markdown subset only.
- [ ] Disallow raw HTML and unsafe URL schemes.
- [ ] Sanitize rendered HTML with an allowlist and apply safe link attributes.
- [ ] Preview and public output use exactly the same renderer/sanitizer.
- [ ] Admins can create a draft from the current version and preview every
      locale.
- [ ] Locale publication requirements are explicit and enforced.
- [ ] Publish is atomic, audited, and concurrency-tested.
- [ ] The public page serves only the latest published version.
- [ ] Historical versions and publishing actors remain visible to admins.
- [ ] The compiled policy is migrated into an initial published version.
- [ ] Tests cover scripts, raw HTML, unsafe links, and malformed Markdown.
- [ ] Publish retry-safety is implemented and documented before automatic
      retry.

### #947 — durable outbox and scheduled-delivery worker

[GitHub issue](https://github.com/tjorim/champagnefestival/issues/947)

Provide a small database-backed delivery contract shared by contact
notifications (#923), registration confirmations (#924), administrator test
pushes (#941), and scheduled composer delivery (#942). This is infrastructure,
not a campaign or audience feature.

Acceptance criteria:

- [ ] Durable jobs have stable identity, type, schedule, state, attempts, and
      timestamps; payloads contain only necessary references or snapshots.
- [ ] Business state and enqueueing are atomic where the workflow requires it.
- [ ] Multiple workers claim work atomically; duplicate execution is prevented.
- [ ] Jobs survive restarts and abandoned claims recover safely.
- [ ] Retry classification, bounded backoff, terminal failure, and poison-job
      isolation are implemented and tested.
- [ ] Scheduling uses UTC database/server time.
- [ ] Delivery diagnostics and audit events distinguish queued work from actual
      outcomes without exposing credentials, tokens, endpoints, or secrets.
- [ ] Cleanup and retention coordinate with #934; shared rate limits account
      for #932.
- [ ] At least one individual transactional path adopts the foundation before
      broader delivery work.

### #941 — Web Push/VAPID subscription foundation

[GitHub issue](https://github.com/tjorim/champagnefestival/issues/941)

Build secure opt-in and delivery infrastructure before adding an administrator
broadcast button. There is currently no production notification service worker
or VAPID subscription lifecycle.

Decisions to record first:

- Anonymous, authenticated, or both kinds of subscribers.
- Account- versus device-scoped subscriptions.
- Notification categories and default preferences.
- Event-specific subscription support.
- Retention and expired-subscription cleanup.
- Browser/iOS support expectations and future Android boundary.
- Consent and privacy-policy wording.
- Shared service-worker ownership, cache, and update strategy with #937.

Acceptance criteria:

- [ ] A production service worker coexists safely with application updates and
      offline check-in work.
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

Blocked by #945, #941, and #947. Compose one operational message centrally and
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
  bookings cannot both pass the check. This is the pattern #927 should copy for
  tables.
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

Three findings propose changes that are judgement calls rather than clear fixes:

1. **#924** proposes exposing `check_in_token` in `RegistrationGuestOut` so a
   guest can retrieve their own QR. This widens what the guest endpoint returns
   and deserves a second opinion before implementation.
2. **#926** asks whether the volunteer floor-plan view should be built or the
   unconsumed endpoint deleted. Either is defensible; carrying untested,
   unconsumed surface is not.
3. **#934** needs a retention schedule decided per table before any code, and
   raises whether `national_register_number` should be stored outside the window
   in which the insurance export is produced.
