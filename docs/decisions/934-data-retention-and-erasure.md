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
(versioned policy publishing — shipped ahead of this document rather than
waiting on it; its migrated text was tightened to stop short of claiming an
automated deletion/anonymisation pipeline, so it doesn't overstate what
exists yet. The policy should be republished through #944's admin editor
once this document's schedule is implemented)

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
| `people` — identity fields: `name`, `email`, `phone`, `address`, `notes` — **for people who never held the volunteer role, i.e. never have `national_register_number`/`eid_document_number` set** | Visitors and members behind one or more registrations | Anonymise (see below) 3 years after the person's **most recent** registration's event date, unless a shorter statutory period applies | `MAX(events.date)` across all of the person's registrations (a repeat visitor's clock resets on each new registration — see "Why the clock resets" below) | Storage-limitation principle: once nobody has contacted this person for 3 years, keeping name/e-mail/phone on file has no remaining operational purpose. **This number is the one figure in this table most in need of the owner's own review** — it is a business-retention judgment, not derived from a specific statute this document has checked. `roles`, `visits_per_month`, `club_name`, and `active` are not identity fields and are unaffected — see the mechanism below. |
| `people` — the same identity fields, **plus `national_register_number`/`eid_document_number`, for anyone who currently or ever held the volunteer role** | Volunteers — name, contact details, and NISS/eID together are what an insurance claim needs to identify who was covered for a given help period | **Excluded from the general anonymisation sweep entirely.** NISS/eID is volunteer-only (confirmed by the project owner) and must be kept for insurance purposes — and a NISS number with the name stripped off it would be useless for actually filing or defending a claim, so name/contact can't be anonymised in isolation while NISS/eID survives either. Volunteers get their own retention track, not yet defined. | `volunteer_periods.last_help_day` (or `first_help_day` if still open) would be the natural anchor once a window is set | Legal obligation — insurance coverage and potential liability claims require identifying the volunteer. **Open question, not resolved by this document:** for how long after a volunteer's last help period is that identification actually needed (e.g. a Belgian civil-liability limitation period)? Until the owner sets one, the safe default is indefinite retention for anyone who ever volunteered, not silent anonymisation. |

Rows not listed (e.g. `contact_messages`, `outbox_jobs`) already have their
own documented retention: `outbox_jobs` terminal rows are cleaned daily at 90
days (`docs/outbox-worker.md`); `contact_messages` is out of this document's
scope.

### Why the clock resets on each registration

Public registration creation (`backend/app/routers/registrations.py`, around
the `Person.email == email_norm, Person.phone == phone_norm` lookup) already
matches a new registration against an existing `Person` by e-mail, phone, and
name before creating a new one — that's how a returning visitor gets to
re-order without re-entering their details and how their new registration
lands on the same person record instead of a duplicate. That lookup only
works while `email`/`phone`/`name` are still live on the row, which is
exactly why the anonymisation window is keyed to a person's *most recent*
registration rather than a fixed date: as long as someone orders again within
the window, their clock resets and the hassle-free link keeps working. The
convenience is only lost for someone who hasn't ordered in 3 straight years —
by definition, nobody currently benefiting from the link is affected by the
window firing. This is also a reason the 3-year figure might reasonably be
set longer than a pure "how long is a stale record still useful for
disputes/fraud" reading would suggest, if the owner wants to reduce how often
a genuinely-recurring-but-infrequent visitor (e.g. someone who only attends
every second or third edition) has to start over with a fresh record.

## Proposed mechanism: anonymise rather than delete

Add `people_service.anonymise_person(db, person, *, actor, request_id=None)`:

- **Refuse (or no-op with a logged skip) if `person.national_register_number`
  or `person.eid_document_number` is set.** That covers every current or
  former volunteer — see the retention-schedule row above. This function is
  for the ordinary-visitor/member track only until a volunteer retention
  window is decided; it must not be the thing that silently strips a
  volunteer's identity out from under their insurance record.
- Overwrite `name` with a stable pseudonym (`f"Guest #{person.id[-6:]}"` or
  similar — stable so repeated anonymisation of an already-anonymised row is
  a no-op, not a second rewrite).
- Blank `email`, `phone`, `address`, `notes`.
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
   above, and never anyone with `national_register_number`/
   `eid_document_number` set — see the volunteer carve-out above) is **not**
   proposed as part of this automated sweep. Unlike the three rows above,
   "3 years since a person's last registration" is a low-frequency,
   high-consequence operation on personal data; running it as an
   admin-triggered action (surfacing which people are due, computed from
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

The project owner has confirmed NISS/eID must be kept for volunteer insurance
purposes — so this section is no longer about *whether* to purge it (the
issue had raised that as an open question; it's settled: no, not on the
general schedule). What's still open is *how long* and *how securely*:

- **Retention window.** Not yet defined — see the retention-schedule row
  above. Proposed default until the owner sets one: keep indefinitely for
  anyone who ever held the volunteer role, rather than guess at a limitation
  period. A future PR can add a real window once the owner specifies one
  (e.g. a Belgian civil-liability limitation period counted from
  `volunteer_periods.last_help_day`).
- **Access restriction.** Restrict which admin views/exports render
  `national_register_number`/`eid_document_number` in full (today they are
  plain fields on every `Person` read, not just the volunteer insurance
  export at `GET /api/volunteers/export`) — this is worth doing regardless of
  the retention window, since it reduces exposure without touching retention
  at all.
- **Encryption at rest.** The issue's proposal (encrypt at rest, restrict
  reads to the export path, audit every access) is a materially larger
  change than the rest of this document — it needs an encryption-key
  management decision (env-var secret vs. KMS, rotation story) that doesn't
  have an existing pattern elsewhere in this codebase to follow, unlike the
  sweep mechanism above. This document proposes splitting it into its own
  follow-up once the retention window above is confirmed, rather than
  bolting key management onto this PR's scope.

