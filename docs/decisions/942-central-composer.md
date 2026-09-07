# Central composer for in-app announcements and Web Push

**Status:** Implemented (2026-09-07) — see "Implementation summary" below.
**Date:** 2026-09-07 (confirmed and implemented 2026-09-07)
**Issues:** [#942](https://github.com/tjorim/champagnefestival/issues/942)
(primary); [#945](https://github.com/tjorim/champagnefestival/issues/945)
(in-app announcements, reused as one delivery channel — complete);
[#941](https://github.com/tjorim/champagnefestival/issues/941) (Web Push
foundation, reused as the other delivery channel — complete); [#947](https://github.com/tjorim/champagnefestival/issues/947)
(durable outbox, reused for scheduling and push delivery — complete)

---

## Context

#942's prerequisites are all shipped. Its own issue body leaves three
architectural questions implicit rather than settled — this document proposes
answers, following the pattern of the other Phase 4/5 decision docs.

## Confirmed decisions (2026-09-07)

| Question | Confirmed decision | Rationale |
| --- | --- | --- |
| Data model for the in-app channel | **Reuse #945's `Announcement` model and `announcements_service`.** Selecting "announcement" as a channel creates/publishes a row through the existing service, not a new in-app storage/delivery mechanism | Keeps one audit trail, one publish-window semantic, one admin surface for the underlying primitive; #945's own admin page for simple banners stays as a separate, lighter entry point that doesn't go through the composer |
| When the Push audience snapshot is fixed | **Resolved fresh at actual send/schedule-fire time, not at compose time.** The audience shown during compose/preview is an estimate only | A message scheduled for next week must reach next week's subscriber list, not a stale snapshot from when it was drafted — matches "immutable send snapshot" in the issue, which only makes sense as *the* real snapshot if it's taken at the moment sending actually happens |
| Push delivery shape for a real audience | **One outbox job per targeted subscriber**, all sharing the composed message's `resource_id` so `OutboxJob`/`DeliveryAttempt` can be queried and aggregated per channel | Same shape #941 already uses for the single admin test-send, generalized to N recipients; per-subscriber retry/backoff/failure isolation for free, no new dispatch pattern |
| Audience targeting scope | **All opted-in push subscribers only, for this change.** No category/event-scoped targeting yet | No real subscriber has ever set a category or event today — `PushOptIn.tsx`'s subscribe flow always sends the hardcoded default (`categories: ["system_test"]`, `event_ids: []`). Event/category-scoped targeting is schema-supported (#941) but has zero real subscribers using it until the opt-in UI itself is extended — out of scope here, a follow-up |
| Severity/category taxonomy | **Reuse `Announcement.level`'s existing `info`/`warning`/`urgent`** | One taxonomy admins already know, shared across both channels, rather than inventing a push-specific set |

## Proposed defaults (not yet confirmed)

### Model

A new `ComposedMessage` table (name open to bikeshedding):

- `id`, translated `title_{nl,en,fr}`/`body_{nl,en,fr}` (short — push payload
  size is capped at 4096 bytes per #941, and the in-app channel already
  caps `Announcement.text_*` at 500 chars; propose reusing a similarly small
  cap here rather than a free-form body).
- `level` (`info`/`warning`/`urgent`, same check constraint as `Announcement`).
- `channels`: a small JSON array, values from `{"announcement", "push"}` —
  at least one required.
- `link_url` (optional, validated the same way `Announcement.link_url` is —
  see #945's existing validator).
- `state`: `draft` → `scheduled` → `sent` (terminal). "Publish now" is
  `scheduled` with `scheduled_at = now`, transitioning to `sent` on the next
  worker poll rather than a fourth state — no meaningful UI difference
  between "just scheduled for right now" and "sending."
- `scheduled_at` (nullable while `draft`).
- `announcement_id` (nullable FK, set once the announcement channel's row is
  created at send time).
- `push_audience_snapshot`: JSON array of `PushSubscription.id`s, null until
  send time, then immutable.
- `sent_at`, audit actor fields matching the rest of the schema
  (`created_at`/`updated_at`, `published_by`-style actor column set at send).

### Send is a natural-key idempotent state transition

Retrying an ambiguous "confirm send" must not double-enqueue N push jobs or
double-publish the announcement. Proposed: the transition `scheduled → sent`
happens once, under the message's own row lock, in the same transaction that
resolves the audience snapshot, creates/publishes the `Announcement` (if
selected), and enqueues the per-subscriber outbox jobs (each keyed
`composer-push:{message_id}:{subscription_id}` — naturally unique, so a
retried enqueue attempt against an already-`sent` message is rejected before
it reaches the loop, not de-duplicated job-by-job). A message already in
`sent` state returns its existing snapshot/results rather than erroring —
"natural resource key, convergent state only" in `docs/retry-safety.md`'s
existing vocabulary, the same category `POST /api/policies/{key}/draft/publish`
already uses.

### Scheduling

No new worker infrastructure: `POST .../schedule` calls `enqueue_job` with
`scheduled_at` set to the requested time and a job type (e.g.
`composer_message_send`) whose handler performs the transition above. #947's
existing lease/backoff/retry already covers the rest. "Publish now" is the
same call with `scheduled_at = datetime.now(UTC)`.

### Preview endpoint

`POST /api/composer/render` (admin-only, no persistence) returns the
rendered title/body for every locale × selected channel, matching #944's
`POST /api/policies/render` precedent for a stateless preview.

### Per-channel results

No new results table. `GET` on a sent message aggregates:
`announcement_id is not None` for the in-app channel's status, and a count
of `OutboxJob`/`DeliveryAttempt` rows filtered by
`resource_type="composer_message", resource_id=message.id` for push
(queued/delivered/retired/failed), mirroring how #941's admin test-send
results are already inspectable through the same tables — no secrets
(subscription endpoints/keys) are exposed, only aggregate counts.

### Safety cap

A configurable maximum audience size per send (proposed default: reuse the
same order of magnitude as other admin bulk operations in this codebase,
e.g. a few thousand) — refusing to enqueue an unbounded number of jobs from
a single confirm click is a reasonable guard regardless of how large the
subscriber base ever gets, distinct from the (not yet meaningfully
applicable) rate-limit criterion in the issue, which is about authorisation
and abuse, not a batch-size sanity check.

### Retry-safety

New entry in `docs/retry-safety.md` needed: schedule/send is "natural
resource key, convergent state only" (see above); the preview endpoint is a
pure read, no entry needed.

## Implementation summary (2026-09-07)

Shipped per the confirmed decisions and proposed defaults above:

- **Model**: `ComposedMessage` (`app/models.py`), migration in the
  accumulated `001_contact_messages.py`. `state` is `draft`/`scheduled`/`sent`
  (DB check constraint); "publish now" omits `scheduled_at` in the request.
  `schedule_send` assigns the current UTC time to both
  `ComposedMessage.scheduled_at` and the outbox job; delivery occurs on the
  next worker poll. It is not a fourth state, matching the proposal.
- **Draft lifecycle** (`app/services/composer_service.py`): create/update
  (only while `draft`), read with a live-computed `estimated_push_audience`
  and (once `sent`) aggregate `push_delivered_count`/`push_failed_count`/
  `push_pending_count` from `OutboxJob` — no secrets, counts only.
- **Send is one outbox-driven transition, run twice removed from the API
  call**: `POST /api/composer/{id}/schedule` locks the row, flips
  `draft -> scheduled`, and enqueues one `composer_message_dispatch` job at
  the requested time (or now) via #947's existing `scheduled_at` support —
  no new worker infrastructure. That job's handler
  (`app.composer_delivery.deliver_composer_message_dispatch`) is what
  actually resolves the audience (fresh, at this point — verified in tests
  by adding a subscriber *after* scheduling and confirming it's still
  included), creates/publishes the announcement channel via a new
  `announcements_service._create_uncommitted` (extracted from `create` so
  this transaction doesn't commit early), and enqueues one
  `composer_message_push` job per targeted subscriber
  (`app.composer_delivery.deliver_composer_push`, reusing #941's SSRF guard,
  redirect-disabled delivery, and 404/410 retirement exactly). A composite
  `resource_id` (`"{message_id}:{subscription_id}"`) lets one job type serve
  every message without a schema change.
- **Preview**: dropped from the original proposal — composer text is plain
  strings with no server-side transformation (unlike #944's Markdown, which
  genuinely needs a backend round trip to sanitize before preview), so the
  compose form's own live state *is* an accurate preview; a
  `POST /api/composer/render` endpoint would have added a network round trip
  for zero additional correctness.
- **Admin UI** (`ComposerManagement.tsx`, new "Composer" sidebar entry):
  compose form with a locale toggle, channel checkboxes, level select, an
  estimated-audience display, and a confirm-before-send step reusing
  `useConfirmDialog` (`ConfirmModal`, not `window.confirm` — #935's
  precedent) that states the exact channels and estimated audience before
  the irreversible send.
- **Rate limiting**: `schedule_send` uses the in-process `check_rate_limit`
  (10 requests/10 minutes per admin actor), the same narrower-scope
  treatment #932/#941 already give low-volume authenticated admin actions —
  satisfies the issue's "rate limits and admin authorisation are enforced"
  criterion alongside the router-wide `require_admin` dependency.
- **Tests**: 24 original backend test cases (`test_composer.py`) covering draft validation,
  the schedule/send idempotency guard, fresh-audience resolution, duplicate
  dispatch being a no-op, announcement creation, push delivery (success,
  locale fallback to Dutch, 404/410 retirement, retry-on-failure), and the
  result-count aggregation (including a regression guard for a `SQL LIKE`
  wildcard-escaping bug caught before merge — message ids contain
  underscores, which `.startswith()` handles correctly and a raw `.like()`
  pattern would not); 4 new frontend tests including an axe accessibility
  check, which caught and fixed two real issues also present in the
  pre-existing `AnnouncementManagement.tsx` form this one was modelled on
  (missing `Form.Group controlId`s, an empty `<th>` on the actions column) —
  fixed here, not backported to that unrelated file.
- **Not built**: recipient category/event targeting beyond "all subscribers"
  (confirmed out of scope — no real subscriber sets these yet, see the
  "Audience targeting scope" decision above) and any bulk email channel
  (explicitly out of scope for #942 itself).

## Review corrections (2026-09-07)

Create, merged draft updates, and scheduling require a complete title/body
locale pair. Push payloads are checked with the same JSON serializer used
for delivery before they can be scheduled. Fallback selects a complete pair,
preferentially Dutch, then English or French. The admin form blocks repeat
submissions while saving and displays scheduling errors without auto-retry.
Regression coverage adds 10 backend cases and 2 frontend tests.

## References

- [#941](https://github.com/tjorim/champagnefestival/issues/941) /
  `docs/decisions/941-web-push-foundation.md` — Web Push foundation and its
  outbox-based admin test-send, the pattern this generalizes
- [#945](https://github.com/tjorim/champagnefestival/issues/945) — in-app
  announcements, reused as the announcement channel's underlying storage
- [#947](https://github.com/tjorim/champagnefestival/issues/947) — durable
  outbox, already supporting `scheduled_at` — no new worker infrastructure
  needed
- [#944](https://github.com/tjorim/champagnefestival/issues/944) — versioned
  policy publishing, precedent for both the render-preview endpoint and the
  "natural resource key, convergent state only" publish retry-safety category
