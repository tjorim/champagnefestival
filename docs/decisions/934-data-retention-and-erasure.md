# Data retention schedule and anonymisation mechanism

**Status:** Decided — the project owner confirmed every open window and scope
question on 2026-09-06. Ready to implement; no question in this document is
still waiting on an answer. The confirmed calls: identity fields anonymise
**7 years** after a person's most recent event; volunteer NISS/eID is retained
**indefinitely** (settled as the long-term policy, not an interim default);
NISS/eID **read access is restricted** but **not encrypted at rest**; the
**marketing opt-in ships as part of this work**; and audit-entry IPs are
blanked at 30 days with no write-time hashing. Operational registration data
(guest counts, orders, dates, tables) is retained indefinitely and is never
deleted or anonymised away.
**Date:** 2026-09-03 (updated 2026-09-06 — all remaining windows and scope
questions confirmed by the project owner)
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
judgment calls this document should not make unilaterally. Those
confirmations have since been given — see "Confirmed decisions" at the end —
so the windows below are the agreed schedule, not a proposal.

## Retention schedule

| Table / field | Contents | Window | Counted from | Legal basis |
| --- | --- | --- | --- | --- |
| `idempotency_keys` | `actor`, request hash, full response body | 72 hours (already the documented replay window) | `created_at` | Legitimate interest — retry-safety only; no reason to outlive the window callers are told to rely on |
| `reservation_access_tokens` | e-mail + token hash | Deleted at `expires_at` (currently ~30 min TTL) via a real sweep, not only the opportunistic delete on next request | `expires_at` | Legitimate interest — the token has no purpose once expired or used |
| `audit_entries.actor` when it holds an IP (token-gated check-in) | client IP | Blanked 30 days after `timestamp`; the entry itself (action, resource, timestamp) is kept | `timestamp` | Legitimate interest — abuse investigation for the days after an incident, not indefinitely; the entry's non-IP content still serves the accountability purpose audit logging exists for |
| `audit_entries` (all other rows) | actor (OIDC sub or `"anonymous"`), subject, action, details | Kept indefinitely, tied to the (now indefinitely retained) operational records they audit; no sweep proposed | — | Same basis as the underlying operational record it audits. Not a PII concern: `write_audit_entry` calls in `people_service`/`registrations_service` store field *names* changed or role lists in `details`, not the personal values themselves, and `actor` for staff-performed actions is the OIDC sub, not the customer — so keeping these forever doesn't extend how long a customer's own personal data is legible from an audit row. |
| `registrations` — guest counts, orders, accessibility notes, check-in times, table/event links | **Retained indefinitely, never deleted or anonymised.** This is the historical/analytical record (edition-over-edition attendance and order growth) the project owner has confirmed must survive independent of what happens to the person behind it. | No window | — | Legitimate interest — aggregate/attributed-to-a-pseudonym operational history has clear ongoing business value (trend analysis) and, once its `person_id` points to an anonymised row (see next), it no longer carries personal data itself |
| `people` — identity fields: `name`, `email`, `phone`, `address`, `notes` — **for people who never held the volunteer role, i.e. never have `national_register_number`/`eid_document_number` set** | Visitors and members behind one or more registrations | Anonymise (see below) **7 years** after the person's **most recent** registration's event date, unless a shorter statutory period applies | `MAX(events.date)` across all of the person's registrations (a repeat visitor's clock resets on each new registration — see "Why the clock resets" below) | Storage-limitation principle: once nobody has contacted this person for 7 years, keeping name/e-mail/phone on file has no remaining operational purpose. **Confirmed by the project owner on 2026-09-06**, chosen to match the Belgian statutory accounting-record retention period so retention reasoning is uniform across the business rather than setting a second, unrelated clock. It is the weaker storage-limitation position of the options considered — the trade accepted deliberately, since the same window also governs how long a returning visitor keeps their existing record (see "Why the clock resets" below). `roles`, `visits_per_month`, `club_name`, and `active` are not identity fields and are unaffected — see the mechanism below. |
| `people` — the same identity fields, **plus `national_register_number`/`eid_document_number`, for anyone who currently or ever held the volunteer role** | Volunteers — name, contact details, and NISS/eID together are what an insurance claim needs to identify who was covered for a given help period | **Excluded from the general anonymisation sweep entirely.** NISS/eID is volunteer-only (confirmed by the project owner) and must be kept for insurance purposes — and a NISS number with the name stripped off it would be useless for actually filing or defending a claim, so name/contact can't be anonymised in isolation while NISS/eID survives either. Volunteers are retained **indefinitely**. | No window — nothing anchors on `volunteer_periods.last_help_day`, because no sweep is written for this track | Legal obligation — insurance coverage and potential liability claims require identifying the volunteer. **Settled by the project owner on 2026-09-06: indefinite retention is the long-term policy, not an interim default.** No volunteer sweep is to be written, and `anonymise_person` refuses this population outright (see the mechanism below). The alternative considered and rejected was a bounded window anchored on the last help day (e.g. a Belgian civil-liability limitation period); it was rejected because a late claim surfacing after the window would leave the festival unable to identify who it had covered, which is the whole reason the field is kept. |

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
convenience is only lost for someone who hasn't ordered in 7 straight years —
by definition, nobody currently benefiting from the link is affected by the
window firing. This dual purpose is part of why the confirmed figure is longer
than a pure "how long is a stale record still useful for disputes/fraud"
reading would suggest: at 7 years, a genuinely-recurring-but-infrequent
visitor — someone who attends only every second or third edition — keeps their
record across the gap instead of starting over.

