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

## Decision 2 — a correction is a direct write, checksum-validated like registration

**Chosen: `POST /api/me/volunteer/eid-correction` writes
`Person.eid_document_number` directly, after the same modulo-97 checksum
check `register_volunteer_identity` already runs on the initial NISS/eID
submission.**

This supersedes an earlier version of this decision that made a correction
admin-reviewed instead: it inserted a `ContactMessage` describing the
requested change and enqueued the existing outbox contact-notification job
(mirroring `app.routers.me.request_registration_change`'s booking
change/cancellation-request pattern), leaving an admin to apply the change
themselves through `PUT /api/volunteers/{id}`. The reasoning at the time was
that `eid_document_number` backs an insurance claim referencing a specific
physical document, so a volunteer's own unverified assertion that "my card
was renewed" shouldn't silently become the record of truth.

On reflection that drew a line in the wrong place: Decision 1 already trusts
the volunteer's own input for the *initial* NISS/eID, checksum-validated and
nothing else — there is no admin review, no proof-of-identity step beyond
"the identity provider vouches this OIDC account is a volunteer." A
correction to an already-linked record isn't a *weaker* claim than that; if
anything it's stronger, since the account is already known to belong to this
specific `Person`. Treating a correction as needing a human reviewer while
registration doesn't was an inconsistency, not an extra safeguard — the
checksum catches the same class of typo either way, and there's no more of
an identity-proof gap on a correction than there was on the original claim.

The admin-review machinery (the `ContactMessage`/outbox pattern, the
per-subject Postgres rate limiter that existed specifically to bound
notification volume) is removed along with it — a direct write to one's own
already-linked record needs no rate limit of its own, the same way
registration never had one. The audit entry (`volunteer_eid_updated`)
records that the value changed, but not the raw eID digits themselves —
consistent with `volunteer_updated`'s and `volunteer_identity_registered`'s
existing fields-changed-only convention.

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
  record. A volunteer can now update it themselves at any time, but nothing
  proactively prompts them to.
- MCP admin tooling gained `oidc_subject` on `update_volunteer` for parity
  with the REST admin surface, but the self-service endpoints themselves have
  no MCP equivalent — same as every other `/api/me/*` endpoint, which are
  browser-session surfaces, not admin automation.

## Implemented (2026-09-11, eID correction reworked 2026-09-12)

1. `Person.oidc_subject` (nullable, unique) — originally migration `002`,
   later squashed into `001` since neither had shipped in a release yet.
2. `app.services.identity_checksum`: `validate_niss_checksum`,
   `validate_eid_checksum` (mod 97; the NISS variant retries with
   `+2_000_000_000` for post-2000 birth dates).
3. `app.services.volunteer_self_service`: `get_linked_volunteer`,
   `register_volunteer_identity` (self-registration, absorbing an unlinked
   pre-existing exact match), `update_eid_document_number` (direct,
   checksum-validated write — see Decision 2).
4. `POST /api/me/volunteer/register`, `GET /api/me/volunteer`,
   `POST /api/me/volunteer/eid-correction` — router
   `app.routers.volunteer_self`.
5. Admin `VolunteerUpdate.oidc_subject` (REST and MCP `update_volunteer`,
   the latter also gaining an explicit `clear_oidc_subject` flag since MCP
   drops omitted-vs-null distinction), surfaced on `VolunteerOut`.
6. `docs/retry-safety.md` entry for the registration write; the
   eID-correction write is convergent by the same reasoning and needs no
   separate entry.
7. Frontend: the NISS/eID self-service section is a "Volunteer eID" tab on
   the unified `/me` self-service page (`MyAccountPage`, direct-link-only),
   shown only when the signed-in OIDC account carries the `volunteer` realm
   role — no separate `/my-eid` route, since the only thing distinguishing it
   from the rest of `/me` was that role check. `/me` itself was later
   extended further to also absorb `/my-registrations`; see
   [`unified-self-service-page.md`](./unified-self-service-page.md) for that
   follow-up decision. Both registration and correction collect the eID with
   client-side checksum validation for instant feedback
   (`frontend/src/utils/belgianIdentityNumbers.ts`) and format it for display
   (`595-6570208-28`) while storing it digits-only, matching the existing
   `normalise_optional_identity` convention.

Removed in the 2026-09-12 rework, since they existed specifically to
support the admin-reviewed design Decision 2 superseded: the
`ContactMessage`/outbox-notification path for corrections,
`app.ratelimit.check_volunteer_eid_correction_rate_limit`, and the
client-generated `submission_id`/409-on-mismatch replay handling.

## References

- [Data retention and erasure](./934-data-retention-and-erasure.md)
- [Visitor passwordless session](./953-visitor-passwordless-session.md) — the
  closest existing precedent for self-service identity, and the origin of
  the `oidc_subject` naming this reuses
- [Unified self-service page](./unified-self-service-page.md) — the follow-up
  that merged `/me`, `/my-eid`, and `/my-registrations` into one page
- [Retry-safety inventory](../retry-safety.md)
