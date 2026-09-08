# Multi-worker state: rate limiter, live bus, metrics

**Status:** Implemented in #1011; #932 closed. On 2026-09-08 the project owner
accepted one production API worker. Multiple workers are not planned unless
measured event-day load demonstrates a need.

## Decision 1 — rate limits

Use atomic PostgreSQL fixed-window counters for check-in and public push
subscription mutations. PostgreSQL is already required; adding Redis was
rejected. Counter cleanup runs in the outbox worker's daily sweep.

Custom contact, registration creation/access, visitor magic-link, admin push
test-send, and composer scheduling limits remain process-local, as does
slowapi's blanket limiter. These are accepted under the single-worker scope.
The custom in-memory buckets already cap size and evict expired/oldest keys.
Review every remaining local scope before introducing replicas or more workers.

## Decision 2 — transactional live updates

Publish `pg_notify` in the same database transaction as each mutation. A
persistent LISTEN connection per API worker relays events into its local SSE
bus, including events originating in that worker. There is no second direct
local publish, which would duplicate delivery. Reconnect uses backoff.

#992 also uses PostgreSQL notifications, with a separate render-cache channel
and listener for FAQ, edition/event, and policy publication changes. Its
repository implementation is complete; infrastructure activation remains open.
#941 uses the shared counter; #942 reuses the accepted local admin limiter.

## Decision 3 — metrics and deployment

`GET /api/metrics` explicitly reports `per_process: true`. No shared metrics
store is planned. The original rationale incorrectly assumed Sentry was
configured; the owner confirmed it was not and accepted that observability
gap. Do not assume error tracking is enabled without checking deployment.

[Deployment guidance](../../DEPLOYMENT.md) records the one-worker constraint.
It applies to API processes/replicas, not the separately supervised outbox
worker described in [outbox operations](../outbox-worker.md).

## Historical context

This records a past decision, not a permanent design constraint. Revise or
supersede it when requirements change; archived proposals are reference only.
See [revising decisions](../README.md#revising-decisions).

Consolidated 2026-09-08. Original proposals and implementation history remain
in Git at `88396baf3275ae40cdd907239a0df6a04baed137`; they are not current requirements.