## Mechanism: anonymise rather than delete

Add `people_service.anonymise_person(db, person, *, actor, request_id=None)`:

- **Refuse (or no-op with a logged skip) if `person.national_register_number`
  or `person.eid_document_number` is set.** That covers every current or
  former volunteer — see the retention-schedule row above. This is a permanent
  carve-out, not a temporary one: volunteer retention is settled as indefinite,
  so no later change should relax this branch. It must not be the thing that
  silently strips a volunteer's identity out from under their insurance record.
- **Keep `email`, `marketing_opt_in`, and `marketing_opt_in_at` if
  `person.marketing_opt_in` is `True`**, blanking the other identity fields as
  usual. Someone who agreed to hear about future editions must not have that
  consent silently revoked by the 7-year sweep. Opting in does *not* extend
  the window itself — see "Reaching out about future events" below.
- Overwrite `name` with a stable pseudonym (`f"Guest #{person.id[-6:]}"` or
  similar — stable so repeated anonymisation of an already-anonymised row is
  a no-op, not a second rewrite).
- Blank `email` (unless the opt-in above applies), `phone`, `address`, `notes`.
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

## Scheduled sweeps

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
   "7 years since a person's last registration" is a low-frequency,
   high-consequence operation on personal data; running it as an
   admin-triggered action (surfacing which people are due, computed from
   `MAX(events.date)` per person) is safer than a fully automatic run, at
   least for the first implementation.

Each new sweep gets its own retry-safety entry in `docs/retry-safety.md` per
`AGENTS.md`, at implementation time — these are convergent deletes/blanks
(repeating a sweep that finds nothing to do is a no-op), consistent with the
"Deletes... natural resource key, convergent state only" entry already in that
inventory.

## IP handling — confirmed

The issue's two options (truncate/hash at write time, or blank on a timer)
are not actually independent — item 3's audit sweep above already blanks the
IP after 30 days. Adding write-time hashing on top would mean maintaining a
rotating-salt scheme for a value that gets deleted a month later anyway.
**Confirmed by the project owner on 2026-09-06: the 30-day blank (sweep item
3) only, no write-time hashing.** The IP is not wanted in a hashed/comparable
form beyond 30 days, so no salt-rotation scheme is introduced.

## NISS segregation — decided

The project owner has confirmed NISS/eID must be kept for volunteer insurance
purposes, so this section was never about *whether* to purge it (the issue had
raised that as an open question; it is settled: no, not on the general
schedule). Both remaining questions — *how long* and *how securely* — were
answered on 2026-09-06:

- **Retention window — indefinite, settled.** Kept for anyone who ever held
  the volunteer role, with no sweep and no anchor date. This is the long-term
  policy rather than a placeholder pending a legal read: see the
  retention-schedule row above for why a bounded window anchored on
  `volunteer_periods.last_help_day` was considered and rejected.
- **Access restriction — in scope for this work.** Restrict which admin
  views/exports render `national_register_number`/`eid_document_number` in
  full. Today they are plain fields on *every* `Person` read, not just the
  volunteer insurance export at `GET /api/volunteers/export`. Since the
  retention answer is "keep it forever", narrowing who can read it is the
  control that actually reduces exposure here, and it introduces no new
  pattern — so it ships alongside the sweeps rather than waiting.
- **Encryption at rest — not doing it.** The issue proposed encrypting at
  rest, restricting reads to the export path, and auditing every access. The
  middle item is covered by the access restriction above; the encryption
  itself is declined. It needs an encryption-key management decision (env-var
  secret vs. KMS, rotation story) with no existing pattern in this codebase to
  follow, and the field sits behind an authenticated admin API whose read
  surface is being narrowed in the same change — so the key-management
  liability buys little over the restriction. Recorded as a deliberate
  decision, not a deferral: no follow-up issue is filed for it. Revisit only
  if the threat model changes (e.g. database backups leaving controlled
  storage).

