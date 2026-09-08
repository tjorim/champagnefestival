# Data retention and erasure

> Design guidance and implementation context from the time of writing, not
> binding rules for future changes. See [using design guidance](../README.md#using-design-guidance).

**Status:** Implemented in #1010 (2026-09-07); #934 closed. This records the
owner-approved policy and implementation, not a new legal assessment.
The implemented behavior below supersedes historical proposed sweeps.

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

## Retention schedule

| Table / field | Contents | Window | Counted from | Legal basis |
| --- | --- | --- | --- | --- |
| `idempotency_keys` | `actor`, request hash, full response body | 72 hours (already the documented replay window) | `created_at` | Legitimate interest — retry-safety only; no reason to outlive the window callers are told to rely on |
| `reservation_access_tokens` | e-mail + token hash | Deleted at `expires_at` (currently ~30 min TTL) via a real sweep, not only the opportunistic delete on next request | `expires_at` | Legitimate interest — the token has no purpose once expired or used |
| `audit_entries.actor` when it holds an IP (token-gated check-in) | client IP | Blanked 30 days after `timestamp`; the entry itself (action, resource, timestamp) is kept | `timestamp` | Legitimate interest — abuse investigation for the days after an incident, not indefinitely; the entry's non-IP content still serves the accountability purpose audit logging exists for |
| `audit_entries` (all other rows) | actor (OIDC sub or `"anonymous"`), subject, action, details | Kept indefinitely, tied to the (now indefinitely retained) operational records they audit; no sweep proposed | — | Same basis as the underlying operational record it audits. Not a PII concern: `write_audit_entry` calls in `people_service`/`registrations_service` store field *names* changed or role lists in `details`, not the personal values themselves, and `actor` for staff-performed actions is the OIDC sub, not the customer — so keeping these forever doesn't extend how long a customer's own personal data is legible from an audit row. |
| `registrations` — guest counts, orders, accessibility notes, check-in times, table/event links | **Retained indefinitely, never deleted or anonymised.** This is the historical/analytical record (edition-over-edition attendance and order growth) the project owner has confirmed must survive independent of what happens to the person behind it. | No window | — | Legitimate interest — aggregate/attributed-to-a-pseudonym operational history has clear ongoing business value (trend analysis) and, once its `person_id` points to an anonymised row (see next), it no longer carries personal data itself |
| `people` — identity fields: `name`, `email`, `phone`, `address`, `notes` — **for people who never held the volunteer role, i.e. never have `national_register_number`/`eid_document_number` set** | Visitors and members behind one or more registrations | Anonymise (see below) **7 years** after the person's **most recent** registration's event date, unless a shorter statutory period applies | `MAX(events.date)` across all of the person's registrations (a repeat visitor's clock resets on each new registration — see "Why the clock resets" below) | Storage-limitation principle: once nobody has contacted this person for 7 years, keeping name/e-mail/phone on file has no remaining operational purpose. **Confirmed by the project owner on 2026-09-06**, chosen to match the Belgian statutory accounting-record retention period so retention reasoning is uniform across the business rather than setting a second, unrelated clock. It is the weaker storage-limitation position of the options considered — the trade accepted deliberately, since the same window also governs how long a returning visitor keeps their existing record (see "Why the clock resets" below). `roles`, `visits_per_month`, and `club_name` are retained; anonymisation sets `active = False` — see the implementation below. |
| `people` — the same identity fields, **plus `national_register_number`/`eid_document_number`, for anyone who currently or ever held the volunteer role** | Volunteers — name, contact details, and NISS/eID together are what an insurance claim needs to identify who was covered for a given help period | **Excluded from the general anonymisation sweep entirely.** NISS/eID is volunteer-only (confirmed by the project owner) and must be kept for insurance purposes — and a NISS number with the name stripped off it would be useless for actually filing or defending a claim, so name/contact can't be anonymised in isolation while NISS/eID survives either. Volunteers are retained **indefinitely**. | No window — nothing anchors on `volunteer_periods.last_help_day`, because no sweep is written for this track | Legal obligation — insurance coverage and potential liability claims require identifying the volunteer. **Settled by the project owner on 2026-09-06: indefinite retention is the long-term policy, not an interim default.** No volunteer sweep is to be written, and `anonymise_person` refuses this population outright (see the implementation below). The alternative considered and rejected was a bounded window anchored on the last help day (e.g. a Belgian civil-liability limitation period); it was rejected because a late claim surfacing after the window would leave the festival unable to identify who it had covered, which is the whole reason the field is kept. |

Rows not listed (e.g. `contact_messages`, `outbox_jobs`) already have their
own documented retention: `outbox_jobs` terminal rows are cleaned daily at 90
days (`docs/outbox-worker.md`); `contact_messages` is out of this document's
scope.

### Why the clock resets

The window uses the most recent registration event date so returning visitors
retain their existing Person linkage. A new registration resets that clock;
marketing consent does not.

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
   `timestamp` is older than 30 days — **new**, implemented as a VPS
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

## Consent and access boundaries

Anonymisation preserves operational registrations and a stable person
pseudonym, clears identity fields, and deactivates the person. It refuses
records with NISS/eID fields. Marketing opt-in preserves email and consent
while other identity fields are cleared; it does not extend the retention
clock. Public registration cannot revoke existing consent with an absent
checkbox; administrators can process corrections/opt-outs. Merge behavior
preserves consent. No bulk-email send channel or double opt-in was built;
consent verification and unsubscribe requirements must be addressed before
any future marketing sender uses this flag.

NISS/eID remain available on the admin volunteer surface and write responses,
but are excluded from generic people/member list and single-record reads.
Encryption at rest was explicitly declined, not deferred. Volunteer identity
linking, self-service corrections and eID renewal handling remain in #1006.
The eID document number is treated as a point-in-time card record.

## Implemented (2026-09-07)

1. `people_service.anonymise_person`, with the volunteer refusal and the
   marketing-consent carve-out described above. Exposed as
   `POST /api/people/{id}/anonymise` (admin-only), with
   `GET /api/people/due-for-anonymisation` surfacing candidates — see
   "Scheduled sweeps" item 4.
2. The two pre-existing VPS-scheduled sweeps (`idempotency_keys`,
   `reservation_access_tokens`) needed no change. The one new sweep
   (`audit_entries.actor` IP blanking at 30 days) ships the same way, as a
   VPS job — see "Scheduled sweeps" above for the correction on how
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
(2026-09-03) to stop short of claiming a pipeline that
didn't exist; now that one does, the policy's wording could be strengthened,
but that is a legal-content edit for the project owner to make and publish
through #944's editor themselves, not something this document's
implementation should author unilaterally.

## References

- [Retry-safety inventory](../retry-safety.md)
- [Outbox operations](../outbox-worker.md)
- [VPS cleanup foundation](https://github.com/tjorim/apps/issues/177)
- [Audit-IP cleanup job](https://github.com/tjorim/apps/pull/192)
- [Volunteer identity follow-up #1006](https://github.com/tjorim/champagnefestival/issues/1006)

## Historical context

Consolidated 2026-09-08. Original proposals and implementation history remain
in Git at `88396baf3275ae40cdd907239a0df6a04baed137`; they are not current requirements.
