# Volunteer identity self-service

**Status:** Implemented (2026-09-11).
**Date:** 2026-09-11
**Issues:** [#1006](https://github.com/tjorim/champagnefestival/issues/1006)
(primary); [#934](https://github.com/tjorim/champagnefestival/issues/934)
(data retention — the NISS/eID access restrictions this builds on)

---

## Context

#1006 identified two gaps: `Person.eid_document_number` goes stale on eID
card renewal with nothing to notice or correct it, and volunteers have no
way to view or correct their own NISS/eID — only an admin editing the
record on their behalf can. The issue deliberately stopped short of a
design, flagging three open questions instead: how to link an authenticated
OIDC volunteer identity to a `Person` row (a link that doesn't exist in any
form today), whether a correction should be a direct write or
admin-reviewed, and whether this needs its own auth scope or can sit behind
the existing `require_volunteer` dependency.

## Decision 1 — link by volunteer-submitted NISS, not by OIDC subject/email at first login

**Chosen: `Person.oidc_subject` (nullable, unique, mirrors `User.oidc_subject`'s
existing naming from #953), set via `POST /api/me/volunteer/claim` where the
volunteer submits their own NISS and it's matched against an *unlinked*
`Person` with the `volunteer` role.**

#1006's own proposed scope suggested "matching on the OIDC subject/email at
first login, or an admin-assigned link." Email doesn't work as the matching
key here: `VolunteerCreate`/`VolunteerUpdate` (the dedicated
`POST /api/volunteers` admin flow) have no `email` field at all — a
volunteer's `Person.email` is `""` unless they happened to be created
through the generic `/api/people` endpoint instead. Matching on OIDC subject
alone is circular (the subject is exactly what's being linked). NISS is the
one identifier a volunteer already has and already gave the festival at
sign-up, so a self-claim endpoint where the volunteer submits it is the only
reliable match key that doesn't depend on optional data.

The claim is a plain `UPDATE ... WHERE national_register_number = :nrr AND
roles_contains('volunteer') AND oidc_subject IS NULL`: convergent (a retry
with the same NISS from the same already-linked subject just confirms the
existing link) and race-safe (only one of two concurrent claims for the same
NISS can win; the loser gets 404, as if it had never matched, rather than
silently overwriting the winner's link). Rate-limited per subject
(`app.ratelimit.check_volunteer_identity_claim_rate_limit`, 5/10 min) since
an authenticated volunteer session could otherwise use unlimited guesses to
brute-force someone else's NISS against unlinked records — the same
posture as the check-in/push-subscription Postgres-backed limiters, not a
public unauthenticated surface.

**Also added: an admin override.** `VolunteerUpdate.oidc_subject` lets an
admin hand-link a volunteer who can't self-claim (e.g. no NISS on file yet)
or clear a mistaken link (explicit `null`), covering #1006's "or an
admin-assigned link" alternative for the cases self-claim can't reach.

## Decision 2 — a correction is admin-reviewed, not a direct write

**Chosen: `POST /api/me/volunteer/eid-correction` never writes
`Person.eid_document_number`. It inserts a `ContactMessage` describing the
requested change (current value, requested value, an optional note) and
enqueues the existing outbox contact-notification job, exactly mirroring
`app.routers.me.request_registration_change`'s booking
change/cancellation-request pattern. An admin reviews it in the existing
contact inbox and applies the change themselves through
`PUT /api/volunteers/{id}`.**

#1006 called this out explicitly: `eid_document_number` backs an insurance
claim referencing a specific physical document, so a volunteer's own
unverified assertion that "my card was renewed" shouldn't silently become
the record of truth. Reusing the booking-change-request mechanism (rather
than a new approval-state table) means no new admin UI or workflow had to be
built — the correction shows up wherever contact messages already do,
idempotent via the same client-generated `submission_id` /
`ON CONFLICT DO NOTHING` shape. The audit entry
(`volunteer_eid_correction_requested`) records that a correction was
requested and whether the value actually differs, but not the raw eID
digits themselves — consistent with `volunteer_updated`'s existing
fields-changed-only convention; the actual values live only in the
`ContactMessage` the admin reviews.

## Decision 3 — stays behind the existing `require_volunteer` dependency

**Chosen: no new auth scope.** `require_volunteer` already proves "this
token may act as a volunteer"; the new `oidc_subject` link separately
answers "which `Person` does this token belong to." The two concerns don't
need different gates — every `/api/me/volunteer/*` endpoint requires
`require_volunteer` and then resolves (or fails to resolve) the caller's own
linked record. There's no elevated capability here beyond what
`require_volunteer` already grants for event-day operational access, so a
narrower scope would add complexity without a matching security need.

## What this does not do

- No bulk/admin-facing "linking dashboard" — an admin resolves a stuck claim
  (no NISS on file, ambiguous data) by editing the volunteer record directly,
  same as any other admin correction.
- No re-verification prompt or expiry on `eid_document_number` — it remains,
  as `934-data-retention-and-erasure.md` already stated, a point-in-time
  record. This only adds a way for a volunteer to *flag* that it's gone
  stale; it doesn't make the system proactively notice.
- MCP admin tooling gained `oidc_subject` on `update_volunteer` for parity
  with the REST admin surface, but the self-service endpoints themselves have
  no MCP equivalent — same as every other `/api/me/*` endpoint, which are
  browser-session surfaces, not admin automation.

## Implemented (2026-09-11)

1. `Person.oidc_subject` (nullable, unique) — migration `002`.
2. `app.services.volunteer_self_service`: `get_linked_volunteer`,
   `claim_volunteer_identity`, `submit_eid_correction_request`.
3. `POST /api/me/volunteer/claim`, `GET /api/me/volunteer`,
   `POST /api/me/volunteer/eid-correction` — new router
   `app.routers.volunteer_self`.
4. `app.ratelimit.check_volunteer_identity_claim_rate_limit`.
5. Admin `VolunteerUpdate.oidc_subject` (REST and MCP `update_volunteer`),
   surfaced on `VolunteerOut`.
6. `docs/retry-safety.md` entries for the claim and correction-request
   writes and their outbox enqueue.
7. Frontend: `/my-eid` self-service page (direct-link-only, same pattern as
   `/me`), reachable only by a volunteer signed in via OIDC.

## References

- [Data retention and erasure](./934-data-retention-and-erasure.md)
- [Visitor passwordless session](./953-visitor-passwordless-session.md) — the
  closest existing precedent for self-service identity, and the origin of
  the `oidc_subject` naming this reuses
- [Retry-safety inventory](../retry-safety.md)
