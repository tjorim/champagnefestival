# Multi-worker state: rate limiter, live bus, metrics

**Status:** Decided — rate limiter (Postgres-backed, corrected from the
original Redis proposal — see "Update" below) and live bus; metrics deferred.
One sub-detail (the blanket per-route default limiter) is a proposed default,
flagged for confirmation.
**Date:** 2026-09-03 (updated 2026-09-05)
**Issue:** [#932](https://github.com/tjorim/champagnefestival/issues/932)

---

## Update: Redis-backed rate limiter corrected to Postgres-backed

The original version of this document adopted "a Redis-backed `slowapi`
storage backend" for decision 1 below. That was wrong to treat as settled:
the production infra stack (`tjorim/apps`'s `infra/compose.yaml`) runs
`caddy`, `postgres`, `keycloak`, and `pgadmin` alongside the app API
containers — there is no Redis service, and no plan to add one. Issue #932's
own text only offered Redis as one option ("slowapi supports a Redis storage
backend, and the hand-rolled limiter *could* move behind the same store"),
not a requirement; this document shouldn't have picked it without checking
it against what's actually deployable.

Decision 1 below now proposes a Postgres-backed atomic counter instead,
using the database this service already depends on hard. Three things
support that direction over standing up Redis:

- **Precedent already in production.** `worktime` (a sibling app on the same
  infra stack) already solves the equivalent live-bus problem — broadcasting
  an event to every worker process — with Postgres `LISTEN`/`NOTIFY`
  (`backend/app/utils/sse_manager.py`), which is exactly decision 2 below.
  It also has the identical unaddressed rate-limiter gap (slowapi with no
  `storage_uri`, so per-worker not global) — so this decision, once
  implemented, is a pattern `worktime` can reuse rather than a
  champagnefestival-only fix.
- **No traffic profile that needs Redis's speed.** This is a small event
  site, not a high-QPS service; the endpoints this limits (registration,
  check-in, contact form) already do a Postgres write in the same request,
  so one more small indexed `UPSERT` is marginal overhead, not a new
  bottleneck.
- **Avoids a second stateful service.** Redis would mean a new thing to
  size, back up, and patch on the VPS, for a benefit (sub-millisecond
  counters) this app's actual load doesn't need.

## Context

`app/ratelimit.py`, `app/live/bus.py`, and `app/observability.py` each keep
state in a module-level Python object, which is only correct with exactly one
backend worker process. #941 (Web Push) needs its admin test-send endpoint and
subscription-mutation rate limits to hold under more than one worker, so this
decision needs to land before #941's implementation starts, not just be
"discussed."

Note: the "unbounded per-IP dict that never evicts" half of the original
issue is already fixed independently of this decision — `app/ratelimit.py`
now caps `_rate_limit_buckets` and evicts expired/oldest entries
(`_evict_expired_or_oldest_bucket`, shipped in #948). What's left here is
purely the cross-worker enforcement problem.

## Decisions

### 1. Rate-limit buckets — move behind a shared Postgres store

Two independent limiters exist today, and this decision treats them
differently:

**`app/ratelimit.py`'s custom buckets** (check-in's per-registration limit
and shared-IP backstop — the security/abuse-sensitive paths, per #921's
already-shipped keying work) move to a Postgres-backed atomic counter:

- A `rate_limit_buckets` table: `key TEXT PRIMARY KEY` (the existing
  `(scope, client_ip)` tuple key, serialised), `window_start TIMESTAMPTZ NOT
  NULL`, `count INTEGER NOT NULL`.
- One atomic round trip per check, no read-then-write race:
  ```sql
  INSERT INTO rate_limit_buckets (key, window_start, count)
  VALUES ($1, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN rate_limit_buckets.window_start <= now() - $2::interval
             THEN 1 ELSE rate_limit_buckets.count + 1 END,
    window_start = CASE WHEN rate_limit_buckets.window_start <= now() - $2::interval
                    THEN now() ELSE rate_limit_buckets.window_start END
  RETURNING count;
  ```
  Compare the returned `count` against the limit. This is a **fixed-window**
  counter, not the current sliding-window deque — a deliberate simplification
  (a burst can allow up to ~2x the limit right at a window boundary) in
  exchange for an O(1), single-round-trip, race-free check. That's the
  standard tradeoff most production rate limiters make at this scale, and
  it's a behaviour change worth calling out explicitly rather than silently.
- Cleanup: extend the existing daily worker sweep (`backend/app/worker.py` —
  the same loop #934's decision doc proposes extending for anonymisation)
  with `DELETE FROM rate_limit_buckets WHERE window_start < now() -
  interval '1 day'`. No new scheduling infrastructure. The table stays small
  — one row per distinct `(scope, client_ip)` active in the current window.
- No new dependency: reuses the connection pool this service already holds.

**Proposed default, flagged for confirmation:** slowapi's separate blanket
per-route default limiter (`app/middleware.py`, `60/minute` per IP per
route, applied to everything except the two check-in routes above) is
**not** migrated in this decision. The `limits` library slowapi sits on top
of has no built-in Postgres storage backend (only memory, Redis, memcached,
MongoDB, etcd) — writing and maintaining a custom async storage backend just
for this generic backstop isn't worth it relative to what it protects.
Leave it per-process, documented the same way decision 3 documents the
metrics caveat below, and revisit only if it turns out to matter in
practice. The security-critical paths (check-in, registration) are the ones
getting real cross-worker enforcement.

### 2. Live-update bus — Postgres `LISTEN`/`NOTIFY`

Adopt Postgres `LISTEN`/`NOTIFY` over Redis pub/sub: Postgres is already a
hard dependency, the payloads are small invalidation envelopes, and this adds
no new infrastructure. Each worker holds one dedicated `LISTEN` connection
that fans out to its local in-process `LiveBus`; publish with
`NOTIFY live_events, '<payload>'` inside the same transaction as the
mutation, replacing the current fire-and-forget `try/except` publish so
publication is transactional. (`worktime`'s `sse_manager.py` already does
almost exactly this, per the "Update" section above — worth reading as a
working reference before implementing.)

### 3. Metrics — defer, document the caveat

Do not build a shared metrics store now. Sentry already covers error
tracking; per-worker `GET /api/metrics` figures are a known, documented
limitation rather than a correctness bug like the other two. Label the
endpoint's response (or its docs) to state the figures are per-process until
multi-worker deployment is a firm plan.

### Interim deployment constraint

Until the rate limiter and live bus fixes above ship, `DEPLOYMENT.md` must
state the service runs single-worker — that constraint is currently only
discoverable by reading `bus.py`'s docstring. (In practice, neither
`champagnefestival-api` nor `worktime-api` runs multiple workers today per
`infra/compose.yaml` and their Dockerfiles' `CMD`, so this is a
forward-looking constraint, not a live bug — but it should still be written
down before anyone reaches for `--workers N` as an event-day scaling lever.)

## What this unblocks

#941's rate limiting (subscription mutation endpoints, admin test-send) can
be implemented against the Postgres-backed limiter from decision 1 once it
ships. #941 does not need the live-bus or metrics decisions — it has no
SSE/live-update dependency — so it is not blocked on those two, only on the
rate-limiter migration landing (or, short term, on accepting single-worker
deployment for the admin test-send path, which is explicitly restricted to
administrators and low-volume by design).

## References

- [#932](https://github.com/tjorim/champagnefestival/issues/932) — original
  issue
- [#921](https://github.com/tjorim/champagnefestival/issues/921) — check-in
  rate limiting keying work, already shipped, that decision 1 builds on
- [#929](https://github.com/tjorim/champagnefestival/issues/929) — client-side
  reconnect recovery the live bus relies on
- [#934](https://github.com/tjorim/champagnefestival/issues/934) — the
  worker sweep loop decision 1's cleanup extends is proposed in
  [`docs/decisions/934-data-retention-and-erasure.md`](934-data-retention-and-erasure.md)
- `tjorim/apps`'s `infra/compose.yaml` — confirms no Redis in the deployed
  stack
- `tjorim/worktime`'s `backend/app/utils/sse_manager.py` — working
  Postgres `LISTEN`/`NOTIFY` precedent for decision 2, and the sibling app
  with the same unaddressed rate-limiter gap as decision 1
- `app/ratelimit.py`, `app/live/bus.py`, `app/observability.py`,
  `app/middleware.py`
