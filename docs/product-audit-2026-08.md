# Product audit — August 2026

A full-stack review of the backend, frontend, Android surface, and public site,
carried out against `f392ab9` (`main`, version `2026.8.2`). Every finding is
filed as a GitHub issue; this document records the sequencing rationale and the
scope of what was examined, which does not fit in individual issues.

Unlike `todo-communications-and-policies.md`, which plans features that do not
exist yet, this document is about the behaviour of code that already ships.

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

Effort markers are rough: **S** ≈ under a day, **M** ≈ a few days, **L** ≈ a
week or more, or requiring a decision first.

### Phase 0 — before the next event

Everything here fails on the day, in front of guests, with no workaround.

| Order | Issue | Why first | Effort |
| --- | --- | --- | --- |
| 1 | #938 — stale `backend/README` | Ten-minute fix that must come first because it misinforms whoever picks up the rest. It currently tells a contributor that event CRUD and CSV export are unimplemented; both shipped long ago. | S |
| 2 | #921 — check-in rate limit locks out the door | Total operational failure after roughly three guests. Small, well-understood change. Also a prerequisite for #937. | S |
| 3 | #939 — cancelled bookings still check in | Cancellation releases event capacity, so the seat is resold while the original QR still opens the door. Straightforward oversell at the entrance. | S |
| 4 | #925 — maintenance page hijacks the public site | A single failed `/api/settings` poll flips an open tab to the placeholder. Cheap to bound correctly. | S |

Phase 0 is deliberately all-**S**. It is the shortest path to a system that
survives an event day.

### Phase 1 — close the booking loop

The public booking flow currently ends with a success message and nothing else.
This phase is the largest product gain in the audit.

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 5 | #923 — contact form discards every message | Do before #924: it establishes the persist-then-deliver pattern the confirmation e-mail should reuse, and it unblocks #934. | M |
| 6 | #924 — no confirmation e-mail, QR only in the admin UI | The single biggest gap. Reuses #923's outbox decisions rather than inventing a second one. | M–L |
| 7 | #922 — `Registration.user_id` never written | Unblocks `/api/me/registrations` and the entire Pebble app (#757). Independent of 5–6, so it can run in parallel. | M |

### Phase 2 — data integrity in the admin and seating layer

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 8 | #930 — CSV formula injection | Standalone, small, and the volunteer export goes to an external insurer. No reason to defer. | S |
| 9 | #928 — update path bypasses product resolution | **Prerequisite for #933.** Splitting delivery updates from order changes is what makes a `guest_count` edit re-resolvable. | M |
| 10 | #926 — venue plan reads a dead column | Decide *before* #927, because the answer determines whether table occupancy has anywhere to be displayed. | S to delete, M–L to build the volunteer view |
| 11 | #927 — no seating capacity enforcement | Enforcement is independent, but surfacing occupancy in the editor depends on #926. | M |

### Phase 3 — operational quality

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 12 | #929 — SSE recovery fires one disconnect late | Small fix, and it must be right before #932 reworks the bus underneath it. | S |
| 13 | #931 — search silently truncates at 20 | Organisers currently conclude a booking does not exist. | M |
| 14 | #933 — registration lifecycle gaps | Needs #928. Party-size editing is the most-requested of the three sub-items. | M |
| 15 | #937 — no scanner, no offline check-in | **Needs #921.** An offline queue replaying a batch of check-ins would trip the current 5-per-10-minutes limiter immediately, so building this first would produce a feature that fails on its first sync. | L |

### Phase 4 — platform and compliance

Two of these need a decision before code, and are labelled `needs-discussion`.

| Order | Issue | Notes | Effort |
| --- | --- | --- | --- |
| 16 | #934 — no retention or erasure mechanism | **Needs #923**, because the contact form is the only channel the privacy policy names for exercising data rights. Retention schedule is a policy decision first, code second. | L |
| 17 | #932 — single-process state | Overlaps #921, which re-keys the limiter anyway; doing #921 first makes the limiter half of this cheaper. The unbounded bucket leak inside it can be fixed immediately and separately. | L |
| 18 | #936 — public-site discoverability | The wrong-domain sitemap is an **S** fix worth pulling forward on its own; per-locale metadata and prerendering are the **M** part. | S + M |
| 19 | #935 — UI/UX consistency pass | Genuine polish, no dependencies, good parallel work for a contributor not holding a larger thread. | M |

### Dependency map

```text
#938 docs ─── (do first: misleads all downstream work)

#921 rate limit ──────────────> #937 offline check-in
                └────────────> #932 single-process (limiter half)

#923 contact form ────────────> #934 retention/erasure
                └────────────> #924 confirmation e-mail (pattern reuse)

#928 order resolution ────────> #933 registration lifecycle

#926 venue plan decision ─────> #927 capacity (occupancy display only)

#929 SSE recovery ────────────> #932 single-process (bus half)
```

Everything not shown is independent and can be picked up in any order.

## Findings index

Four issues carry `priority-high`; the rest are unlabelled for priority
deliberately, since the phase order above is a better signal than a flat label.

| Issue | Area | Kind |
| --- | --- | --- |
| #921 | backend, android | bug — event-day blocker |
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
| #938 | docs | accuracy |
| #939 | backend, frontend | bug — oversell risk |

## Relationship to the communications roadmap

`todo-communications-and-policies.md` and this document touch in three places.
Neither supersedes the other, but the sequencing interacts:

- **TODO 1 (public contact settings)** and **#923 (contact form discards
  messages)** both concern the contact path. TODO 1 moves the public-facing
  values into settings; #923 makes submissions actually arrive. #923 is the
  functional defect and should not wait on TODO 1.
- **TODO 4 (versioned policy publishing)** and **#934 (retention and erasure)**
  are two halves of the same compliance story. Publishing a policy version is
  of limited value while the commitments in its text — deletion, anonymisation,
  a working rights channel — have no implementation behind them. Worth deciding
  the retention schedule (#934, step 1) before authoring the policy version that
  describes it.
- **TODO 2 (announcement banner)** and **#935 (UI/UX pass)** both add live
  regions. The banner's accessibility criteria are stricter and better specified
  than anything in #935; if TODO 2 lands first, #935 should adopt its pattern
  rather than inventing a parallel one.

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
