# Write-operation retry safety

Network timeouts are ambiguous: the caller cannot know whether a write committed.
Every new or changed write operation must therefore make an explicit retry-safety
decision during implementation. This document is the inventory and contract for
writes that browsers, event-day clients, MCP callers, or automation may retry.

An idempotency key is an opaque retry token. It is never a credential, does not
grant access to a stored response, and does not replace normal authorization.

## Supported strategies

- **Natural-key upsert:** repeated application of the desired state converges on
  one resource selected by a stable business key.
- **Client-generated resource ID:** the caller chooses the resource identity and
  repeats a create with that identity.
- **Optimistic concurrency:** a version or precondition prevents a stale repeat
  from overwriting newer state.
- **Server-side replay:** the server stores the result against an opaque,
  client-supplied key and returns it for an identical retry.

If none is implemented, the operation is **not retry safe**. Clients must first
reconcile state with a read and must not blindly retry it. Calling this out is a
deliberate decision, not an implicit idempotency guarantee.

## Inventory

| Operations | Callers | Decision |
| --- | --- | --- |
| Bulk create rooms, table types, tables, and layouts (`POST /api/*/bulk`; MCP `bulk_create_*`) | REST and MCP automation | **Server-side replay.** The REST routers and MCP adapters call the same service functions and accept the same `idempotency_key`. |
| Record a payment transaction (`POST /api/registrations/{id}/transactions`; MCP `create_payment_transaction`) (#1019) | Admin browser and MCP automation | **Server-side replay**, scope `payments.record_transaction`, same `check_idempotency_key`/`record_idempotency_key`/`commit_with_idempotency_guard` primitive as the bulk-create operations above, with the same 72-hour replay window, actor isolation, payload-hash conflict, and concurrent-first-use serialization via the unique `(scope, key)` constraint. A client-generated `idempotency_key` is required to make a retry after a timeout safe — without one, an ambiguous submission could book or refund the same money twice, since each call always appends a new, immutable ledger row rather than converging on an existing one. |
| Public and volunteer registration check-in | Event-day Android, browser, and volunteer clients | **Natural-key upsert.** Registration ID is the stable key; checked-in and strap-issued flags only converge from false to true. A repeat returns the current registration and reports that it was already checked in. The strict bucket is per registration, so one guest's retries do not consume another registration's allowance; a separate shared-IP abuse ceiling can still reject unrelated registrations when the venue-wide ceiling is exceeded. |
| Updates (`PUT`), including registration party-size/table assignment/over-capacity confirmations, table-type capacity changes, registration order/delivery updates, application settings, venue details/coordinates, and FAQ reorder | Browser, volunteer, and MCP admin clients | **Not retry safe.** They currently have no version precondition; clients must read and reconcile after an ambiguous result. Seating and event-capacity writes use row locks to preserve capacity decisions, and an over-capacity confirmation is separately audited, but replay can still produce a second audit entry or overwrite newer state. Registration party-size/order updates re-resolve authoritative product data and preserve delivery counts, while volunteer delivery updates change only delivery counts. Clients must reconcile before retrying; optimistic concurrency is preferred if automatic retries are added. |
| Deletes, account/token revocation, and integration-client revocation | Browser and MCP admin clients | **Natural resource key, convergent state only.** Repeating reaches the same absent/revoked state, although the response can change to not-found. Callers needing the original response must reconcile. |
| Anonymise a person (`POST /api/people/{id}/anonymise`) | Admin browser | **Natural resource key, convergent state only.** The pseudonym is derived from the stable person ID, so repeating it after an ambiguous result reaches the same anonymised row rather than a second, different rewrite. Refuses (409) a person with a NISS/eID on file every time, not just the first call — that refusal is not itself retryable into success. |
| Create a policy draft (`POST /api/policies/{key}/draft`) | Admin browser | **Not retry safe.** Server-generated version ID and `version_number`. A retry after an ambiguous result either creates a second, unwanted draft or — if the "one open draft per policy" partial unique index already rejected a concurrent duplicate — cleanly 409s instead of silently duplicating; callers must read `GET /api/policies/{key}` and reconcile before retrying rather than assume success or failure. |
| Edit a policy draft (`PUT /api/policies/{key}/draft`) and discard it (`DELETE /api/policies/{key}/draft`) | Admin browser | **Not retry safe (edit); natural resource key, convergent state only (discard).** The edit has no version precondition — the same general-`PUT` caveat above applies: reconcile via a fresh `GET` before retrying rather than blindly resubmitting stale content. Discard converges to "no open draft" and repeating it after the draft is already gone or already published simply 404s. |
| Publish a policy draft (`POST /api/policies/{key}/draft/publish`) | Admin browser | **Natural resource key, convergent state only — safe to retry after an ambiguous result, but not safe to resubmit deliberately.** The policy row lock plus the partial unique indexes on `(policy_key)` for `status='draft'`/`status='published'` (see #944) mean a retry can never double-publish or double-supersede: if the first attempt actually committed, the retry finds no open draft left and 404s cleanly instead of corrupting state. It is not a blind-repeat-safe operation in the idempotency-key sense — a deliberate second publish requires a new draft — but an ambiguous network result never needs anything beyond checking `GET /api/policies/{key}` before deciding whether to create another draft. |
| Contact submission (`POST /api/contact`) | Public browser | **Client-generated resource ID.** The browser retains one UUID for an attempt; repeating it returns success without inserting another message or sending another notification. A fresh form submission gets a fresh UUID. |
| Mark contact message handled (`PUT /api/contact/{id}/handled`) | Admin browser | **Natural-key upsert.** The first call records `handled_at`; repeats preserve that timestamp and return the same handled state. |
| Claim registrations (`POST /api/me/registrations/claim`) | Signed-in browser | **Not retry safe with the same access token.** The write itself is convergent because only unowned registrations are linked, but the email access token is consumed atomically with the claim. After an ambiguous response, callers must reconcile through `GET /api/me/registrations` instead of replaying the token. |
| Access registrations (`POST /api/registrations/my/access`) | Public browser | **Not retry safe with the same access token.** A successful exchange expires the single-use token. Before its one-shot mutation, the browser removes the token from the URL, then keeps returned guest data in memory; an ambiguous response requires requesting a new link. |
| Visitor magic-link request (`POST /api/visitor-sessions/request`) | Public browser | **Not retry safe with the same requested email.** Same shape as the guest-access-token request above: a new request for the same email overwrites (not appends to) the one outstanding link — a deliberate replace, not append-only replay storage — and the response is generic regardless of match, so a caller cannot distinguish "already had a link" from "sent a new one." A deliberate repeat is harmless (the visitor just gets a fresh link and the old one stops working), but that is a product property of this specific write, not a general idempotency guarantee. |
| Visitor magic-link redemption (`POST /api/visitor-sessions/redeem`) | Public browser | **Not retry safe with the same link.** The link is consumed atomically with `VisitorSession` creation (and any currently-unowned registration matching the verified email being claimed onto that session's user) — a concurrent-redemption row lock guarantees only one of two simultaneous replays can win, matching `POST /api/registrations/my/access`'s existing precedent. After an ambiguous response, the browser must reconcile through `GET /api/visitor-sessions/status` (or a fresh `GET /api/me/registrations`, since the resulting session cookie is already set either way) rather than replay the token — a second redemption attempt with the same link cleanly 401s once the first one committed. |
| Visitor session refresh (any authenticated `GET`/`POST` while a visitor-session cookie is presented) | Public browser | **Convergent — safe to retry.** Every dependency resolution that accepts the cookie extends the sliding 7-day idle window (`VisitorSession.expires_at`, capped by the never-extended 30-day `hard_expires_at`) as a side effect; repeating the same authenticated request extends the same way each time, with no additional state created. Sign-out (`POST /api/visitor-sessions/sign-out`) is likewise convergent — deleting an already-deleted session is a no-op. |
| Single creates, layout copy, people merge, registration creation, registration-access email request, Pebble token creation, and integration-client creation/rotation | Browser, public clients, and MCP automation | **Not retry safe.** Server-generated identity or an external side effect makes blind retry unsafe. Use server-side replay or a client-generated resource ID before adding automatic retries. Secret-returning operations must not gain replay storage without a separate security review. |
| Save a layout revision (`POST /api/layouts/{id}/revisions`; MCP `save_layout_revision`) (#1021) | Admin browser and MCP automation | **Not retry safe.** Server-generated revision ID and `revision_number`, the latter computed under a row lock on the parent `Layout` (mirrors `policies_service.create_draft`'s version numbering). A retry after an ambiguous result creates a second, distinct revision rather than converging on the first — reconcile via `GET /api/layouts/{id}/revisions` before retrying. |
| Restore a layout revision (`POST /api/layouts/{id}/revisions/{revision_number}/restore`; MCP `restore_layout_revision`) (#1021) | Admin browser and MCP automation | **Not retry safe.** Restoring mutates existing tables/areas in place and deletes/recreates others under a row lock on the parent `Layout`; a blind retry after an ambiguous result would re-apply the same snapshot on top of whatever state the first (possibly successful) attempt — or an intervening edit — left behind, rather than reconciling with it. Clients must read the current layout (`GET /api/layouts/{id}?include_tables=true`) and reconcile before retrying rather than resubmit. The preceding restore-preview read (`POST .../restore/preview`) is not itself a write and is safe to repeat. |
| Outbox enqueue within registration creation | Backend transaction | **Natural resource key.** The unique `registration-confirmation:{registration_id}` key permits one confirmation job per registration, and the job is committed atomically with the registration. This does not make registration creation itself retry safe because a repeated create receives a new registration ID. |
| Outbox enqueue within a visitor booking change/cancellation request | Backend transaction | **Natural resource key.** The unique `contact-notification:{submission_id}` key permits one notification job per client-generated submission UUID, committed atomically with the stored `ContactMessage`. A replay of the same submission finds the message already inserted and does not enqueue a second job. |
| Outbox enqueue within a volunteer eID correction request (#1006) | Backend transaction | **Natural resource key.** Same `contact-notification:{submission_id}` key and mechanism as the visitor booking change/cancellation request above — the two share `ContactMessage`/outbox plumbing (`app.services.volunteer_self_service.submit_eid_correction_request`), just a different caller and message shape. |
| Outbox enqueue within a volunteer identity claim (#1006, #1037 review) | Backend transaction | **Server-generated resource ID.** Unlike the two rows above, this `ContactMessage`/notification is an internal side effect of a successful claim, not a client-retryable request — its id is a fresh `uuid4()` generated server-side, so it has nothing to deduplicate against and no client ever supplies or replays it. |
| Outbox delivery attempts | Supervised worker | **At-least-once delivery.** A lease and atomic `SKIP LOCKED` claim prevent concurrent workers from owning the same live attempt, and expired claims recover after a crash. A process failure after SMTP accepts a message but before the result commits is inherently ambiguous and can cause a duplicate email; consumers must tolerate duplicates. Retries are bounded and use exponential backoff before terminal failure. |
| Web Push subscribe (`POST /api/push/subscriptions`) | Public browser | **Natural-key upsert.** `endpoint` is the browser-chosen stable key; a repeat (deliberate or ambiguous-response retry) upserts the same row rather than creating a duplicate. `consent_at` is set only on first creation and never overwritten, so a resubscribe cannot backdate consent; `categories`/`event_ids`/`locale`/`last_seen_at` do refresh on every call, which is the intended "renew my preferences" behaviour, not a retry hazard. |
| Web Push unsubscribe (`POST /api/push/subscriptions/unsubscribe`) | Public browser | **Natural-key upsert, convergent state only.** Deletes by `endpoint`; repeating after the row is already gone is a no-op that still returns 204. |
| Web Push admin test-send (`POST /api/push/test`) | Admin browser | **Not retry safe.** Each call enqueues a fresh outbox job under a unique `web-push-test:{subscription_id}:{random}` deduplication key, so a repeat — deliberate or after an ambiguous response — always sends another test notification rather than replaying the first. Acceptable here because the caller is an authenticated administrator manually triggering a one-off diagnostic, not an automated or public client; the outbox delivery attempt for that job is itself at-least-once per the entry above. |
| Volunteer identity claim (`POST /api/me/volunteer/claim`) (#1006) | Authenticated OIDC volunteer browser | **Natural-key upsert, convergent for the claiming subject.** The link is only ever written for a currently-unlinked record (`Person.oidc_subject IS NULL`), so a retry with the same NISS from the same subject after an ambiguous result either finds the link already made by the first attempt (returns the same identity) or, if a different subject's session won the race first, 404s exactly as if it had never matched — the caller must reconcile via `GET /api/me/volunteer` rather than assume failure. Rate-limited per subject (`app.ratelimit.check_volunteer_identity_claim_rate_limit`), same bucket-then-commit-then-check ordering as check-in/push below so a rejected guess is still counted. Knowing a volunteer's NISS is what this claim requires, not a verified channel (#1037 review) — a successful claim also raises a server-generated, non-retryable admin notification (`ContactMessage`/outbox, distinct from the claim's own idempotency) so a wrongful claim is noticed and reversible rather than silently undetected. |
| Volunteer eID correction request (`POST /api/me/volunteer/eid-correction`) (#1006) | Authenticated OIDC volunteer browser | **Client-generated resource ID**, identical shape to the visitor booking change/cancellation request above: `submission_id` is the `ContactMessage` id via `ON CONFLICT DO NOTHING`, so a retry after an ambiguous result returns success without inserting a second message or enqueuing a second notification — **but only when the payload is identical.** The frontend keeps `submission_id` fixed across a failed attempt even if the volunteer edits the form before retrying, so a reused id with a *different* payload is a distinct correction, not a replay; the service compares the stored message and 409s on a mismatch instead of silently keeping the first version (#1037 review). Never writes `Person.eid_document_number` directly — the record is admin-reviewed and applied through the existing `PUT /api/volunteers/{id}`. Also rate-limited per subject (`app.ratelimit.check_volunteer_eid_correction_rate_limit`), same bucket-then-commit-then-check ordering as check-in/push below, since a client-generated id only dedupes a replay of the *same* id — it doesn't bound how many distinct new ones a session can submit. |

The check-in lookup `POST` does not mutate application state and is outside
this write inventory.

Cancelling a registration rotates its check-in token only on the transition
into `cancelled`; repeating the same cancellation does not rotate it again.
This makes that side effect convergent, but does not change the broader `PUT`
decision above: registration updates are not advertised or automatically
retried without first reconciling the current resource.

## Bulk-create replay contract

The four bulk-create operations share the implementation in
`backend/app/services/idempotency.py`, regardless of whether they are reached
through REST or MCP:

1. The first successful `(operation scope, key)` request stores the canonical
   request hash, authenticated actor, and response in the same transaction as
   the created records.
2. The same actor, key, scope, and payload replays the stored response without
   executing the write again.
3. Changing the payload produces a conflict. Reuse by another actor also
   produces a conflict rather than disclosing the first actor's response.
4. Concurrent first uses are serialized by the database uniqueness constraint;
   the losing request receives a conflict and can retry to obtain the replay.
5. A key is guaranteed to replay for **72 hours from the first successful
   request**. At or after expiry it is treated as a new request and may execute
   again. Production cleanup deletes expired rows daily under
   `tjorim/apps#177`; the application does not run a local cleanup scheduler.

Callers should generate high-entropy values, retain them only for the retry
window, and reuse a value only for byte-equivalent intent. Tests for a replayed
write must cover identical replay, payload mismatch, actor isolation, the
concurrent-first-use conflict, and both sides of the 72-hour boundary.

## Preferred communication language

Public registration creation writes the explicitly selected communication language when it creates a new person. It preserves an existing person's preference unless the authenticated user already owns a registration for that person. Registration creation remains non-retryable: a client retry could create a duplicate registration, and the UI does not retry it automatically. An authorized owner's preference update is last-write-wins and transactionally committed with that registration.

`PUT /api/me/communication-preference` assigns one validated scalar value to every person attached to the authenticated user's registrations. Repeating the same request has the same resulting state, so the operation is idempotent and safe for a deliberate user retry. A repeated request that finds the value already applied creates no duplicate audit entry. The UI does not retry it automatically and reports success only after the response succeeds.

# Data retention scheduled jobs (#934)

`audit_entries.actor` is blanked to `""` 30 days after `timestamp` for rows written with `auth_source="token"` (a client IP recorded on a token-gated action such as guest check-in, which has no OIDC subject to record instead — see `write_audit_entry`'s `auth_source` parameter). This runs as a VPS-scheduled SQL job (`champagnefestival-redact-audit-entry-ips.sql`, `tjorim/apps#192`) on a daily systemd timer, not as in-process application code; nothing external retries it in the sense the rest of this inventory covers. The job's own `actor <> ''` guard makes a repeat run a no-op. It blanks every `auth_source="token"` row unconditionally rather than additionally pattern-matching for IP-shaped values — that `auth_source` is set only by this codebase's own writers, always paired with `get_client_ip`'s output (see `AuditEntry.actor`'s docstring), so there is no other value it could hold that would need protecting against, and blanking `get_client_ip`'s own "unknown" fallback is harmless since it was never personal data either. The two other sweeps this decision considered — `idempotency_keys` and `reservation_access_tokens` cleanup — already existed as the same kind of VPS-scheduled job before this work (`tjorim/apps#177`); see the idempotency contract above for the former.

Person anonymisation (`POST /api/people/{id}/anonymise`, see the inventory table above) is the one write in this decision that *is* a normal client-facing operation, admin-triggered rather than swept automatically.

# Central composer writes (#942)

Composed-message create/update (`POST`/`PUT /api/composer[/{id}]`) are **not
retry-safe**, the same category as announcement create/update above — no
idempotency key, admin client does not auto-retry. The composer form disables
submission and ignores submit events while saving; this prevents overlapping
browser submissions, but does not make creates idempotent. Create and merged
updates validate complete locale pairs and push payload size before persisting.

Scheduling revalidates content before changing state or enqueueing a job.
The admin UI displays scheduling failures and does not automatically retry.

Schedule/send (`POST /api/composer/{id}/schedule`) is **natural resource key,
convergent state only**. The message's `draft -> scheduled` transition and the
outbox enqueue happen in one transaction under the message row's own lock: a
retried *ambiguous* request either finds the transition already applied (state
is no longer `draft`, cleanly 409s) or, if the first attempt never committed,
applies it exactly once. A *deliberate* second call after a confirmed success
is rejected outright — this is not blind-retry-safe in the idempotency-key
sense, but an ambiguous network result never needs anything beyond reloading
the message before deciding whether to schedule again. The actual send
(`app.composer_delivery.deliver_composer_message_dispatch`, run by the outbox
worker) is itself convergent: it checks `state == "scheduled"` before doing
anything and no-ops if the message is already `sent`, so duplicate worker
execution (a recovered expired lease, #947's own retry) cannot create a second
announcement or double-enqueue the push jobs — each per-subscriber push job's
`deduplication_key` (`composer-push:{message_id}:{subscription_id}`) is a
second backstop against the same race.

Per-subscriber push delivery (`app.composer_delivery.deliver_composer_push`)
follows #941's admin test-send precedent exactly: at-least-once via the
outbox's lease/backoff, retiring the subscription on a 404/410 response
instead of retrying it.

# Announcement writes (#945)

Announcement create, update/publish/unpublish, reorder, and delete operations are
**not automatically retry-safe**. They commit their audit record atomically with
the state change, but do not accept an idempotency key. The admin client therefore
sets mutation retries to `false`; after an ambiguous response, an administrator
must reload the list before deciding whether to repeat the action. Reorder accepts
the complete ordered ID set and applies it in one locked transaction, so it cannot
leave a partial order. Create serializes its internal display-position allocation
with a transaction-scoped advisory lock; this prevents concurrent valid creates
from colliding, but does not make a client retry idempotent.


# Product inventory and package changes (#802)

Product creation/deletion and registration creation remain **not automatically
retry-safe**: no idempotency key is added. Reload after an ambiguous response.
Product and registration updates use absolute values, but may produce fresh audit
entries and notifications when repeated; clients must not automatically retry.

All product inventory edits and registration create/update/delete operations take
the event row lock before registration locks. Reservations are derived from
non-cancelled order quantities (including free items), so repeating an absolute
quantity/status update cannot increment a separate reservation counter. Existing
shortages may shrink; new reservations cannot worsen them. The concurrent last-unit
booking integration test verifies that only one booking succeeds.

`POST /api/products/{id}/preview` is read-only and rolls back its transaction.
Updates affecting existing package contents/prices or introducing a stock shortage
require its fingerprint, covering product configuration and booking/payment state.
A changed booking or configuration rejects a stale preview with 409. Shortages
also require explicit acknowledgement. The product, affected snapshots/totals,
audit records and notifications commit together. The fingerprint is a freshness
check, not an idempotency key; after an uncertain save, reload and preview again.
Tests cover a preview leaving stock unchanged and a competing booking invalidating
its fingerprint.

Registration notes are replaced as one value. Legacy `accessibility_note` request
input merges into notes for older callers; the response contains only notes.
`amount_paid`/`payment_status` are derived from the payment ledger (#1019, see
below) rather than settable directly; order reductions preserve the booking's
net paid total and expose overpayment as `refund_due` for a manual refund
transaction. Tests cover recorded payment preservation and booked-price
quantity changes.

Visitor booking change/cancellation requests use a client-generated submission
UUID. Replaying the same `POST /api/me/registrations/{id}/request` returns success
without creating another inbox item or audit entry. Organiser notification is
enqueued through the durable outbox exactly once, atomically with the stored
message (see the outbox enqueue inventory entry above); a replay does not enqueue
a second delivery job, and a transient delivery failure is retried by the outbox
worker's at-least-once, exponential-backoff delivery rather than being silently
dropped or left dependent on the client retrying the request. A request never
changes booking status, quantities, allocations or payment state.


# Product availability and visibility (#1020)

Replacing `Product.active` with `purchasable` (a single boolean covering both
standalone order availability and visitor visibility — a
`purchasable=False`, "hidden", product can still be an inclusion target of
another product, but is never orderable directly and never named to a
visitor, standalone or bundled) adds no new write endpoint: it is one more
field on the same `POST /api/products`, `PUT /api/products/{id}`, and
`POST /api/products/{id}/preview` writes the #802 section above already
covers, plus the equivalent MCP tools (`create_product`/`update_product`/
`delete_product`, following the same no-retry-key convention as the other
admin MCP CRUD tools). The retry-safety decision is unchanged: **not
automatically retry-safe** — reload after an ambiguous response rather than
resubmitting a create or update.

A `purchasable` change is now treated as a contents change for the existing
preview flow: `change_product` compares `purchasable` before/after alongside
`inclusions`/`included_product_id`/`included_per_guests`, so a change that
would show or hide this product's line in another package's visitor-facing
summary for an *existing* booking requires the same fresh-preview-fingerprint
round trip as an inclusion or price edit — `update_existing_contents` must be
set and the save must carry the `preview_token` from a preview computed after
the change, or the save 409s as stale. This is the same freshness check
described above, not a new idempotency mechanism: after an uncertain save,
reload and preview again rather than resubmitting the prior request.

Enforcement of the resulting `purchasable` value (only a purchasable product
is newly orderable standalone; a required product must be purchasable, a
constraint enforced at the schema, service, and database-check-constraint
layers) happens inside the same locked, transactional write as before — a
repeated identical request either commits once or is rejected consistently,
but is still not advertised as safe to retry automatically. There is no
longer a "disabled" state that blocks new bundling — a hidden product can
always be newly bundled into a package.


# Event plans and physical allocations (#802, second increment)

Layout create/copy now require an event and room; `(room_id, event_id)` is unique.
These writes still have no automatic retry: after an ambiguous response, reload
plans to find the result. Copy creates fresh table/area identities and never copies
allocations. Bulk layout creation retains its tested idempotency-key replay.
Event and room locks serialize plan creation against deletion/venue changes.
Room venue changes are rejected while plans exist; event venue changes must keep
all its rooms compatible. These absolute updates retain the no-automatic-retry
policy because audit entries and notifications may be repeated.

Registration `allocations` replaces the complete allocation list. REST and MCP
share the same service, lock the event, then the booking, then sorted table rows,
and commit allocations, quantities, stock effects, audit and notifications in one
transaction. Allocation replacement does not itself reserve or release product
stock. Cancellation clears allocations; reducing booked quantities must include
any necessary allocation adjustment. Table move/delete takes a table lock and
rejects allocated tables. Package changes cannot invalidate existing allocations.

No automatic retry is enabled for these writes. Repeating an allocation list
cannot add duplicate allocation rows, but may repeat audit/live effects. After an
ambiguous save, reload the booking and reconcile. The explicit capacity override
is a new confirmed request following a rejected save, not a blind retry, and
cannot override exclusivity. Tests cover split occupancy, exclusive claims,
partial assignment with unchanged stock, cancellation, copy isolation, atomic
rejection and concurrent claims on the last available seats.

The combined admin booking editor submits guest count, status, purchased
quantities, notes and the complete allocation list in the same absolute update.
It has no automatic retry. A table-quantity reduction cannot be submitted while
more tables remain allocated than purchased; the administrator chooses the
released allocation first. The backend validates and commits the quantity,
derived stock reservation, and allocation replacement in one transaction. After
an ambiguous response, reload the booking before editing or submitting again.
Recording a payment or refund is a separate, ledger-append write (#1019, see
the inventory entry above) rather than part of this absolute update — see the
next section.

# Payment ledger (#1019)

`POST /api/registrations/{id}/transactions` (mirrored by the MCP tool
`create_payment_transaction`) appends one immutable `PaymentTransaction` row —
a payment or refund — against a booking. There is no `kind` field: a
positive amount is a payment, a negative one is a refund, and that sign is
the only distinction stored. A refund never rewrites a prior entry; it's a
new row, optionally linked via `reversed_transaction_id` to the entry it
reverses. A PostgreSQL trigger (`payment_transactions_append_only`,
`app.payment_ledger_schema`) rejects UPDATE/DELETE against the table
unconditionally — the append-only contract holds even against a bug, a
future migration, or a direct psql session, not just against
`payments_service`'s own code path. The one bypass is `SET LOCAL
champagnefestival.allow_ledger_mutation = 'on'`, scoped to one transaction,
for administrative full-table resets (the test suite's between-test
cleanup) rather than a second database role. Every append recomputes
and stores `Registration.amount_paid`/`payment_status` from the ledger's sum
(`app.services.payments_service.sync_registration_payment_fields`), which also
runs whenever `amount_due` changes, so those two columns — and everything that
reads them (CSV exports, edition/person totals, the `RegistrationOut` schema)
— stay in sync with the ledger without every reader needing to join it
directly. `GET /api/registrations/{id}/transactions` returns the full
chronological ledger; every reported total (booking, edition, or person) is
traceable back to these rows.

Deleting a booking with recorded ledger entries is rejected (409):
`payment_transactions.registration_id` is `ON DELETE RESTRICT`, so a booking's
payment history cannot be silently lost by deleting the booking.

`payment_transactions` is created directly in migration 001 (no production
data predates it, so there was nothing to backfill from a prior mutable
`amount_paid` total — every booking's ledger simply starts empty).
