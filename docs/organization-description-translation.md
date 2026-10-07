# Organisation description drafts (#1195)

UI terminology: [organisation / organisatie / organisation](decisions/1190-organisation-terminology.md). The full technical rename and migration are recorded there.

Admins and current organization contacts can explicitly request an editable machine
translation. Requests never create a proposal, change live descriptions, enqueue
notifications or record the text in an audit log. The regular save/submit flow
still determines publication: manager edits stay private until accepted by an
admin. No machine-origin flag is stored.

## Configuration and production gate

- `TRANSLATION_SERVICE_URL`: trusted, self-hosted LibreTranslate base URL. Empty
  (the default) disables the action. Example: `http://172.18.0.1:5001`.
- `TRANSLATION_LANGUAGES`: comma-separated loaded site languages; defaults to
  `nl,en`. At least two of `nl,fr,en` are required. Enable French only after the
  service has the relevant models and supported pairs verified.

The UI gets supported languages from the backend; it does not hard-code service
availability. Production connectivity, env provisioning, shared-worker contention
with Travel and the French decision remain in
[tjorim/apps#263](https://github.com/tjorim/apps/issues/263). This repository does
not run or change the translation service. The infra checkout is separate: set
these variables in `infra/champagnefestival.env.example` and the Ansible-rendered
env file there after verifying a cold-start request from `champagnefestival-api`.

## API

| Scope | Capabilities | Draft |
| --- | --- | --- |
| Admin | `GET /api/organizations/translation` | `POST /api/organizations/translation` |
| Current contact | `GET /api/me/organizations/{id}/translation` | `POST /api/me/organizations/{id}/translation` |

Admin routes require the Keycloak admin role. Manager routes use the shared
email/OIDC account and check the organization's current contact email on every
request, using the same authorisation as the manager proposal form. An unrelated
visitor, member or volunteer has no manager access. Ownership reads do not lock
the organization during the service request.

Capabilities return `{"languages":["nl","en"]}` (or `[]` when disabled).
Draft requests take `{"text":"Hallo","source":"nl","target":"en"}` and return
`{"text":"Hello"}`. Source and target must differ and both be configured.
Source text is non-blank, at most 600 characters; an empty, malformed or overlong
service draft is rejected rather than silently truncated. Responses use
`Cache-Control: no-store`. OpenAPI exposes the request/response schemas.

- `401`/`403`: missing identity or missing admin role.
- `404`: organization does not belong to the current contact.
- `422`: invalid text or unsupported language pair.
- `429`: five requests per ten minutes exceeded, with `Retry-After: 600`.
- `503`: disabled, worker busy, unreachable or invalid service response.
- `504`: service timeout.

Limits are keyed to authenticated identity across all organizations and languages,
which is stricter than per-session enforcement: token refresh or another session
cannot reset a bucket. They apply even when general rate limiting is disabled.
The bounded process-local limiter and single in-flight request lock use the
accepted one-API-worker production boundary (#932). A burst is rejected rather
than queued. Travel has its own caller, so this lock does not coordinate both
applications; infra owns their shared-worker contention decision.

The client uses a 90-second timeout and sends one bounded plain-text request per
target, without automatic retries or redirects. Ambient HTTP proxy variables are
ignored, so the configured service receives the text directly. Text and service
error bodies are neither logged nor returned in errors. The service URL is an
operator setting, never a caller-supplied URL.

## Editing and retries

The suggestion is disabled for blank source text or a non-empty translation;
clear an existing translation to request a replacement. During the cold-start
wait, manual editing continues. A response is discarded if source language,
source text or target text changed, or if the editor was closed. Admin results
also respect the existing session fence. Errors leave manual translation usable.
The draft is local form state until a person saves or submits it.

Repeating a draft request is harmless to application content, but consumes the
rate limit and service CPU and may produce a different result. No automatic
retry is configured. See [retry safety](retry-safety.md).

## Acceptance

- [x] Admin and live manager scope can request bounded, editable drafts.
- [x] Drafting persists no organization change, proposal, notification or audit text.
- [x] Configured languages/disabled mode and errors preserve manual editing.
- [x] Authorization, validation, rate limiting and single-flight behavior tested.
- [x] Retry safety, README and API contract documented.
- [ ] Production cold-start connectivity and env provisioning verified (apps#263).
- [ ] Infra French decision and cross-application contention recorded (apps#263).

Local verification: all 993 frontend tests, frontend lint/format/type checks and
production build pass. The backend suite passed 1,434 tests initially; the 19
background-worker tests that failed due to the default database connection passed
when both `DATABASE_URL` and `TEST_DATABASE_URL` pointed to the isolated test
database (1,453 total). Backend lint, format and type checks pass. Translation
service calls are mocked; production service connectivity is not claimed.