## Reaching out about future events (marketing) — a separate track

This is a real gap the schedule above creates, but it can't be closed by
just keeping e-mail around longer under the *operational* purpose already in
the privacy policy ("to organise the current and upcoming edition... and to
meet our legal, accounting, dispute-resolution, and fraud-prevention
obligations"). Belgian/EU e-marketing rules (ePrivacy Directive, Book XII of
the Code of Economic Law) require its own legal basis — in practice, opt-in
consent — before an old visitor's e-mail can be used to tell them about a
*new* event. There's a narrow "existing customer, similar product, opt-out
offered" soft-opt-in exception in some EU states, but this document does not
assume Champagnefestival can rely on it without the owner's own legal read.
Quietly repurposing operational data for marketing without consent would be
exactly the kind of purpose-limitation violation this document is trying to
close a gap on, not open a new one.

Proposed shape, **not implemented or fully designed by this document**:

- An explicit, unticked-by-default opt-in at registration
  (`Person.marketing_opt_in: bool = False` +
  `marketing_opt_in_at: datetime | None`), with its own consent copy
  separate from the transactional confirmation e-mail, and a one-click
  unsubscribe link on every marketing send (required, not optional, under
  the same rules).
- **Carve-out in `anonymise_person`, same pattern as the volunteer one:**
  skip (or only partially blank — keep `email` and the opt-in flag,
  blank the rest) a person who currently has `marketing_opt_in = True`, so
  agreeing to be contacted isn't silently undone by the 3-year sweep.
  Whether opting in should also reset a person's general anonymisation
  clock, or run on a fully separate "consent still active, review
  periodically" track, is a decision for whoever designs this feature —
  this document only makes sure the sweep proposed here won't quietly break
  it once it exists.
- **The send itself is a new outbound channel.** `docs/product-audit-2026-08.md`'s
  #942 (central announcement/push composer) is explicitly scoped today as
  adding *no* bulk e-mail channel — reaching out to past visitors about a
  new edition is exactly the kind of use case that would widen that scope,
  or justify its own issue. This document flags the connection rather than
  designing a marketing-send feature inside a retention document.

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
   non-volunteer person's identity fields most of all, since it is a
   business judgment this document flagged rather than derived from statute,
   and it now doubles as the answer to "how long can someone skip editions
   and still re-order without re-entering their details" (see "Why the clock
   resets" above) — worth weighing both purposes together, not just the
   dispute/fraud-window reading alone.
   (`registrations` themselves are settled: retained indefinitely, no
   window, per the project owner's confirmation that historical/analytical
   growth reporting depends on it. NISS/eID retention is also settled as
   "keep it, don't anonymise it away" — only its specific window is still
   open, per the volunteer row above.)
2. A decision on the volunteer NISS/eID retention window (or confirmation
   that "indefinite, for anyone who ever volunteered" is acceptable as the
   long-term answer, not just the interim default), and on whether NISS
   access-restriction/encryption ships alongside the rest of this work or as
   its own follow-up issue, given its larger, differently-shaped scope (key
   management).
3. A decision on whether the marketing opt-in described above becomes part
   of this same implementation, a fast-follow, or a new tracked issue — it
   isn't required to satisfy the privacy-policy commitments #934 is about,
   but the anonymisation sweep's carve-out for it is cheap to build now
   versus retrofitted later once opted-in visitors already exist.
4. Once confirmed: implement `anonymise_person`, the three worker sweeps, the
   audit-entry IP blanking, and the retry-safety documentation for each new
   write, then update `docs/product-audit-2026-08.md`'s #934 row and
   "Completed or superseded work" per `AGENTS.md`.

## References

- [#934](https://github.com/tjorim/champagnefestival/issues/934) — no
  retention or erasure mechanism
- [#923](https://github.com/tjorim/champagnefestival/issues/923) — contact
  form (complete; rights channel this document assumes)
- [#944](https://github.com/tjorim/champagnefestival/issues/944) — versioned
  policy publishing, shipped ahead of this document with tightened text per
  `docs/product-audit-2026-08.md`; the policy should be republished through
  its admin editor once this document's schedule is implemented
- `docs/outbox-worker.md` — existing daily-sweep pattern this document
  extends, and the line noting "Issue #934 may revise the window when the
  broader retention schedule is approved"
- `backend/app/services/idempotency.py` — replay window and the
  currently-inaccurate "removed... daily" docstring claim
- `backend/app/services/people_service.py` — `delete_person`/`merge_people`,
  which `anonymise_person` would sit alongside
- `docs/retry-safety.md` — inventory this document's future sweeps must join
