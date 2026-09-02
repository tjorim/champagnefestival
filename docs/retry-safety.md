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
| Public and volunteer registration check-in | Event-day Android, browser, and volunteer clients | **Natural-key upsert.** Registration ID is the stable key; checked-in and strap-issued flags only converge from false to true. A repeat returns the current registration and reports that it was already checked in. The strict bucket is per registration, so one guest's retries do not consume another registration's allowance; a separate shared-IP abuse ceiling can still reject unrelated registrations when the venue-wide ceiling is exceeded. |
| Updates (`PUT`), including registration party-size/table assignment/over-capacity confirmations, table-type capacity changes, registration order/delivery updates, application settings, venue details/coordinates, and FAQ reorder | Browser, volunteer, and MCP admin clients | **Not retry safe.** They currently have no version precondition; clients must read and reconcile after an ambiguous result. Seating and event-capacity writes use row locks to preserve capacity decisions, and an over-capacity confirmation is separately audited, but replay can still produce a second audit entry or overwrite newer state. Registration party-size/order updates re-resolve authoritative product data and preserve delivery counts, while volunteer delivery updates change only delivery counts. Clients must reconcile before retrying; optimistic concurrency is preferred if automatic retries are added. |
| Deletes, account/token revocation, and integration-client revocation | Browser and MCP admin clients | **Natural resource key, convergent state only.** Repeating reaches the same absent/revoked state, although the response can change to not-found. Callers needing the original response must reconcile. |
| Contact submission (`POST /api/contact`) | Public browser | **Client-generated resource ID.** The browser retains one UUID for an attempt; repeating it returns success without inserting another message or sending another notification. A fresh form submission gets a fresh UUID. |
| Mark contact message handled (`PUT /api/contact/{id}/handled`) | Admin browser | **Natural-key upsert.** The first call records `handled_at`; repeats preserve that timestamp and return the same handled state. |
| Claim registrations (`POST /api/me/registrations/claim`) | Signed-in browser | **Not retry safe with the same access token.** The write itself is convergent because only unowned registrations are linked, but the email access token is consumed atomically with the claim. After an ambiguous response, callers must reconcile through `GET /api/me/registrations` instead of replaying the token. |
| Access registrations (`POST /api/registrations/my/access`) | Public browser | **Not retry safe with the same access token.** A successful exchange expires the single-use token. Before its one-shot mutation, the browser removes the token from the URL, then keeps returned guest data in memory; an ambiguous response requires requesting a new link. |
| Single creates, layout copy, people merge, registration creation, registration-access email request, Pebble token creation, and integration-client creation/rotation | Browser, public clients, and MCP automation | **Not retry safe.** Server-generated identity or an external side effect makes blind retry unsafe. Use server-side replay or a client-generated resource ID before adding automatic retries. Secret-returning operations must not gain replay storage without a separate security review. |
| Outbox enqueue within registration creation | Backend transaction | **Natural resource key.** The unique `registration-confirmation:{registration_id}` key permits one confirmation job per registration, and the job is committed atomically with the registration. This does not make registration creation itself retry safe because a repeated create receives a new registration ID. |
| Outbox delivery attempts | Supervised worker | **At-least-once delivery.** A lease and atomic `SKIP LOCKED` claim prevent concurrent workers from owning the same live attempt, and expired claims recover after a crash. A process failure after SMTP accepts a message but before the result commits is inherently ambiguous and can cause a duplicate email; consumers must tolerate duplicates. Retries are bounded and use exponential backoff before terminal failure. |

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
# Announcement writes (#945)

Announcement create, update/publish/unpublish, reorder, and delete operations are
**not automatically retry-safe**. They commit their audit record atomically with
the state change, but do not accept an idempotency key. The admin client therefore
sets mutation retries to `false`; after an ambiguous response, an administrator
must reload the list before deciding whether to repeat the action. Reorder accepts
the complete ordered ID set and applies it in one locked transaction, so it cannot
leave a partial order.