## Reaching out about future events (marketing) — consent now, sending later

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

**Confirmed by the project owner on 2026-09-06: the consent capture ships as
part of this work.** Not as a fast-follow and not as a separate issue — the
`anonymise_person` carve-out below is far cheaper to build now than to
retrofit once opted-in visitors already exist, and a consent flag added after
the fact cannot honestly claim consent for anyone who registered before it.
The *sending* side remains out of scope (see the third bullet).

In scope for this implementation:

- An explicit, unticked-by-default opt-in at registration
  (`Person.marketing_opt_in: bool = False` +
  `marketing_opt_in_at: datetime | None`), with its own consent copy
  separate from the transactional confirmation e-mail. Unticked-by-default is
  a requirement, not a style choice: a pre-ticked box is not valid consent
  under the GDPR.
- **Carve-out in `anonymise_person`, same pattern as the volunteer one:**
  a person who currently has `marketing_opt_in = True` keeps `email` and the
  opt-in flag while the remaining identity fields are blanked, so agreeing to
  be contacted isn't silently undone by the 7-year sweep. **Opting in does
  not reset the general anonymisation clock** — consent is its own track, and
  letting it extend the operational window would quietly turn a marketing
  preference into indefinite retention of a home address. A periodic
  "consent still active?" review is left to whoever builds the send side.
- **The send itself stays out of scope.** No bulk e-mail channel is added
  here, and the one-click unsubscribe link that Belgian/EU rules require on
  every marketing send is that feature's obligation, not this one's — the
  opt-in flag records consent, and nothing in this implementation can act on
  it. `docs/product-audit-2026-08.md`'s #942 (central announcement/push
  composer) is explicitly scoped today as adding *no* bulk e-mail channel;
  reaching out to past visitors about a new edition would widen that scope or
  justify its own issue. Flagged here rather than designed inside a retention
  document.

## Rights channel dependency

The issue notes the contact form (#923) is "the *only* channel the policy
names for exercising these rights" and was a prerequisite. #923 is complete
(`docs/product-audit-2026-08.md` Phase 4 already reflects this), so nothing
in this document is blocked on it — an access/correction/deletion request
submitted through the contact form now reaches an admin who can act on it
using the mechanism proposed here, once implemented.

## Confirmed decisions

Every question this document raised was answered by the project owner on
2026-09-06. Nothing here is still waiting on an answer.

| Question | Decision |
| --- | --- |
| Non-volunteer identity-field window | **7 years** after the person's most recent event date, matching the Belgian statutory accounting-record period so the business keeps one retention clock rather than two |
| `registrations` and other operational data | **Indefinite**, never deleted or anonymised (confirmed earlier, 2026-09-03) |
| Volunteer NISS/eID retention | **Indefinite**, as the long-term policy rather than an interim default — no volunteer sweep is written |
| NISS/eID access restriction | **In scope for this work** — narrow which admin views/exports render it in full |
| NISS/eID encryption at rest | **Declined**, deliberately — no follow-up issue. Key management buys little over the read restriction for a field behind an authenticated admin API |
| Audit-entry IP addresses | **Blanked at 30 days**, no write-time hashing |
| Marketing opt-in | **Ships as part of this work** — consent capture and the sweep carve-out only; no send channel |

## What implementation covers

1. `people_service.anonymise_person`, with the volunteer refusal and the
   marketing-consent carve-out described above.
2. The three automated worker sweeps (`idempotency_keys` at 72h,
   expired `reservation_access_tokens`, `audit_entries.actor` IP blanking at
   30 days), plus the admin-triggered person-anonymisation action — kept
   deliberately manual for its first implementation, per "Scheduled sweeps"
   item 4.
3. Restricting `national_register_number`/`eid_document_number` reads to the
   volunteer insurance export path.
4. `Person.marketing_opt_in` / `marketing_opt_in_at`, the unticked-by-default
   registration consent control, and its consent copy in `nl`/`en`/`fr`.
5. A `docs/retry-safety.md` entry for each new write, per `AGENTS.md`.
6. Republishing the privacy policy through #944's admin editor, now that the
   automated deletion/anonymisation pipeline its text stops short of claiming
   will actually exist.
7. Updating `docs/product-audit-2026-08.md`'s #934 row and "Completed or
   superseded work" per that document's maintenance procedure.

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
