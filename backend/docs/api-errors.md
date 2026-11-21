# API error contract

Every JSON error the API sends has `detail` and a stable `code`. `detail` is an English diagnostic for developers, logs
and MCP callers; the interface shows its own translation, chosen by `code` (see `frontend/src/lib/api/apiErrors.ts`).
Clients must never branch on the wording of `detail`.

| Key | Type | Notes |
|---|---|---|
| `detail` | string (a list for a 422) | Diagnostic text. Never a stack trace, an exception message or a secret. |
| `code` | string | Stable, machine-readable, lowercase snake_case. Always present. |
| `error` | string | Only on the general rate limit's 429, the same text as `detail`; kept for clients that read it. |

The shared handlers live in `app/core/errors.py` and are registered in `app/main.py`; `ApiHTTPException` (the codes the
application chooses) lives in `app/services/errors.py`.

## Where the body comes from

| Failure | Status | `code` | Handler |
|---|---|---|---|
| `ApiHTTPException` raised by a route or service | its own | its own (`table_over_capacity`, ...) | `api_http_exception_handler` (`app/main.py`) |
| Framework or dependency `HTTPException` (unknown route, wrong method, a bare 401/403, an uncoded service error) | its own | `bad_request` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `method_not_allowed` (405), else `http_<status>` | `handle_http_exception` |
| Request validation | 422 | `validation_error` | `handle_validation_error` |
| General rate limit | 429 | `rate_limited` | `general_rate_limit_exceeded` (`app/main.py`) |
| Unhandled exception | 500 | `internal_error` | `RequestIdMiddleware`, `handle_unhandled_exception` |

- `handle_http_exception` keeps `detail` as it was and adds `code` only when the exception has none (the handler for an
  `ApiHTTPException` is more specific, so a coded error never reaches it). Headers (`WWW-Authenticate`, `Retry-After`,
  `Allow`) are passed on; a bodiless status (204, 304) stays bodiless.
- A 422 keeps FastAPI's `detail` list of `{type, loc, msg}` entries. `input` and `ctx` are dropped from every entry:
  they echo what the caller sent and can carry secrets or personal data. The frontend reads `loc` to mark the fields,
  so the list shape is unchanged.
- The general rate limit's 429 is `{"error": "Rate limit exceeded: ...", "detail": "<same text>", "code":
  "rate_limited"}` with `Retry-After`, the `X-RateLimit-*` headers and `Cache-Control: no-store`. Purpose-specific 429s
  are `ApiHTTPException`s with `rate_limited` and their own headers.
- An unhandled exception answers `{"detail": "Internal server error", "code": "internal_error"}`. The stack trace is
  logged server side (and sent to Sentry when configured); the body never names the cause. The response carries
  `X-Request-ID`, which is also in the access log line, so a report can be traced. `RequestIdMiddleware` answers
  exceptions raised below it; the handler registered for `Exception` covers one raised outside it (Starlette's
  `ServerErrorMiddleware`, which bypasses user middleware) and attaches the id from `request.state` itself.

## Not covered

`IntegrityError` (a database constraint) answers status 409 with `{"detail": ..., "code": ...}`; the code names the
failed constraint (`required_field_missing` 23502, `related_records_exist` 23503, `duplicate_value` 23505,
`constraint_violation` 23514 and unknown). OpenAPI documents only FastAPI's default 422 schema, not the generic error
body.

`tests/test_error_contract.py` runs the assembled app and pins this contract; `tests/core/test_errors.py` covers the
handlers in isolation.
