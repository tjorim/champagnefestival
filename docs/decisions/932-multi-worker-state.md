# Multi-worker state: rate limiter, live bus, metrics

**Status:** Implemented (2026-09-07). Rate limiter (Postgres-backed, corrected
from the original Redis proposal — see "Update" below) and live bus shipped;
metrics deferred and documented per decision 3. The blanket per-route default
limiter's proposed default (leave it per-process) was adopted as-is — see
"Implemented" below. **Decision 3's premise turned out to be wrong: Sentry
was never actually configured in production — see the correction under
decision 3 — a known gap the project owner chose to leave open for now.**
**Date:** 2026-09-03 (updated 2026-09-05, then 2026-09-06 — noted #992 as a
second consumer of decision 2's bus — then 2026-09-07 on implementation and
on the Sentry correction)
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

> **Correction (2026-09-07):** this decision's premise doesn't currently
> hold — `SENTRY_DSN` has never actually been set in production
> (`app/main.py` only calls `sentry_sdk.init` when it's configured; the
> project owner confirmed it isn't). So today there is no error tracking at
> all, not "Sentry instead of metrics" — `GET /api/metrics`'s per-process
> figures are the only backend observability that exists. The owner chose to
> leave this as a known gap for now rather than set up Sentry or build
> metrics as part of this issue; revisit before relying on either the
> "Sentry covers it" framing above or the per-process metrics number as a
> real operational signal.

### Interim deployment constraint

Until the rate limiter and live bus fixes above ship, `DEPLOYMENT.md` must
state the service runs single-worker — that constraint is currently only
discoverable by reading `bus.py`'s docstring. (In practice, neither
`champagnefestival-api` nor `worktime-api` runs multiple workers today per
`infra/compose.yaml` and their Dockerfiles' `CMD`, so this is a
forward-looking constraint, not a live bug — but it should still be written
down before anyone reaches for `--workers N` as an event-day scaling lever.)

## Implemented

**Decision 1 — narrower than "app/ratelimit.py's custom buckets" reads at first
glance.** Only check-in's two scopes (`check-in-ip`, `check-in-registration`)
moved to the Postgres-backed `check_rate_limit_pg` / `rate_limit_buckets`
table, exactly as named in this decision's own text. The other three scopes
`check_rate_limit` serves — `contact-submission`, `registration-create`,
`registration-access-request` — stay on the in-process deque. This wasn't
re-litigated during implementation: the decision text only ever named
check-in, and treating the rest as still-process-local is deliberately the
same "leave it, document it, revisit only if it turns out to matter"
treatment already given to slowapi's blanket limiter below, not an oversight.
`app/ratelimit.py`'s module docstring documents the split.

The SQL shipped is the same shape proposed above, with one change: the
interval arithmetic uses `make_interval(secs => :window_seconds)` rather than
binding a `timedelta` directly, to avoid asyncpg parameter-type inference
ambiguity in a raw `text()` query. Cleanup extends `app/worker.py`'s existing
daily loop (`cleanup_expired_rate_limit_buckets`), run alongside the outbox
cleanup it already does — as proposed, not a new scheduler.

**Decision 2 — every event now flows through `NOTIFY`/`LISTEN`, including a
worker's own.** All 22 `live_bus.publish` call sites (`check_in.py`,
`registrations.py`, `volunteer_ops.py`, `registrations_service.py`,
`people_service.py`, `tables_service.py`) were replaced with
`notify_live_event(db, event)` — a `SELECT pg_notify(...)` on the same
session, moved to immediately before `db.commit()` (every call site already
had the scope data — `event.edition_id` and similar — resolved before its
commit, so no site needed a new query to reorder this). A new
`app.live.listener.PgLiveListener`, modelled on `worktime`'s `sse_manager.py`
LISTEN half (dedicated asyncpg connection outside the SQLAlchemy pool,
reconnect with exponential backoff via `add_termination_listener`, graceful
degradation if setup fails), relays every notification — including ones the
same worker produced — into that worker's local `LiveBus`. There is
deliberately no "publish locally immediately, NOTIFY separately" fallback
path: every event reaches `LiveBus.publish` exactly once, uniformly, via the
listener, whether it originated in this worker or another one. Started/
stopped from `app.main`'s `_app_lifespan`.

Test fixtures needed one addition: `httpx.ASGITransport` (used by the
`client` fixture) never invokes FastAPI's lifespan, so `tests/conftest.py`
gained a session-scoped `pg_live_listener` fixture that runs the real
listener against `TEST_DATABASE_URL` for the whole test session — the same
path production uses, not a test-only shortcut. `tests/test_live_broadcasts.py`
switched from `queue.get_nowait()` to an awaited, timeout-bounded read, since
delivery is now genuinely asynchronous (a real NOTIFY round trip) even within
one process, not a synchronous in-process call.

**Decision 3 — documented, not built.** `GET /api/metrics` gained a
`per_process: true` response field and a docstring caveat pointing at this
decision; no shared store was added.

**Interim deployment constraint — written down as proposed.**
`DEPLOYMENT.md` now states the single-worker requirement and names the two
remaining process-local exceptions (slowapi's blanket limiter, the in-memory
metrics collector).

## What this unblocks

#941's rate limiting (subscription mutation endpoints, admin test-send) can
be implemented against the Postgres-backed limiter from decision 1 once it
ships. #941 does not need the live-bus or metrics decisions — it has no
SSE/live-update dependency — so it is not blocked on those two, only on the
rate-limiter migration landing (or, short term, on accepting single-worker
deployment for the admin test-send path, which is explicitly restricted to
administrators and low-volume by design).

#992's live-rendered `/` and `/privacy` (see
[`992-live-public-render.md`](./992-live-public-render.md)) is a second,
later consumer of decision 2's `LISTEN`/`NOTIFY` bus, for a different reason
than #941: #992 ships a 60-second TTL render cache as its own correctness
floor regardless of worker count, and explicitly defers *proactive*
cache invalidation on FAQ/edition/policy mutations until this decision's bus
exists to carry it to every worker — under today's single worker, proactive
invalidation happens to work by accident, and #992 declines to build on that
accident. This is a read of #992's design against this document, not a change
to the scope decided above: #992 needs its own `NOTIFY` channel (a render
cache invalidated by "FAQ changed" is a different message than "an SSE client
needs this event," so it should not simply overload `live_events` with a
second payload shape) — worth keeping in mind so decision 2's implementation
doesn't hard-code a single-channel, single-consumer assumption that #992
would then have to work around.

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
- [#992](https://github.com/tjorim/champagnefestival/issues/992) — a second
  consumer of decision 2's bus, for render-cache invalidation rather than
  SSE fan-out; proposed in
  [`docs/decisions/992-live-public-render.md`](992-live-public-render.md)
- `tjorim/apps`'s `infra/compose.yaml` — confirms no Redis in the deployed
  stack
- `tjorim/worktime`'s `backend/app/utils/sse_manager.py` — working
  Postgres `LISTEN`/`NOTIFY` precedent for decision 2, and the sibling app
  with the same unaddressed rate-limiter gap as decision 1
- `app/ratelimit.py`, `app/live/bus.py`, `app/observability.py`,
  `app/middleware.py`
