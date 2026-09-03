# Multi-worker state: rate limiter, live bus, metrics

**Status:** Decided — rate limiter and live bus; metrics deferred
**Date:** 2026-09-03
**Issue:** [#932](https://github.com/tjorim/champagnefestival/issues/932)

---

## Context

`app/ratelimit.py`, `app/live/bus.py`, and `app/observability.py` each keep
state in a module-level Python object, which is only correct with exactly one
backend worker process. #941 (Web Push) needs its admin test-send endpoint and
subscription-mutation rate limits to hold under more than one worker, so this
decision needs to land before #941's implementation starts, not just be
"discussed" — the issue itself proposes one direction per component, and this
document adopts them without changing the technical shape of what's proposed
there.

## Decisions

### 1. Rate-limit buckets — move behind a shared store

Adopt a Redis-backed `slowapi` storage backend (already a dependency,
`app/middleware.py`) instead of the in-process `dict`. This fixes both
problems described in the issue: cross-worker enforcement, and the unbounded
per-IP dict that never evicts an emptied deque. Do this together with #921's
keying changes rather than as a separate migration, since both touch the same
call sites.

Interim, until implemented: fix the leak on its own (drop a key when its
deque empties) — that part has no scaling dependency and shouldn't wait.

### 2. Live-update bus — Postgres `LISTEN`/`NOTIFY`

Adopt Postgres `LISTEN`/`NOTIFY` over Redis pub/sub: Postgres is already a
hard dependency, the payloads are small invalidation envelopes, and this adds
no new infrastructure. Each worker holds one dedicated `LISTEN` connection
that fans out to its local in-process `LiveBus`; publish with
`NOTIFY live_events, '<payload>'` inside the same transaction as the
mutation, replacing the current fire-and-forget `try/except` publish so
publication is transactional.

### 3. Metrics — defer, document the caveat

Do not build a shared metrics store now. Sentry already covers error
tracking; per-worker `GET /api/metrics` figures are a known, documented
limitation rather than a correctness bug like the other two. Label the
endpoint's response (or its docs) to state the figures are per-process until
multi-worker deployment is a firm plan.

### Interim deployment constraint

Until the rate limiter and live bus fixes above ship, `DEPLOYMENT.md` must
state the service runs single-worker — that constraint is currently only
discoverable by reading `bus.py`'s docstring.

## What this unblocks

#941's rate limiting (subscription mutation endpoints, admin test-send) can
be implemented against the Redis-backed limiter from decision 1 once it
ships. #941 does not need the live-bus or metrics decisions — it has no
SSE/live-update dependency — so it is not blocked on those two, only on the
rate-limiter migration landing (or, short term, on accepting single-worker
deployment for the admin test-send path, which is explicitly restricted to
administrators and low-volume by design).

## References

- [#932](https://github.com/tjorim/champagnefestival/issues/932) — original
  issue, including the author's proposed direction adopted here
- [#921](https://github.com/tjorim/champagnefestival/issues/921) — check-in
  rate limiting, to be migrated together with decision 1
- [#929](https://github.com/tjorim/champagnefestival/issues/929) — client-side
  reconnect recovery the live bus relies on
- `app/ratelimit.py`, `app/live/bus.py`, `app/observability.py`
