# Observability Contract

This document describes the observability guarantees that apply to every HTTP request handled by the Champagne Festival backend. **Any new route must be added through the standard FastAPI router so it automatically inherits this contract.**

---

## X-Request-ID

| Behaviour | Detail |
|---|---|
| **Generation** | If the incoming request carries no `X-Request-ID` header, the middleware generates a UUID4 and assigns it. |
| **Propagation** | If the incoming request supplies `X-Request-ID`, that value is used unchanged. |
| **Echo** | Every response carries `X-Request-ID` in its headers regardless of status code. |
| **Scope** | The ID is stored in `request.state.request_id` and is available to all downstream handlers. |
| **CORS** | `X-Request-ID` is listed in both `allow_headers` (clients may send it) and `expose_headers` (browsers may read it). |

---

## Structured Request Log

Every request emits one log line via the `app.observability` logger after the response is sent. Format:

```
request completed request_id=<uuid> method=<METHOD> path=<path> status=<code> latency_ms=<float> user_id=<sub|None> auth_type=<oidc|None>
```

### Log fields

| Field | Notes |
|---|---|
| `request_id` | UUID4 (generated or propagated). |
| `method` | HTTP verb. |
| `path` | URL path only — **query parameters are never logged** to prevent token leakage. |
| `status` | HTTP response status code. |
| `latency_ms` | Wall-clock time in milliseconds from first byte to response headers sent. |
| `user_id` | OIDC `sub` claim of the authenticated caller. `None` for unauthenticated requests. |
| `auth_type` | `"oidc"` when a valid Bearer JWT was presented. `None` for unauthenticated requests. |

---

## Health Endpoints

| Endpoint | Auth | Behaviour |
|---|---|---|
| `GET /api/health/liveness` | None | Returns `{"status": "alive"}` immediately. |
| `GET /api/health/readiness` | None | Checks database and OIDC JWKS connectivity. Returns 200 or 503. |
| `GET /api/health` | None | Returns liveness status and links to the readiness and metrics endpoints. |

Use `/api/health/readiness` for load-balancer health checks — not liveness.

---

## Metrics Endpoint

| Endpoint | Auth |
|---|---|
| `GET /api/metrics` | `X-Metrics-Secret` header (HMAC constant-time comparison) |

Returns in-process counters: uptime, request total, error total, request rate, error rate, and latency percentiles (avg, p50, p99).

**Important:** metrics are **process-local** and reset on every restart. Not aggregated across workers.

---

## Error Tracking (Sentry)

Sentry is initialised at startup if `SENTRY_DSN` is set. The SDK is an optional install (`sentry-sdk[fastapi]`). Unhandled exceptions are captured via `sentry_sdk.capture_exception()`. `send_default_pii` should be set to `False` to prevent capturing IP addresses and cookies.

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

`extractErrorMessage` in `frontend/src/utils/adminFetch.ts` reads the `X-Request-ID` response header and appends it to every API error string:

```
Registration not found [request-id: 3fa85f64-…]
```

This lets operators correlate a UI error directly with a backend log line without opening browser devtools.

---

## Adding a New Route — Checklist

- [ ] Route is added via `app.include_router(...)` — not via `app.mount()` with a sub-app that bypasses middleware.
- [ ] If the route accepts credentials in a query parameter, verify that `request.url.path` (not `request.url`) is what gets logged.
- [ ] If the route introduces a new auth mechanism, ensure it sets `request.state.user_id` and `request.state.auth_type`.
- [ ] Event-day mutation routes write an `AuditEntry` via `write_audit_entry()` — see `app/audit.py`.
