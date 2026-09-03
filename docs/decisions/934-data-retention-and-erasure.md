# Data retention schedule and anonymisation mechanism

**Status:** Retention schedule and mechanism design proposed, pending owner
confirmation before implementation starts. One question is already settled:
operational registration data (guest counts, orders, dates, tables) is
retained indefinitely for historical/analytical use and is never deleted or
anonymised away — see "Proposed retention schedule" below.
**Date:** 2026-09-03 (updated same day — indefinite retention of operational
registration data confirmed)
**Issues:** [#934](https://github.com/tjorim/champagnefestival/issues/934)
(primary, `needs-discussion`); [#923](https://github.com/tjorim/champagnefestival/issues/923)
(contact form — complete, so the rights channel this document assumes now
exists); [#944](https://github.com/tjorim/champagnefestival/issues/944)
(versioned policy publishing — blocked on this document)

---

## Context

The published privacy policy makes two commitments nothing in the codebase
implements:

> "retained operational records are deleted or anonymised when they are no
> longer needed" — `privacy_data_retention_content`

> "You may ask us to access, correct, or delete the personal information we
> hold about you at any time by contacting us" — `privacy_rights_content`

Every row written today is kept forever: `audit_entries`, `people`,
`registrations`, `idempotency_keys`, and `reservation_access_tokens` have no
scheduled sweep. `DELETE /api/me` only unlinks the portal account by design
(its docstring explains why) and `delete_person`/`delete_member` cascade-delete
a person and their registrations wholesale — neither is the middle option the
policy actually describes: anonymise the person, keep the operational record.

The issue explicitly asks for a decision before code ("This needs a decision
before code, hence `needs-discussion`"). This document proposes that decision,
following the same pattern as
[`932-multi-worker-state.md`](./932-multi-worker-state.md) and
[`941-web-push-foundation.md`](./941-web-push-foundation.md): concrete
defaults, flagged for confirmation rather than treated as settled, because
retention windows and what counts as "no longer needed" are legal/policy
judgment calls this document should not make unilaterally.

## Proposed retention schedule

| Table / field | Contents | Proposed window | Counted from | Legal basis |
| --- | --- | --- | --- | --- |
| `idempotency_keys` | `actor`, request hash, full response body | 72 hours (already the documented replay window) | `created_at` | Legitimate interest — retry-safety only; no reason to outlive the window callers are told to rely on |
| `reservation_access_tokens` | e-mail + token hash | Deleted at `expires_at` (currently ~30 min TTL) via a real sweep, not only the opportunistic delete on next request | `expires_at` | Legitimate interest — the token has no purpose once expired or used |
| `audit_entries.actor` when it holds an IP (token-gated check-in) | client IP | Blanked 30 days after `timestamp`; the entry itself (action, resource, timestamp) is kept | `timestamp` | Legitimate interest — abuse investigation for the days after an incident, not indefinitely; the entry's non-IP content still serves the accountability purpose audit logging exists for |
| `audit_entries` (all other rows) | actor (OIDC sub or `"anonymous"`), subject, action, details | Kept indefinitely, tied to the (now indefinitely retained) operational records they audit; no sweep proposed | — | Same basis as the underlying operational record it audits. Not a PII concern: `write_audit_entry` calls in `people_service`/`registrations_service` store field *names* changed or role lists in `details`, not the personal values themselves, and `actor` for staff-performed actions is the OIDC sub, not the customer — so keeping these forever doesn't extend how long a customer's own personal data is legible from an audit row. |
| `registrations` — guest counts, orders, accessibility notes, check-in times, table/event links | **Retained indefinitely, never deleted or anonymised.** This is the historical/analytical record (edition-over-edition attendance and order growth) the project owner has confirmed must survive independent of what happens to the person behind it. | No window | — | Legitimate interest — aggregate/attributed-to-a-pseudonym operational history has clear ongoing business value (trend analysis) and, once its `person_id` points to an anonymised row (see next), it no longer carries personal data itself |
| `people` — identity fields only: `name`, `email`, `phone`, `address`, `notes`, `national_register_number`, `eid_document_number` | The person behind one or more registrations | Anonymise (see below) 3 years after the person's **most recent** registration's event date, unless a shorter statutory period applies | `MAX(events.date)` across all of the person's registrations (a repeat visitor's clock resets on each new registration — anonymising them while they still have a recent registration would need re-identifying them for the next edition) | Storage-limitation principle: once nobody has contacted this person for 3 years, keeping name/e-mail/phone on file has no remaining operational purpose. **This number is the one figure in this table most in need of the owner's own review** — it is a business-retention judgment, not derived from a specific statute this document has checked. `roles`, `visits_per_month`, `club_name`, and `active` are not identity fields and are unaffected — see the mechanism below. |
| `people.national_register_number`, `people.eid_document_number` | Belgian NISS, eID document number | See "NISS segregation" below — proposed separately, not folded into the general 3-year window | Collected for the volunteer insurance export | Legal obligation (insurance coverage requires identifying the volunteer) |

Rows not listed (e.g. `contact_messages`, `outbox_jobs`) already have their
own documented retention: `outbox_jobs` terminal rows are cleaned daily at 90
days (`docs/outbox-worker.md`); `contact_messages` is out of this document's
scope.

## Proposed mechanism: anonymise rather than delete

Add `people_service.anonymise_person(db, person, *, actor, request_id=None)`:

- Overwrite `name` with a stable pseudonym (`f"Guest #{person.id[-6:]}"` or
  similar — stable so repeated anonymisation of an already-anonymised row is
  a no-op, not a second rewrite).
- Blank `email`, `phone`, `address`, `national_register_number`,
  `eid_document_number`, `notes`.
- Clear `search_name`, `search_name_alt`, `search_email` (trigger-maintained;
  clearing the source columns lets the existing trigger recompute them to
  empty rather than writing to them directly).
- Set `active = False`.
- Write an audit entry (`action="person_anonymised"`) — the row disappearing
  from search/exports is itself an event worth auditing, same as
  `person_deleted`.
- **Do not** touch `registrations`, `roles`, `visits_per_month`, or
  `club_name` — those are the operational, historical/analytical record the
  policy says is kept on purpose, and which the project owner has confirmed
  must never be deleted or anonymised away (edition-over-edition growth
  reporting depends on every past registration staying queryable, indefinitely,
  by event/edition/date/table/guest-count — none of that is personal data
  once the `Person` it points to is anonymised). `Registration.person_id`
  stays `ondelete="RESTRICT"`; anonymising in place is exactly what avoids
  needing to relax that constraint or delete a single registration row.

This is additive to `delete_person`/`delete_member`, which keep their current
cascade-delete behaviour for cases where the operational history genuinely
should not survive (e.g. a duplicate created by mistake, already covered by
`merge_people` for the common case). Anonymisation is the new, additional
option for "the retention window has passed, keep the attendance record, blank
the person."

## Proposed scheduled sweeps

Extend the existing worker loop (`backend/app/worker.py`), which already runs
one time-boxed daily task (`cleanup_completed_jobs` for `outbox_jobs`), with
the same `next_cleanup` pattern rather than introducing new scheduling
infrastructure:

1. `idempotency_keys` older than `IDEMPOTENCY_REPLAY_WINDOW` (72h) — this is
   the sweep `idempotency.py`'s own docstring already claims exists
   ("Production infrastructure removes older `idempotency_keys` rows
   daily") but doesn't; this closes that gap and makes the docstring true.
2. `reservation_access_tokens` where `expires_at < now()` — today this only
   happens opportunistically inside `request_registration_access` right
   before inserting a new token for the *same* email
   (`registrations.py`, `delete(ReservationAccessToken).where(expires_at < now)`
   scoped to that one write path); a real sweep catches every expired token,
   not only ones whose email happens to request a new link.
3. `audit_entries.actor` blanked to `""` where it currently holds an IP
   (distinguishable via `auth_source` for the token-gated check-in path,
   or a fixed prefix, chosen at implementation time) and `timestamp` is
   older than 30 days.
4. Person anonymisation (identity fields only — never `registrations`, see
   above) is **not** proposed as part of this automated sweep. Unlike the
   three rows above, "3 years since a person's last registration" is a
   low-frequency, high-consequence operation on personal data; running it as
   an admin-triggered action (surfacing which people are due, computed from
   `MAX(events.date)` per person) is safer than a fully automatic run, at
   least for the first implementation.

Each new sweep gets its own retry-safety entry in `docs/retry-safety.md` per
`AGENTS.md`, at implementation time — these are convergent deletes/blanks
(repeating a sweep that finds nothing to do is a no-op), consistent with the
"Deletes... natural resource key, convergent state only" entry already in that
inventory.

## Proposed IP handling

The issue's two options (truncate/hash at write time, or blank on a timer)
are not actually independent — item 3's audit sweep above already blanks the
IP after 30 days. Adding write-time hashing on top would mean maintaining a
rotating-salt scheme for a value that gets deleted a month later anyway. This
document proposes **only** the 30-day blank (sweep item 3), not hashing,
unless the owner specifically wants the IP available for abuse investigation
in a hashed/comparable form beyond 30 days.

## NISS segregation

The issue's proposal (encrypt at rest, restrict reads to the export path,
audit every access) is a materially larger change than the rest of this
document — it needs an encryption-key management decision (env-var secret vs.
KMS, rotation story) that doesn't have an existing pattern elsewhere in this
codebase to follow, unlike the sweep mechanism above. Rather than bolt that
onto this PR's scope, this document proposes splitting it into its own
follow-up once the schedule above is confirmed:

- At minimum, restrict which admin views/exports render
  `national_register_number` in full (today it is a plain field on every
  `Person` read).
- Application-level encryption (not just at-rest disk encryption, which the
  hosting stack likely already provides) needs a key-management decision this
  document defers rather than picks.
- Whether NISS should be purged outright once the insurance export for an
  edition has been produced, instead of retained for the general 3-year
  window, is the owner's call — the issue raises it as an open question, and
  `docs/product-audit-2026-08.md`'s "Open questions for the maintainer"
  section already flags it as such.

## Rights channel dependency

The issue notes the contact form (#923) is "the *only* channel the policy
names for exercising these rights" and was a prerequisite. #923 is complete
(`docs/product-audit-2026-08.md` Phase 4 already reflects this), so nothing
in this document is blocked on it — an access/correction/deletion request
submitted through the contact form now reaches an admin who can act on it
using the mechanism proposed here, once implemented.

## What remains before implementation starts

1. Confirmation (or correction) of the retention windows in the schedule
   above from the project owner — the 3-year figure for anonymising a
   person's identity fields most of all, since it is a business judgment
   this document flagged rather than derived from statute. (`registrations`
   themselves are settled: retained indefinitely, no window, per the project
   owner's confirmation that historical/analytical growth reporting depends
   on it.)
2. A decision on whether NISS segregation ships alongside the rest of this
   work or as its own follow-up issue, given its larger, differently-shaped
   scope (key management).
3. Once confirmed: implement `anonymise_person`, the three worker sweeps, the
   audit-entry IP blanking, and the retry-safety documentation for each new
   write, then update `docs/product-audit-2026-08.md`'s #934 row and
   "Completed or superseded work" per `AGENTS.md`.

## References

- [#934](https://github.com/tjorim/champagnefestival/issues/934) — no
  retention or erasure mechanism
- [#923](https://github.com/tjorim/champagnefestival/issues/923) — contact
  form (complete; rights channel this document assumes)
- [#944](https://github.com/tjorim/champagnefestival/issues/944) — versioned
  policy publishing, blocked on this document per
  `docs/product-audit-2026-08.md`
- `docs/outbox-worker.md` — existing daily-sweep pattern this document
  extends, and the line noting "Issue #934 may revise the window when the
  broader retention schedule is approved"
- `backend/app/services/idempotency.py` — replay window and the
  currently-inaccurate "removed... daily" docstring claim
- `backend/app/services/people_service.py` — `delete_person`/`merge_people`,
  which `anonymise_person` would sit alongside
- `docs/retry-safety.md` — inventory this document's future sweeps must join
