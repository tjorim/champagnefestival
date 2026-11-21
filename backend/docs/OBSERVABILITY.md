# Observability Contract

This document describes the observability guarantees that apply to every HTTP request handled by the Champagnefestival backend. **Any new route must be added through the standard FastAPI router so it automatically inherits this contract.**

---

## X-Request-ID

| Behaviour | Detail |
|---|---|
| **Generation** | If the incoming request carries no usable `X-Request-ID` header, the middleware generates a UUID4 and assigns it. |
| **Propagation** | If the incoming request supplies `X-Request-ID` and it is a short token (`[A-Za-z0-9._:-]{1,128}`), that value is used unchanged. Anything else is replaced by a UUID4, so a caller cannot put arbitrary text into the log lines. |
| **Echo** | Every response carries `X-Request-ID` in its headers regardless of status code. The JSON 500 for an unhandled exception (`{"detail": "Internal server error", "code": "internal_error"}`) carries it too. |
| **Scope** | The ID is stored in `request.state.request_id` and in the `current_request_id` context variable (`app.middleware.request_id`), available to all downstream handlers. |
| **CORS** | `X-Request-ID` is listed in both `allow_headers` (clients may send it) and `expose_headers` (browsers may read it). |

The middleware is `app.middleware.request_id.RequestIdMiddleware`, a pure ASGI middleware (no buffering of streamed responses). It also records every request in the in-process metrics behind `GET /api/metrics`.

---

## Structured Request Log

Every request emits one JSON line on the `champagnefestival.access` logger after the response has started, inside the shared log layout `asctime - logger - level - message` (`app.core.logging.LOG_FORMAT`). The field names are the same in every app. Example:

```
{"event":"http_request","request_id":"<uuid>","user_id":"<sub|null>","auth_type":"<keycloak_user|null>","method":"GET","route":"/api/events/{event_id}","status_code":200,"latency_ms":1.23}
```

Responses with status 5xx log at `ERROR`, 4xx at `WARNING`, the rest at `INFO`.

### Log fields

| Field | Notes |
|---|---|
| `event` | Always `http_request`. |
| `request_id` | The validated or generated ID. |
| `user_id` | OIDC `sub` claim of the authenticated caller. `null` for unauthenticated requests. |
| `auth_type` | `keycloak_user`, `keycloak_service` or `delegated` once a Bearer JWT has been accepted (`app.core.auth.AuthType`). `null` for unauthenticated requests. |
| `method` | HTTP verb. |
| `route` | The route **template** (`/api/events/{event_id}`), `unmatched` when nothing matched. Never the raw path or the query string, which can carry registration and check-in tokens and ids. |
| `status_code` | HTTP response status code. |
| `latency_ms` | Wall-clock time in milliseconds until the response headers are sent (for a streamed response, the time to the first byte). |

---

## Health Endpoints

| Endpoint | Auth | Behaviour |
|---|---|---|
| `GET /api/health/liveness` | None | Returns `{"status": "alive"}` immediately. |
| `GET /api/health/readiness` | None | Checks database and OIDC JWKS connectivity. `{"status": "ready"}`, or 503 `{"status": "not_ready"}`. |
| `GET /api/health` | None | Static summary: `status`, `version`, `commit` and the paths of the two probes (`liveness_endpoint`, `readiness_endpoint`). The image `HEALTHCHECK` uses it. |

Use `/api/health/readiness` for load-balancer health checks — not liveness.

---

## Metrics Endpoint

| Endpoint | Auth |
|---|---|
| `GET /api/metrics` | `X-Metrics-Token` header: `<unix-timestamp>:<hex-hmac-sha256>`, HMAC computed over the timestamp with `METRICS_HMAC_SECRET` |

Returns in-process counters: uptime, request total, error total, request rate, error rate, and latency percentiles (avg, p50, p99).

Tokens older than `METRICS_TOKEN_MAX_AGE_SECONDS` (60s) are rejected, so a leaked token has a narrow window of use — unlike a static shared secret, which is valid forever once leaked. Build a token with `app.routers.health.build_metrics_token(secret)`, e.g.:

```bash
python -c "from app.routers.health import build_metrics_token; print(build_metrics_token('$METRICS_HMAC_SECRET'))"
curl -H "X-Metrics-Token: $(python -c "from app.routers.health import build_metrics_token; print(build_metrics_token('$METRICS_HMAC_SECRET'))")" https://champagnefestival.tjor.im/api/metrics
```

**Important:** metrics are **process-local** and reset on every restart. Not aggregated across workers.

---

## Rate Limiting

A general, configurable per-IP and route-template rate limiter (`RATE_LIMIT_ENABLED` / `RATE_LIMIT_DEFAULT`, via a global FastAPI dependency and `limits`) covers included routers. Token-gated check-in routes are exempt and retain their database-backed per-registration and shared-IP policy. Registration creation retains its additional purpose-specific limit (`app/core/ratelimit.py`). Mounted `/mcp` uses its own authentication and integration-client rate policy. See the backend README for rollout guidance following #1497.

---

## Host Header Validation

`TRUSTED_HOSTS` (comma-separated) configures Starlette's `TrustedHostMiddleware`, rejecting requests whose `Host` header doesn't match. Required in production; disabled when empty (the development default).

---

## Error Tracking (Sentry)

Sentry is initialised at startup if `SENTRY_DSN` is set. The SDK is an optional install (`sentry-sdk[fastapi]`). Unhandled exceptions are captured via `sentry_sdk.capture_exception()`. `send_default_pii` should be set to `False` to prevent capturing IP addresses and cookies.

`SENTRY_TRACES_SAMPLE_RATE` (0.0-1.0, default `0.0`) controls performance transaction sampling; `0.0` disables performance tracing while leaving error tracking unaffected.

---

## Coverage Across Route Types

| Route type | Middleware | `user_id` logged | `auth_type` logged |
|---|---|---|---|
| Admin routes (`require_admin`) | ✓ | ✓ (OIDC sub) | `"oidc"` |
| Volunteer routes (`require_volunteer`) | ✓ | ✓ (OIDC sub) | `"oidc"` |
| Self-service routes (`get_current_claims`) | ✓ | ✓ (OIDC sub) | `"oidc"` |
| Token-gated public routes (`get_actor_id`) | ✓ | ✗ (not set) | ✗ |
| Unauthenticated routes | ✓ | `None` | `None` |

---

## Frontend Error Correlation

`extractErrorMessage` in `frontend/src/lib/api/adminFetch.ts` reads the `X-Request-ID` response header and appends it to every API error string:

```
Registration not found [request-id: 3fa85f64-…]
```

This lets operators correlate a UI error directly with a backend log line without opening browser devtools.

---

## Adding a New Route — Checklist

- [ ] Route is added via `app.include_router(...)` — not via `app.mount()` with a sub-app that bypasses middleware.
- [ ] If the route accepts credentials in a query parameter, verify that `request.url.path` (not `request.url`) is what gets logged.
- [ ] If the route introduces a new auth mechanism, ensure it sets `request.state.user_id` and `request.state.auth_type`.
- [ ] Event-day mutation routes write an `AuditEntry` via `write_audit_entry()` — see `app/services/audit_service.py`.

---

## Profiling

To find out *why* a request identified by `X-Request-ID` and `latency_ms` is slow, profile it locally with the standard-library sampling profiler. See [PROFILING.md](PROFILING.md).
