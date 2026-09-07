# Data retention schedule and anonymisation mechanism

**Status:** Implemented (2026-09-07) — see "Implemented" near the end for
exactly what shipped and the one item deliberately left for the project
owner (republishing the privacy policy). The confirmed calls this executed:
identity fields anonymise **7 years** after a person's most recent event;
volunteer NISS/eID is retained **indefinitely** (settled as the long-term
policy, not an interim default); NISS/eID **read access is restricted** but
**not encrypted at rest**; the **marketing opt-in shipped**; and audit-entry
IPs are blanked at 30 days with no write-time hashing. Operational
registration data (guest counts, orders, dates, tables) is retained
indefinitely and is never deleted or anonymised away.
**Date:** 2026-09-03 (updated 2026-09-06 — all remaining windows and scope
questions confirmed by the project owner; updated 2026-09-07 — implemented,
with a correction to "Scheduled sweeps" on how two of the three sweeps were
actually delivered)
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

**Correction on implementation, 2026-09-07:** this section originally
proposed extending the in-process worker loop (`backend/app/worker.py`) for
all three sweeps below, on the assumption that `idempotency_keys` cleanup
didn't exist yet. That assumption was wrong — checking `tjorim/apps#177`
(closed 2026-08-23) directly showed it does, and so does a
`reservation_access_tokens` sweep, both as VPS-scheduled SQL jobs
(`infra/scheduled-jobs/champagnefestival-purge-idempotency-keys.sql` /
`-purge-reservation-access-tokens.sql` in `tjorim/apps`, on daily systemd
timers), not as anything in this repo. `docs/retry-safety.md` already
documented this for the idempotency case ("Production cleanup deletes
expired rows daily under `tjorim/apps#177`; the application does not run a
local cleanup scheduler") — this document's author simply hadn't checked
before writing the sweep proposal below. Items 1 and 2 needed no backend
change as a result. Item 3 (the only genuinely new sweep) follows the same
established VPS-scheduled-SQL-job pattern instead of the in-process
`next_cleanup` loop originally proposed for it, for consistency with 1 and 2
rather than introducing a second, different scheduling mechanism for
one-third of this list.

1. `idempotency_keys` older than `IDEMPOTENCY_REPLAY_WINDOW` (72h) — **already
   done**, via `tjorim/apps#177`. `idempotency.py`'s docstring claiming a daily
   production cleanup exists was accurate, not aspirational.
2. `reservation_access_tokens` where `expires_at < now()` — **already done**,
   also via `tjorim/apps#177` (with a 24-hour grace period past expiry for
   operational diagnosis, a refinement on this document's original "at
   `expires_at`" proposal, not a gap).
3. `audit_entries.actor` blanked to `""` where it currently holds an IP and
   `timestamp` is older than 30 days — **new**, implemented as a fourth VPS
   job (`champagnefestival-redact-audit-entry-ips.sql` in `tjorim/apps#192`)
   following the same pattern as 1 and 2. Distinguished from a real OIDC
   subject via a new explicit `auth_source="token"` tag
   (`write_audit_entry`'s `auth_source` parameter), passed by the check-in
   router's two audit writes — `audit_provenance`'s existing inference had no
   case for "client IP, no OIDC subject at all" and was silently mislabelling
   these rows `auth_source="keycloak"`, which would have made this sweep
   either blank real staff actions or miss its target entirely depending on
   which way it was scoped.
4. Person anonymisation (identity fields only — never `registrations`, see
   above, and never anyone with `national_register_number`/
   `eid_document_number` set — see the volunteer carve-out above) is **not**
   part of any automated sweep. Unlike the three rows above, "7 years since a
   person's last registration" is a low-frequency, high-consequence operation
   on personal data; it ships as `GET /api/people/due-for-anonymisation`
   (surfacing candidates, computed from `MAX(events.date)` per person) plus
   an admin-triggered `POST /api/people/{id}/anonymise`, safer than a fully
   automatic run for a first implementation.

Item 3's retry-safety entry lives in `docs/retry-safety.md` as a VPS-scheduled
job note, matching how items 1 and 2 are documented there rather than as a
client-facing retry contract — nothing external retries a nightly sweep in
the sense that inventory otherwise covers. The admin-triggered anonymisation
endpoint (item 4) *is* a normal client-facing write and has its own inventory
row: convergent, natural resource key, consistent with the "Deletes... natural
resource key, convergent state only" entry already in that inventory.

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

## NISS and eID are not the same kind of identifier — noted, not resolved here

Worth being explicit about, since this document has been treating "NISS/eID"
as one unit throughout: the **NISS** (`national_register_number`) is a fixed,
lifelong identifier — it never changes for a given person, which is exactly
why the retention decision above (keep indefinitely) is straightforward for
it. The **eID document number** (`eid_document_number`) is different — it's
the physical card's own serial number, and it changes every time the card is
renewed or replaced (typically every 5–10 years for an adult). Nothing in the
system re-verifies or re-prompts for this, so a long-tenured volunteer's
stored `eid_document_number` will predictably drift from their current card.

This is not treated as a defect in the schedule above: the field is captured
once, at volunteer sign-up, to support an insurance claim referencing *that
specific document* at the time of a given incident — not to re-identify the
person later, which is the NISS's job. A stale `eid_document_number` is a
point-in-time record doing exactly what it was captured for, not a live
field that has failed to update.

What this document does not solve, and files as [#1006](https://github.com/tjorim/champagnefestival/issues/1006)
instead of designing here: both fields are admin-only today (the entire
`/api/volunteers` router requires the `admin` role), so the person best
positioned to notice their eID has changed — the volunteer — has no way to
see or correct it. Building that would first require linking an authenticated
volunteer identity to their `Person` record, which does not exist in any form
today (the `volunteer` OIDC realm role proves "this token has the volunteer
role," not "this token belongs to person X"). Deliberately out of scope for
this implementation; #1006 exists so it isn't lost.

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

## Implemented (2026-09-07)

1. `people_service.anonymise_person`, with the volunteer refusal and the
   marketing-consent carve-out described above. Exposed as
   `POST /api/people/{id}/anonymise` (admin-only), with
   `GET /api/people/due-for-anonymisation` surfacing candidates — see
   "Scheduled sweeps" item 4.
2. The two pre-existing VPS-scheduled sweeps (`idempotency_keys`,
   `reservation_access_tokens`) needed no change. The one new sweep
   (`audit_entries.actor` IP blanking at 30 days) ships the same way, as a
   third VPS job — see "Scheduled sweeps" above for the correction on how
   this was actually delivered versus originally proposed. `write_audit_entry`
   gained an explicit `auth_source` parameter and the check-in router's two
   audit writes now pass `auth_source="token"`, without which the sweep could
   not distinguish an IP from a real OIDC subject.
3. `national_register_number`/`eid_document_number` removed from the generic
   people/members **list and single-person reads** (REST `PersonSummaryOut`;
   MCP `get_person`/`get_member`/`list_members`), both admin-only surfaces.
   Create, update, and merge (REST and MCP) are unchanged and still return
   them — those responses echo back data the caller just explicitly provided
   or is actively verifying (a merge adopting an identity field from a
   duplicate has existing, passing tests asserting exactly that), which is a
   materially different exposure than a list an admin scrolls through for
   unrelated reasons. `/api/volunteers` is unaffected either way — it already
   has its own schema and was never the leak.
4. `Person.marketing_opt_in` / `marketing_opt_in_at`, the unticked-by-default
   registration consent checkbox and its copy in `nl`/`en`/`fr`, plus an
   admin-only correction path via `PersonUpdate` (e.g. to process an opt-out
   received through the contact form) that the registration form itself does
   not expose.
5. `docs/retry-safety.md` entries: the new admin anonymisation endpoint in the
   main inventory, and the VPS-scheduled audit-IP job documented alongside
   the pre-existing idempotency-key job's equivalent note.
6. `docs/product-audit-2026-08.md`'s #934 row and "Completed or superseded
   work", per that document's maintenance procedure.

**Not done, and deliberately not attempted here:** republishing the privacy
policy through #944's admin editor. Its current text was already tightened
(2026-09-03, see the header above) to stop short of claiming a pipeline that
didn't exist; now that one does, the policy's wording could be strengthened,
but that is a legal-content edit for the project owner to make and publish
through #944's editor themselves, not something this document's
implementation should author unilaterally.

## References

- [#934](https://github.com/tjorim/champagnefestival/issues/934) — no
  retention or erasure mechanism
- [#923](https://github.com/tjorim/champagnefestival/issues/923) — contact
  form (complete; rights channel this document assumes)
- [#944](https://github.com/tjorim/champagnefestival/issues/944) — versioned
  policy publishing, shipped ahead of this document with tightened text per
  `docs/product-audit-2026-08.md`; the policy should be republished through
  its admin editor once this document's schedule is implemented
- `docs/outbox-worker.md` — the daily in-process sweep pattern (`outbox_jobs`
  cleanup) this document originally, mistakenly proposed extending for all
  three sweeps here; see "Scheduled sweeps" for the correction
- [`tjorim/apps#177`](https://github.com/tjorim/apps/issues/177) — the
  VPS-scheduled-SQL-job mechanism (closed 2026-08-23) that already covered
  `idempotency_keys` and `reservation_access_tokens` cleanup before this work,
  and that the new audit-IP job extends
- [`tjorim/apps#192`](https://github.com/tjorim/apps/pull/192) — the new
  `champagnefestival-redact-audit-entry-ips` scheduled job
- `backend/app/services/idempotency.py` — replay window; its "removed...
  daily" docstring claim was accurate all along, contrary to this document's
  original assumption
- `backend/app/services/people_service.py` — `delete_person`/`merge_people`,
  which `anonymise_person` sits alongside
- `docs/retry-safety.md` — inventory the new anonymisation endpoint and
  audit-IP job joined
- [#1006](https://github.com/tjorim/champagnefestival/issues/1006) — volunteer
  self-service NISS/eID access and eID staleness, filed out of this
  document's scope, not resolved by it
