# Volunteer identity self-service

**Status:** Implemented (2026-09-11).
**Date:** 2026-09-11
**Issues:** [#1006](https://github.com/tjorim/champagnefestival/issues/1006)
(primary); [#934](https://github.com/tjorim/champagnefestival/issues/934)
(data retention — the NISS/eID access restrictions this builds on)

---

## Context

Issue #1006 identified two gaps: `Person.eid_document_number` goes stale on eID
card renewal with nothing to notice or correct it, and volunteers have no
way to view or correct their own NISS/eID — only an admin editing the
record on their behalf can. The issue deliberately stopped short of a
design, flagging three open questions instead: how to link an authenticated
OIDC volunteer identity to a `Person` row (a link that doesn't exist in any
form today), whether a correction should be a direct write or
admin-reviewed, and whether this needs its own auth scope or can sit behind
the existing `require_volunteer` dependency.

## Decision 1 — self-registration with checksum-validated identifiers, not matching against a pre-entered record

**Chosen: `Person.oidc_subject` (nullable, unique, mirrors `User.oidc_subject`'s
existing naming from #953), set via `POST /api/me/volunteer/register` where
the volunteer submits their own name, NISS, and eID document number and this
*creates their own `Person` row* (role `volunteer`) — there is no
pre-existing admin-entered record to match against.**

This supersedes an earlier version of this decision (see git history) that
had the volunteer submit only their NISS to claim a *pre-existing*,
admin-entered `Person` row. That design required an admin to have already
bulk-created the record (name, NISS, eID, help periods) before the volunteer
could ever self-serve — real work duplicated between admin and volunteer —
and, because matching accepted any syntactically-plausible NISS, a session
that merely *knew* another volunteer's NISS could claim their record. #1037's
review flagged that gap (CWE-639, IDOR) and the fix considered at the time
(admin approval or a verified-channel one-time code for every claim) was
rejected as reintroducing the exact admin friction self-service was meant to
remove.

The actual precondition for self-service was never "does a matching record
exist" — it's "has an admin granted this OIDC account the `volunteer` realm
role," which `require_volunteer` already checks on every request to this
router. Once that's true, there is nothing left to verify by matching: the
volunteer can simply provide their own identity data directly, the same way
any other self-reported form field is trusted. What closes the IDOR gap
instead of just mitigating it is validating that data locally rather than
searching for it:

- **Both the NISS and the eID document number are self-checking modulo-97
  numbers** (`app.services.identity_checksum`). A submission that doesn't
  pass its checksum is rejected (422) before anything is written — this
  catches typos the same way matching used to, without needing a database
  lookup to do it, and confirms the volunteer's submission is *a* valid
  identity number even though it can't confirm whose.
- There is no "brute-force someone else's NISS" attack surface anymore: an
  attacker who doesn't already know a real, checksum-valid NISS/eID pair
  gains nothing by trying (they'd just be registering an unrelated but
  syntactically valid number, which is indistinguishable from a legitimate
  new volunteer to the system), and an attacker who *does* already know a
  real pair already had that PII independent of this feature. The
  rate-limiter and admin-notification-on-claim mitigations from the earlier
  design existed specifically to blunt a guessing attack that this design no
  longer has, so both were removed rather than kept as unnecessary
  complexity.
- **A pre-existing admin-imported record is still respected, not
  duplicated:** if a `Person` with the exact submitted NISS *and* eID
  already exists (e.g. an admin bulk-imported historical volunteers before
  this feature existed) and isn't linked to anyone yet, registration links
  to it instead of creating a second row — preserving its help-period
  history. A *partial* match (one field matching a different, unrelated
  person) or a match already linked to someone else 409s rather than
  guessing which record is "right."

**Also kept: an admin override.** `VolunteerUpdate.oidc_subject` still lets
an admin hand-link a volunteer who can't or won't complete self-registration
(e.g. an edge-case identity number this checksum can't handle) or clear a
mistaken link (explicit `null`) — covering #1006's "admin-assigned link"
alternative for the cases self-registration can't reach.

## Decision 2 — a correction is admin-reviewed, not a direct write

**Chosen: `POST /api/me/volunteer/eid-correction` never writes
`Person.eid_document_number`. It inserts a `ContactMessage` describing the
requested change (current value, requested value, an optional note) and
enqueues the existing outbox contact-notification job, exactly mirroring
`app.routers.me.request_registration_change`'s booking
change/cancellation-request pattern. An admin reviews it in the existing
contact inbox and applies the change themselves through
`PUT /api/volunteers/{id}`.**

Issue #1006 called this out explicitly: `eid_document_number` backs an insurance
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

- No bulk/admin-facing "linking dashboard" — an admin resolves a stuck
  registration (an edge-case identity number, a partial-match conflict) by
  editing the volunteer record directly, same as any other admin correction.
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
2. `app.services.identity_checksum`: `validate_niss_checksum`,
   `validate_eid_checksum` (mod 97; the NISS variant retries with
   `+2_000_000_000` for post-2000 birth dates).
3. `app.services.volunteer_self_service`: `get_linked_volunteer`,
   `register_volunteer_identity` (self-registration, absorbing an unlinked
   pre-existing exact match), `submit_eid_correction_request`.
4. `POST /api/me/volunteer/register`, `GET /api/me/volunteer`,
   `POST /api/me/volunteer/eid-correction` — router
   `app.routers.volunteer_self`.
5. `app.ratelimit.check_volunteer_eid_correction_rate_limit` — a
   client-generated `submission_id` only dedupes a replay of the same id,
   not repeated new ones. (The identity-claim rate limiter and the
   admin-notification-on-claim from the superseded matching-based design
   were removed — see Decision 1 — since they mitigated a guessing attack
   that no longer applies.)
6. Admin `VolunteerUpdate.oidc_subject` (REST and MCP `update_volunteer`,
   the latter also gaining an explicit `clear_oidc_subject` flag since MCP
   drops omitted-vs-null distinction), surfaced on `VolunteerOut`.
7. `docs/retry-safety.md` entries for the registration and
   correction-request writes and their outbox enqueue.
8. Frontend: the NISS/eID self-service section lives on the existing `/me`
   self-service page (`MyAccountPage`, direct-link-only), shown only when the
   signed-in OIDC account carries the `volunteer` realm role — no separate
   `/my-eid` route, since the only thing distinguishing it from the rest of
   `/me` was that role check. Collects name, NISS, and eID with client-side
   checksum validation for instant feedback
   (`frontend/src/utils/belgianIdentityNumbers.ts`) and formats both for
   display (`95.12.14-237.64`, `595-6570208-28`) while storing them
   digits-only, matching the existing `normalise_optional_identity`
   convention.
9. A 409 instead of a silently dropped update when an eID-correction
   `submission_id` is reused with a different payload;
   `volunteer_client_as`'s dependency overrides clear in a `finally` block
   so a raising test can't leak state into the next one.

## References

- [Data retention and erasure](./934-data-retention-and-erasure.md)
- [Visitor passwordless session](./953-visitor-passwordless-session.md) — the
  closest existing precedent for self-service identity, and the origin of
  the `oidc_subject` naming this reuses
- [Retry-safety inventory](../retry-safety.md)
