# Champagnefestival — Backend

FastAPI + PostgreSQL backend for the VIP reservation and check-in system.
Designed to run on a shared VPS alongside the [worktime](https://github.com/tjorim/worktime) backend.

---

## User stories

The table below tracks each user story against its current implementation status.

| #   | Role      | Story                                                     | Status                                                                                                                                                             |
| --- | --------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Visitor   | Get a quick overview and information about the festival   | ✅ Frontend website                                                                                                                                                |
| 2   | Visitor   | Register for special events (VIP, breakfast, …)           | ✅ `RegistrationModal` + `POST /api/registrations`                                                                                                                  |
| 3   | Manager   | Overview of all registered guests                         | ✅ Admin dashboard + `GET /api/registrations`                                                                                                                       |
| 4   | Manager   | Approve, edit, or cancel registrations                    | ✅ `PUT /api/registrations/{id}` (status, notes, pre-orders)                                                                                                        |
| 5   | Visitor   | Overview of own orders across all editions                | ✅ `POST /api/registrations/my/request` + `POST /api/registrations/my/access`                                                                                        |
| 6   | Visitor   | Show personal QR code / order identifier                  | ✅ Short-lived access links are delivered by e-mail via `POST /api/registrations/my/request`                                                                         |
| 7   | Manager   | Create / move / delete tables on the floor plan           | ✅ Hall Layout tab + `POST/PUT/DELETE /api/tables/{id}`                                                                                                            |
| 8   | Manager   | Assign guests (and their orders) to tables                | ✅ `PUT /api/registrations/{id}` (`table_id`)                                                                                                                       |
| 9   | Manager   | Mark orders as (partially) paid                           | ✅ `PUT /api/registrations/{id}` (`payment_status`)                                                                                                                 |
| 10  | Volunteer | Scan a visitor's QR or search for them to see their order | ✅ QR scan → `POST /api/check-in/{id}/lookup`; name/e-mail search via `GET /api/registrations?q=`                                                                   |
| 11  | Volunteer | Look up guests by name or table; see remaining items      | ✅ `GET /api/registrations?q=name` and `?table_id=`; delivered items tracked per `OrderItem.delivered`                                                              |
| 12  | Manager   | Keep volunteer attendance + insurance identity records    | ✅ Admin CRUD via `/api/volunteers` (stored as people with role `volunteer`; includes name, address, first/last help day, NISS, eID document number)               |
| 13  | Manager   | Manage all person types using role tags + overlaps        | ✅ Admin CRUD via `/api/people` with roles such as chairwoman, treasurer, volunteer, member, festival-visitor; one person can have multiple roles                  |
| 15  | Manager   | Quickly manage members                                    | ✅ Create/update/remove-role via `/api/members`; browse/search via `/api/people?role=member`                                                                            |
| 14  | Manager   | Group returning attendees by registration history         | ✅ `GET /api/people/{id}/registrations` groups all registrations for that person (linked by person + e-mail)                                                       |

---

**Reservation access strategy:** confirmation e-mails should contain the guest's reservation details directly. Any link back into the site should be a freshly issued, short-lived access link rather than a permanent bearer token.

---

## Architecture

```text
Static frontend (Vite build / CDN / VPS)
        │
        │  HTTPS API calls
        ▼
   VPS (shared with worktime)
   ┌─────────────────────────────────┐
   │  nginx (reverse proxy, TLS)     │
   │    /api/* → champagne:8000      │
   │    /worktime/* → worktime:8001  │
   └─────────────────────────────────┘
        │
   ┌────▼────────────────────────────┐
   │  FastAPI (uvicorn / Docker)     │
   │  PostgreSQL (asyncpg)           │
   └─────────────────────────────────┘
```

---

## Quick start (development)

```bash
cd backend

# 1. Start PostgreSQL (from repo root)
docker compose up db -d

# 2. Install dependencies (creates .venv automatically)
uv sync

# 3. Configure environment
cp .env.example .env
# Edit .env — DATABASE_URL and OIDC_ISSUER_URL are the ones you'll usually need;
# admin endpoints return 401 until OIDC_ISSUER_URL is set

# 4. Run database migrations
uv run alembic upgrade head

# Note: only SQLAlchemy model/table changes require a new Alembic revision.
# API-only changes do not need a migration by themselves, but removing or
# replacing persisted volunteer fields such as `people.first_help_day` /
# `people.last_help_day` would require one.

# 4. Start the development server
uv run uvicorn app.main:app --reload
```

The interactive API docs are available at <http://localhost:8000/docs>.

---

## Development tools

The project uses the [Astral](https://astral.sh) toolchain for linting, formatting, and type checking.

```bash
# Lint
uv run ruff check .

# Format (check only)
uv run ruff format --check .

# Format (apply)
uv run ruff format .

# Type check
uv run ty check .

# Run tests
uv run pytest
```

Tests run on a throwaway SQLite file by default, so they need no container. CI also runs them on
PostgreSQL, the production database. To do the same locally, create a separate test database:

```bash
psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE test_champagne;"
export TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne
```

Tests that exercise PostgreSQL behaviour (concurrent sessions, the Alembic migrations, the ledger
trigger, LISTEN reconnects) are marked `requires_postgres` and skip on SQLite.

---

## Deployment on VPS

### Option A — Docker (recommended)

```bash
# Build image
docker build -t champagne-backend .

# Run migrations first (before the API container starts serving traffic).
# Use a one-off container so the API is not exposed until the schema is ready.
docker run --rm \
  --env-file /etc/champagne/.env \
  champagne-backend \
  alembic upgrade head

# Start the API container
docker run -d \
  --name champagne-backend \
  --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  --env-file /etc/champagne/.env \
  champagne-backend
```

### Option B — systemd service

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies into a virtualenv
cd /opt/champagne/backend
uv sync --no-dev

# Create /etc/systemd/system/champagne.service:
# [Unit]
# Description=Champagnefestival API
# After=network.target
#
# [Service]
# User=champagne
# WorkingDirectory=/opt/champagne/backend
# EnvironmentFile=/etc/champagne/.env
# ExecStartPre=/opt/champagne/backend/.venv/bin/alembic upgrade head
# ExecStart=/opt/champagne/backend/.venv/bin/uvicorn app.main:app \
#     --host 127.0.0.1 --port 8000 --workers 1
# Restart=always
#
# [Install]
# WantedBy=multi-user.target

systemctl enable --now champagne
```

### nginx reverse proxy snippet

```nginx
location /api/ {
    proxy_pass         http://127.0.0.1:8000;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

---

## Environment variables

| Variable           | Required | Default                                                | Description                                                          |
| ------------------ | -------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| `ENVIRONMENT`      | no       | `development`                                          | `development` or `production` — gates startup safety checks          |
| `DATABASE_URL`     | no       | `postgresql+asyncpg://localhost/champagne`             | Async SQLAlchemy URL. Local-dev override — takes precedence over `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD_FILE` below |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | no | `""` | Split connection parts, combined with `DB_PASSWORD_FILE` to build `DATABASE_URL` without a plaintext password |
| `DB_PASSWORD_FILE` | no       | `""`                                                   | Path to a file (e.g. a Docker secret) containing the DB password     |
| `OIDC_ISSUER_URL`  | yes in production | `""`                                          | OIDC provider base URL (e.g. Keycloak/authentik); admin endpoints return 401 until this is set |
| `OIDC_AUDIENCE`    | no       | `""`                                                   | Expected `aud` claim in the JWT                                      |
| `OIDC_JWKS_URI`    | no       | `""`                                                   | JWKS endpoint override; defaults to `{OIDC_ISSUER_URL}/.well-known/jwks.json` |
| `OIDC_ALGORITHMS`  | no       | `RS256`                                                | Comma-separated accepted JWT signing algorithms                      |
| `CORS_ORIGINS`     | no       | `""`                                                   | Comma-separated allowed origins, e.g. `https://champagnefestival.be` |
| `TRUSTED_HOSTS`    | yes in production | `""`                                          | Comma-separated allowed `Host` header values; empty disables Host header validation |
| `RATE_LIMIT_ENABLED` | no     | `true`                                                 | Toggles the general per-IP, per-route limiter; token-gated check-in uses its dedicated policy |
| `RATE_LIMIT_DEFAULT` | no     | `60/minute`                                            | Default rate limit string (see [limits](https://limits.readthedocs.io/en/stable/quickstart.html#rate-limit-string-notation)) |
| `MIN_FORM_SECONDS` | no       | `3`                                                    | Anti-spam: min seconds to fill the form                              |
| `GUEST_ACCESS_TOKEN_TTL_MINUTES` | no | `30` | TTL in minutes for short-lived guest access tokens used by `/api/registrations/my/request` and `/api/registrations/my/access` |
| `METRICS_HMAC_SECRET` | no    | `""`                                                   | Shared secret for the `X-Metrics-Token` HMAC on `GET /api/metrics`; empty disables the endpoint |
| `SENTRY_DSN`       | no       | `""`                                                   | Sentry DSN for error tracking; empty disables Sentry                 |
| `SENTRY_TRACES_SAMPLE_RATE` | no | `0.0`                                              | Fraction (0.0-1.0) of transactions sampled for Sentry performance monitoring |
| `SMTP_HOST`        | no       | `""`                                                   | SMTP server used to deliver guest access links and registration confirmations; empty disables delivery |
| `SMTP_PORT`        | no       | `587`                                                  | SMTP port                                                            |
| `SMTP_USER`        | no       | `""`                                                   | SMTP username                                                        |
| `SMTP_PASSWORD`    | no       | `""`                                                   | SMTP password                                                        |
| `SMTP_FROM`        | no       | `""`                                                   | Sender address for transactional e-mails                            |
| `CONTACT_RECIPIENT` | no      | `SMTP_FROM`                                             | Recipient for persisted contact-message notifications               |
| `FRONTEND_URL`      | no       | `http://localhost:5173`                                | Public origin used in transactional check-in links                  |
| `OUTBOX_POLL_SECONDS` | no     | `2`                                                    | Durable worker idle polling interval                                |
| `OUTBOX_LEASE_SECONDS` | no    | `300`                                                  | Durable job claim lease for crash recovery                          |
| `OUTBOX_RETENTION_DAYS` | no   | `90`                                                   | Retention for delivered and terminally failed jobs                  |
| `RECAPTCHA_SECRET` | no       | —                                                      | Google reCAPTCHA secret (planned)                                    |

See `.env.example` for a template.

---

## API reference

> Interactive docs: `GET /docs` (Swagger UI) or `GET /redoc` (ReDoc).

### Authentication

- Admin API endpoints require a valid OIDC Bearer JWT (`Authorization: Bearer <token>`)
  whose `realm_access.roles` claim includes `admin` — see `app/auth.py`.
- OIDC authorization/token endpoints are discovered from `GET /api/auth/oidc-config`,
  which the frontend and Android app both call to configure their auth flow.
- Public endpoints (registration creation, check-in) do not require admin auth.

### Endpoints

| Method   | Path                            | Auth           | Description                                                                |
| -------- | ------------------------------- | -------------- | -------------------------------------------------------------------------- |
| `POST`   | `/api/registrations`             | public / optional user | Create a registration; a valid user Bearer token assigns ownership       |
| `GET`    | `/api/registrations`             | admin          | Paginated registration list (`?q=`, `?status=`, `?event_id=`, `?table_id=`, `?person_id=`, `?edition_id=`, `?edition_type=`, `?edition_category=`, `?event_date=`, `?sort=`, `?sort_dir=`, `?limit=`, `?page=`); returns `{items, total, limit, page}` |
| `GET`    | `/api/registrations/export`      | admin          | Export one event's non-cancelled registrations as CSV                       |
| `POST`   | `/api/registrations/my/request`  | public         | E-mail a short-lived visitor access link                                    |
| `POST`   | `/api/registrations/my/access`   | public + token | View visitor registrations using a short-lived secure token                 |
| `GET`    | `/api/me/registrations`          | user           | List owned registrations with guest order and check-in details               |
| `POST`   | `/api/me/registrations/claim`    | user + access token | Claim unowned registrations after email-control proof                    |
| `GET`    | `/api/registrations/{id}`        | admin          | Get registration detail (token included)                                    |
| `PUT`    | `/api/registrations/{id}`        | admin          | Update registration                                                         |
| `DELETE` | `/api/registrations/{id}`        | admin          | Delete registration                                                         |
| `POST`   | `/api/check-in/{id}/lookup`      | public + token | Verify QR token and return guest information                                |
| `POST`   | `/api/check-in/{id}`            | public + token | Mark checked-in, issue strap                                               |
| `POST`   | `/api/contact`                  | public         | Persist a contact submission and notify the configured recipient           |
| `GET`    | `/api/contact`                  | admin          | List persisted contact messages                                            |
| `PUT`    | `/api/contact/{id}/handled`     | admin          | Mark a contact message as handled                                          |
| `GET`    | `/api/settings`                 | public         | Get maintenance mode and public contact settings                           |
| `PUT`    | `/api/settings`                 | admin          | Update maintenance mode or public contact settings                         |
| `GET`    | `/api/outbox`                   | admin          | Inspect durable delivery jobs, newest first, optionally filtered by state; paged `{items, total, limit, page}` |
| `POST`   | `/api/tables`                   | admin          | Create table                                                               |
| `GET`    | `/api/tables`                   | admin          | List tables                                                                |
| `GET`    | `/api/tables/{id}`              | admin          | Get table                                                                  |
| `PUT`    | `/api/tables/{id}`              | admin          | Update table                                                               |
| `DELETE` | `/api/tables/{id}`              | admin          | Delete table                                                               |
| `GET`    | `/api/content/{key}`            | public         | Get CMS content (producers / sponsors)                                     |
| `PUT`    | `/api/content/{key}`            | admin          | Save CMS content                                                           |
| `POST`   | `/api/volunteers`               | admin          | Create volunteer profile (person with role `volunteer`)                    |
| `GET`    | `/api/volunteers`               | admin          | Paged volunteer list on the [shared list contract](#paged-list-contract) (`?q=`, `?active=`, `?sort=name\|created\|updated`, `?sort_dir=`, `?limit=`, `?page=`); returns `{items, total, limit, page}` |
| `GET`    | `/api/volunteers/export`        | admin          | Stream filtered volunteer insurance CSV (`q`, `active`, `sort`, `sort_dir`; active-only by default, `include_inactive=true` for all)                           |
| `GET`    | `/api/volunteers/{id}`          | admin          | Get volunteer detail                                                       |
| `PUT`    | `/api/volunteers/{id}`          | admin          | Update volunteer profile                                                   |
| `POST`   | `/api/volunteers/{id}/deactivate`      | admin          | End volunteering: retire the `volunteer` role (`retired_roles`) and close open periods today; role, person and periods are kept (repeat is a no-op) |
| `POST`   | `/api/volunteers/{id}/reactivate`       | admin          | Undo `deactivate`: the volunteer role counts as active again (closed periods are not reopened; repeat is a no-op) |
| `POST`   | `/api/members`                  | admin          | Create member (person with role `member`)                                  |
| `GET`    | `/api/members/{id}`             | admin          | Get member detail                                                          |
| `PUT`    | `/api/members/{id}`             | admin          | Update member                                                              |
| `POST`   | `/api/members/{id}/deactivate`          | admin          | End membership: retire the `member` role (`retired_roles`); role, person, other roles and registrations are kept (repeat is a no-op) |
| `POST`   | `/api/members/{id}/reactivate`          | admin          | Undo `deactivate`: the member role counts as active again, opening a new stretch today (repeat is a no-op) |
| `POST`   | `/api/people`                   | admin          | Create person with role tags                                               |
| `GET`    | `/api/people`                   | admin          | Paged people list on the [shared list contract](#paged-list-contract) (`?q=`, `?role=`, `?active=`, `?sort=name\|email\|created\|updated\|registration_count`, `?sort_dir=`, `?limit=`, `?page=`); returns `{items, total, limit, page}` |
| `GET` | `/api/people/counts` | admin | Full-set `{total, active, inactive, by_role}` for the intersection of `q`, `role`, `active`; omit a facet filter to obtain counts for its tabs. Roles are case-insensitive and overlapping (a person counts once in each role). |
| `GET` | `/api/people/by-email` | admin | Exact case-insensitive `email` lookup, including inactive people; optional `exclude_person_id`, standard bounded `page`/`limit` envelope. No fuzzy matching. |
| `GET` | `/api/people/export` | admin | Stream all people matching `q`, `role`, `active`, with list ordering (`sort`, `sort_dir`); ignores pagination. General contact fields and registration count, no NISS/eID. |
| `GET`    | `/api/people/{id}`              | admin          | Get person detail                                                          |
| `PUT`    | `/api/people/{id}`              | admin          | Update person + roles                                                      |
| `DELETE` | `/api/people/{id}`              | admin          | Delete person                                                              |
| `GET`    | `/api/people/{id}/registrations` | admin          | List grouped registration history for that person                          |
| `GET`    | `/api/health/liveness`          | public         | Fast alive check — no DB hit (for load-balancer liveness probes)           |
| `GET`    | `/api/health/readiness`         | public         | DB connectivity check with 2 s timeout (for load-balancer readiness probes)|
| `GET`    | `/api/health`                   | public         | Summary with links to liveness and readiness endpoints                     |
| `GET`    | `/api/metrics`                  | `X-Metrics-Token` header | Uptime, request rate, error rate, p50/p99 latency          |

---


### Paged list contract

`GET /api/people` and `GET /api/volunteers` share one list contract
(`ListQuery` in `app/dependencies.py`, ordering and filtering in
`app/services/people_listing.py`), so a table can drive them with plain query
parameters and read `{items, total, limit, page}` back. `GET /api/registrations`
follows the same shape.

| Parameter  | Meaning |
| ---------- | ------- |
| `q`        | Search text; whitespace-only is treated as omitted. The same case-insensitive substring search on both endpoints: name, e-mail, phone, address, NISS, eID document number, notes and roles, plus fuzzy name/e-mail matching. |
| `page`     | 1-based page number (default `1`). May be used without `limit`. |
| `limit`    | Page size: default **50**, maximum **1000**. An omitted `limit` is never unbounded, and `0` or more than 1000 is a 422. |
| `sort`     | One of a whitelist; any other value is a 422, never a silent default. People: `name`, `email`, `created`, `updated`, `registration_count`. Volunteers: `name`, `created`, `updated`. |
| `sort_dir` | `asc` (default) or `desc`; used only with `sort`. |

- **Role history:** `Person.role_history` records when each role was held
  (`{role: [{started_on, ended_on}]}`, oldest first; no `ended_on` = in progress,
  null `started_on` = unknown, as for every role that predates the history).
  Granting a role opens a stretch, removing one closes it, `deactivate` closes it
  and `reactivate` opens a new one; `retired_roles` is the derived index of roles
  whose latest stretch has ended. Both come back on person, member and volunteer
  reads. `member_since` on `POST`/`PUT /api/members` sets the start of the current
  stretch (the generic people endpoints reject it); a new volunteer starts on
  their earliest `first_help_day`. All of it lives in `app/services/role_history.py`.
- **`active` with a `role`:** without `role` it means "not anonymised"
  (`Person.anonymised`, set only by the anonymise action). With `role` (and on
  `/api/volunteers`, which implies `role=volunteer`) it means active *in that role*:
  not anonymised and not retired from it (`Person.retired_roles`, set by the
  `deactivate` actions), so `active=false` lists people who retired the role plus
  anyone anonymised. `GET /api/people/counts` follows the same rule. Person reads
  carry `anonymised` (no `active` field); the create/update endpoints accept neither.
- **Order without `sort`:** a search (`q`) is ordered by relevance, ending in
  `name, id`; a plain list is newest first (`created_at desc, id desc`). An
  explicit `sort` always overrides relevance.
- **Deterministic paging:** every order ends in `id` (in the same direction as the
  sort), so ties never make offset paging skip or repeat a row. `name` and `email`
  sort on the unaccented, lower-cased `search_name`/`search_email` columns.
- **Indexes:** each sortable column has a composite btree ending in `id`
  (`ix_people_search_name_id`, `ix_people_search_email_id`,
  `ix_people_created_at_id`, `ix_people_updated_at_id`).
- **`total`** counts every row matching the filters (`role`, `active`, `q`), not
  just the page.
See [people aggregates and export semantics](../docs/people-aggregates.md) for
the consumer contract and synthetic sorting-scale evidence.

- **Registration counts:** every people list row has `registration_count`, counting
  all registrations (including cancelled ones) across all editions. Sorting uses
  that count and `id` in the requested direction. The correlated aggregate uses
  the existing `ix_registrations_person_id` btree; no cached counter or write
  maintenance is required. Unlike stored sort columns, the derived count itself
  has no index and sorting evaluates it across the matching set.
- **Full-set exports:** people and volunteer CSVs use the exact shared search and
  filters and list ordering, ignoring `page`/`limit`. A database cursor fetches
  batches of 250, with volunteer periods loaded only for the current batch; every
  cell is formula-safe. Volunteer exports preserve one row per help period and
  the historical active-only default: use `include_inactive=true` for an
  unfiltered list, or explicit `active=false` for inactive-only. Explicit `active`
  wins over `include_inactive`. All endpoints require admin authorization.
- **Volunteers keep their own path** rather than folding into `/api/people`: the
  response embeds help periods, the frontend readers and the MCP tools depend on
  that shape, and it is a role-restricted view of the same rows, so it takes the
  same parameters, `q` semantics and ordering rules (`volunteer` role filter
  implied). See `docs/decisions/tanstack-db.md` ("Paged list contract").
- **Members and visitors** have no list endpoint of their own: they are people, read
  with `GET /api/people?role=member` or `?role=festival-visitor`, so they get the
  contract as is.
- The MCP `list_members` and `list_volunteers` tools filter through the same code
  (`app/services/people_listing.py`), so their `q` has the same semantics as above;
  they stay unpaged.

### Error codes (#1251)

`detail` is an English diagnostic for logs, tests and MCP callers; the interface
must not render it, because Dutch and French visitors would read English. A
failure the interface can explain carries a stable `code` next to it:

```json
{"detail": "Table 'A1' does not have enough remaining seats.", "code": "table_over_capacity"}
```

- Raise `ApiHTTPException(status, code, detail)` (`app/services/errors.py`) from a
  router or service, or pass `code=` to `NotFoundError` / `ConflictError` /
  `ValidationFailedError` and let `to_http_exception` carry it. MCP adapters keep
  using the message; a `ServiceError` without a code behaves as before.
- Codes are lowercase snake_case, named for the condition (not the endpoint), and
  stable once published: add a new code rather than changing what one means.
  `rate_limited` is shared by every rate-limited route.
- The frontend maps a code to a translation in `frontend/src/utils/apiErrors.ts`
  (`apiErrorMessage(error, fallback)`) and shows the caller's translated operation
  message (`m.admin_error_*`) when the code is missing or not yet mapped. Adding a
  backend code therefore never breaks a surface; map it in `API_ERROR_MESSAGES`
  with `api_error_<code>` messages in all three locales when it should read better
  than the generic fallback.
- Coded today: `rate_limited`, `registration_not_found`,
  `registration_already_cancelled`, `table_over_capacity`,
  `table_exclusive_conflict`, `checked_in_cannot_cancel`, `payment_amount_zero`,
  `payment_reversal_target_invalid`, `pebble_token_invalid`,
  `organization_not_found`, `pending_logo_not_found`,
  `organization_change_conflict`, `organization_change_not_found`,
  `organization_change_submission_reused`, and the delete guards
  `table_type_in_use`, `venue_has_editions`, `venue_has_rooms`, `room_has_layouts`,
  `layout_has_tables`, `table_has_registrations`, `category_protected`,
  `category_in_use`, `event_has_registrations`. Validation errors (422) and
  uncoded errors still return `detail` alone.

## Frontend integration

The React (Vite) frontend proxies `/api/*` to the backend during development
via `vite.config.ts`. In production, Caddy routes `/api/*` requests to the FastAPI process.

Set the `CORS_ORIGINS` env var to the origin(s) of your frontend deployment so
the browser can reach the API:

```bash
# /etc/champagne/.env
CORS_ORIGINS=https://champagnefestival.be
```

---

## Product backlog

The README documents shipped behaviour; it is not a second product backlog.
Current gaps, dependencies, and preferred implementation order live in the
[product audit](../docs/product-audit-2026-08.md).

### Organization descriptions

Admin `POST /api/organizations` and partial `PUT /api/organizations/{id}` accept
nullable `description_nl`, `description_fr`, `description_en`. Each text is limited to
600 characters; leading/trailing whitespace is removed and blank text becomes null.
Whenever a French or English text exists, the Dutch text must be non-empty.
Clear the description by setting all three fields to null. Updates validate the
merged stored/requested values, so translations can be edited independently.

Descriptions are literal plain text: HTML and Markdown syntax is stored as text
and escaped by the public UI, never interpreted. Admin collection responses and
public edition organizations include all four fields. The visitor's language wins
when non-empty, otherwise the Dutch text is displayed. Descriptions appear
under organization names in the public carousel, including a conditional vendor
section when the edition payload contains vendors; floor plans and compact admin
lists remain unchanged. The existing edition lineup restriction to producers
and sponsors is unchanged (vendors cannot currently be linked to a lineup).

The lineup (`Edition.organizations`) is an ordered list of organization ids whose
order is the admin-defined display order. Sponsorship is per edition, so a sponsor's
level lives on the edition: `Edition.sponsor_tiers` maps an organization id to
`main`, `partner` or `supporter` (`SponsorTier`). Only lineup sponsors may have a
level (anything else is a 400), a sponsor that leaves the lineup or is deleted loses
its level, and a sponsor without one is untiered. Edition responses return `sponsors`
ordered by level (main first, untiered last) and then by lineup order, each with a
`sponsor_tier`; producers keep lineup order and the public site sorts them by name.
`EditionOut` (admin) also returns `organizations`, the lineup ids in order.

MCP `create_organization` and `update_organization` expose the same fields and validation.
Omitted/null MCP arguments leave update fields unchanged; empty text strings
clear individual translations. Clearing the Dutch text requires clearing the
translations in the same update. Admin edits are immediately live. Manager proposals and
supersession use the private review workflow below (#1193).

### Event titles, descriptions and categories (#1222)

Events keep their text per language, following the organisation pattern.
`title_nl`/`title_fr`/`title_en` hold the texts (each at most 200 characters; Dutch is
required). The description works the same way with `description_nl/fr/en` (each at most
10000 characters; all null means no description, and a French or English description needs
a Dutch one). Whitespace is trimmed and blank text becomes null. Updates validate the merged
stored/requested values, so one translation can be edited alone and an empty string
clears a translation. Create and update take these fields only; there is no
single-language `title`/`description` input and no original-language field.

Every event response carries all stored languages plus `title`/`description`
resolved for the `locale` query parameter (`nl`, `fr`, `en`) of the public
`GET /api/editions/active` and `/upcoming` (MCP `get_event_schedule` takes the
same `locale`). A missing translation falls back to Dutch; with no
`locale` the Dutch text is returned, so clients that predate translations keep
working. The server-rendered home page (`/?lng=`) and its JSON-LD (`subEvent`
entries) use the same resolved text, and registration confirmation emails title
the event in the person's `preferred_language`. Admin lists, exports, audit
entries and event-day screens keep showing the Dutch title
(`Event.title`).

### Organization stands

`GET /api/editions/{edition_id}/stands` is a public, cacheable (60 s) read of where each
organization stands: an area with an `organization_id` on an event's room layout. Any
organization type (producer, sponsor, vendor, ...) can have one, in the lineup or not.
The response (`EditionStandsOut`) lists, per organization, `{event_id, date, room_name,
label}` for each stand, so an organization can be somewhere else on another day or have no
entry at all. It is built by `app/services/stands_service.py`, which loads only
organizations, layouts, rooms and areas — never tables, registrations or allocations
(asserted in `tests/test_edition_stands.py`). Stands are only published while the festival is on (first
active event day through 7 days after the last, Europe/Brussels) and the list is empty
outside that window; inside it they appear as soon as they are assigned. Inactive
editions, events and organizations are excluded. The public MCP tool
`find_stand` answers "where is X?" from the same service.

`GET /api/editions/{edition_id}/plan` (#1253) is the public, cacheable (60 s) floor plan
behind the homepage's "Show on plan" button: per active event day and room, the room
geometry (`id`, `name`, `width_m`, `length_m`, `color`) and its areas (`id`, `label`, `icon`,
`x`, `y`, `rotation`, `width_m`, `length_m`, `organization_id`). It includes areas without an
organization (stage, entrance, ...) but never tables, registrations, guests, capacities,
allocations or layout ids (`EditionPlanOut`; asserted in `tests/test_edition_plan.py`), uses
the same publication window as the stands and returns 404 for inactive editions. See the
"Public floor plan subset" section of `docs/floor-plan-coordinates.md`.

### Event categories

`Event.category` is the key of an admin-managed category (`event_categories`:
`key`, `label_nl/fr/en`, `sort_order`). The labels follow the same
pattern as event titles: Dutch must have text, the others are
optional and fall back to it. The key (lowercase letters, digits, `-`, `_`; at most
50 characters) is chosen on creation and cannot change, because events store it.
Creating or moving an event to an unknown key is a 422; deleting a category that
events still use is a 409.

- `GET /api/event-categories?locale=` is public and returns every category in
  display order (`sort_order`, then `key`) with `label` resolved for `locale` plus all
  stored labels; the frontend resolves labels client-side from them.
- `POST`, `PUT /api/event-categories/{key}` and `DELETE` are admin-only and audited
  (`event_category_created|updated|deleted`). A `PUT` merges labels like an event
  update: an empty string clears a translation, the Dutch label cannot be cleared.
- MCP: public `list_event_categories(locale)`; admin `create_event_category`,
  `update_event_category`, `delete_event_category`. `create_event` and
  `update_event` take a category key.

Migration `006` creates the table with nine default categories (`tasting`, `vip`,
`party`, `breakfast`, `exchange`, `general`, `ceremony`, `social`, `other`; labels in
all three languages), normalises case/whitespace of existing values, and turns any
other value events already use into a category of its own (key derived from the
text, the text as Dutch label), logging each so its labels can be reviewed. It also
moves existing `title`/`description` into the `nl` columns. Its downgrade keeps only
the Dutch text and drops the table.

Admins can request editable machine drafts of a title or description with
`GET`/`POST /api/events/translation` (same contract as the organisation drafts, text
limited to 2000 characters and a separate rate-limit bucket); see
[the API contract](../docs/organization-description-translation.md#event-drafts-1222).

### Translated content and product categories (#1222)

Everything an administrator writes for visitors follows the organisation
description pattern: Dutch (`*_nl`) always has text, French and English
(`*_fr`, `*_en`) are optional translations, and a missing translation falls back to
Dutch, so a blank translation never hides content. An optional description needs
Dutch text as soon as it has any text. There is no original-language field: the vzw
and the festival venue are in Flanders, so Dutch is the base language. Updates validate the merged stored and
requested text; an empty string clears a translation; blank text is stored as null;
database check constraints enforce the same rule.

| Content | Fields | Notes |
| --- | --- | --- |
| Event | `title_*`, `description_*` | see above |
| Event / product category | `label_*` | see below |
| FAQ item | `question_*`, `answer_*` | a language is used only when its question and answer are both filled |
| Announcement | `text_*`, `link_label_*` | a link needs a Dutch label |
| Composed message | `title_*`, `body_*` | a language is used only when title and body are both filled |
| Policy | `title_*`; version `content_*` | publishing needs Dutch content only (`required_locales` is gone) |
| Product | `name_*`, `description_*` | an order line keeps the name in every language |

Public reads (`/api/faq/active`, `/api/policies/{key}/current`, the edition
endpoints) take `locale` and return the text
resolved for it plus every stored language. A policy response names the language
actually served in `locale`. Emails (registration confirmations, composed messages)
use the recipient's `preferred_language`.

Event and product categories share one implementation
(`app.services.categories`): a table with a stable `key`, a label per language and a
`sort_order`; the key is immutable; deleting a category that is still used is a 409.
`GET /api/product-categories?locale=` is public, writes are admin-only and audited
(`product_category_created|updated|deleted`), and MCP has `list_product_categories`
(public) plus `create_|update_|delete_product_category`. `champagne` cannot be deleted
because delivery tracking counts bottles by it. `Product.category` references the key
(an unknown key is a 422); order lines copy the key when the order is placed.

The same migration (`006`) moves existing FAQ items, announcements, composed messages, policies
and products to Dutch (`nl`) as their original language (migration `009` later made Dutch the only
required language and dropped the `*_language` columns, copying any French or English original into
the Dutch column first and logging each table it did that for), creates
`product_categories` with `champagne`, `food` and `other` (a value products already
use is kept as a category of its own and logged), and drops `policies.required_locales`.
Its downgrade keeps only the original-language text.

Volunteer-only text is not translated into other content tables, but the volunteer poll follows the
same pattern for its question titles and option labels.

#### Volunteer poll: questions (migration `009`)

An edition's poll is a list of **questions** (`edition_poll_questions`), each of one `kind`:

- `yes_no`: "will you join x on y" (dinner on Sunday, a play in December). A volunteer answers yes or no;
  a yes also says how many people it stands for, themselves included (`people`, 1 to 10; a no stores 0).
- `meals`: "choose your meals". The question owns a list of options (`edition_poll_options`, with a
  `question_id`) and a volunteer asks for a quantity of each (1 to 20; an option left out means none),
  so they can mix dishes or take several of one.
- `single_choice`: pick exactly one admin-configured option (`option_id`); `null` clears it.
- `free_text`: a trimmed answer of up to 500 characters (`text`); blank or `null` clears it.
- `rating`: an integer from 1 (lowest) to 5 (highest), inclusive (`rating`); `null` clears it.

Questions are translated like other content (`title_nl` required, `title_fr`/`title_en`, same for
`description_*`), carry a `sort_order` (new ones go last) and their own `closes_at`. Options are `label_nl`
(required), `label_fr`, `label_en` and a `dietary_tags` list (`vegetarian`, `vegan`, `gluten_free`,
`lactose_free`, `contains_nuts`, replaced as a whole on update); meals and single-choice questions have options
(422 `poll_question_not_meals` otherwise).

- **Admin REST:** `GET/POST /api/poll-questions`, `PUT/DELETE /api/poll-questions/{id}`,
  `POST /api/poll-questions/reorder` (`{edition_id, ordered_ids}`, every question exactly once) and
  `POST /api/poll-questions/copy` (`{from_edition_id, to_edition_id}`: copies questions and their options,
  never the answers, skipping questions whose kind and Dutch title already exist in the target).
  Options: `POST/GET /api/poll-options`, `PUT/DELETE /api/poll-options/{id}`,
  `POST /api/poll-options/reorder` (`{question_id, ordered_ids}`). Question reads include the counts to
  order from: per option `total_quantity` and `volunteer_count`, per yes/no question `yes_count`,
  `no_count` and `people_total`.
- **Closing is per question:** `closes_at` is when volunteers can no longer change that answer.
  `PUT /api/poll-questions/{id}` with `closes_at: null` reopens it and a past time closes it now. A
  volunteer save on a closed question is a 409 with code `poll_question_closed`. The dietary note follows
  the meals questions: it can be saved while at least one of them is open.
- **Volunteer REST:** `GET /api/me/volunteer/poll?locale=` returns the active edition's questions in the
  language asked for (Dutch fallback) with the volunteer's own answers; `PUT /api/me/volunteer/poll/questions/{id}`
  replaces the answer to one question (`{selections: [{option_id, quantity}]}` for meals,
  `{attending, people}` for yes/no, `{option_id}`, `{text}` or `{rating}` for the new kinds); `PUT /api/me/volunteer/poll/note` sets the dietary note
  (`{note}`, at most 500 characters, an empty string clears it; `volunteer_meal_notes`).
- **Who answered what:** `GET /api/poll-questions/orders?edition_id=` lists every active volunteer (also
  those who answered nothing) and anyone else holding an answer, with their answers in question order and
  their note; MCP `list_poll_orders`. It contains volunteer names (admin only).
- **Admin entry:** `PUT /api/poll-questions/orders/{volunteer_id}?edition_id=` (MCP `set_volunteer_poll_order`)
  enters or corrects a volunteer's answers and note on their behalf, for example from an email. The body is
  `{selections, attendance, choices, texts, ratings, note, confirm_closed}`; it replaces everything the volunteer answered for the
  edition. A change to a question that has closed needs `confirm_closed: true` (otherwise 409
  `poll_question_closed`). The volunteer must have the `volunteer` role (404 `volunteer_not_found`) and
  every option and question must belong to the edition (404 `poll_option_not_found` /
  `poll_question_not_found`). The audit entry `volunteer_poll_answers_set_by_admin` records the admin as
  actor, the volunteer as subject and whether a closed question was changed. The admin dialog asks for a
  confirmation first, with a stronger one when a question has closed.
- **Deleting** an option volunteers picked is a 409 `poll_option_in_use` (with how many and how much) until
  `?confirm_selections=true`; deleting a question volunteers answered is a 409 `poll_question_in_use` until
  `?confirm_answers=true`. Confirming removes those answers and the audit entry lists them. On a closed
  question both are a 409 `poll_question_closed` regardless: reopen it first.
- Confirmed poll deletes email affected volunteers through the durable outbox by default (#1361).
  Revision `009` includes the durable `poll_deletion_notifications` snapshot table.
  REST and MCP accept `notify=false` to skip email. Each volunteer receives one translated
  snapshot of the removed answer; delivery failures do not undo deletion.
- MCP: `create_`/`update_`/`delete_poll_question`, `list_poll_questions`, `reorder_poll_questions`,
  `copy_poll_questions`, `create_`/`update_`/`delete_poll_option`, `list_poll_options`,
  `reorder_poll_options`, `list_poll_orders`, `set_volunteer_poll_order`. `update_poll_question` takes
  `closes_at` or `reopen`.

Everything that differs per kind (how answers are stored, counted, validated and shown) lives in one
`PollKind` per kind in `app/services/poll_kinds.py`; `poll_questions_service` never branches on the kind. To
add a kind, add a handler there and register it in `KINDS`, extend `POLL_QUESTION_KINDS` (and the check
constraint with a migration) and `PollQuestionKind`; `tests/test_poll_kinds.py` fails until they agree. On the
frontend the per-kind pieces are `Record<PollQuestionKind, ...>` maps (`utils/pollKinds.ts`,
`components/MyPollAnswers.tsx`, `components/admin/pollAnswerFields.tsx`, `PollOrdersTable`), so a new kind
fails type-checking until each says what to do with it. The REST shapes still carry kind-specific fields
(`selections`, `attendance`, `choices`, `texts`, `ratings`).

**Wire-shape decision (#1360): Option A, additive typed fields.** Existing REST/MCP readers retain
`selections`, `attendance`, `attending`, `people` and the yes/no counts without a breaking tagged-answer
migration. Each additional kind needs only one scalar on the volunteer view/request and one list on admin
entry/orders: `choices: [{question_id, option_id}]`, `texts: [{question_id, text}]`, and
`ratings: [{question_id, rating}]`. Lists default to empty, scalar reads to null. Admin entry is still a
full replacement of **all five kinds**; clients editing an edition must round-trip every answer list.
An old admin writer that omits the new lists clears those answers, so update such writers before using
new kinds. Volunteer requests must contain their kind's field (explicit null clears); mixed-kind
payloads with non-null fields from another kind are rejected. Every question reports `answered_count`; single-choice option totals count picks.

Migration `009` widens the kind constraint and stores the new answers in `volunteer_poll_choices`,
`volunteer_poll_texts` and `volunteer_poll_ratings`, each keyed by volunteer/question with cascading
foreign keys. A composite option/question foreign key prevents a choice from using another question's
option; database checks enforce nonblank text and the 1–5 scale. Free-text content is excluded from audit
details. Downgrading to `008` drops all typed poll answers and question definitions; export answers before rolling back.

Migration `009` turns the earlier option-only poll into this model: each edition that has options gets one
"Maaltijden" meals question holding them (closing time and all), and its downgrade drops the questions and
the yes/no answers. The poll was never released before `009`, so the API of the intermediate option-only
shape (`/api/poll-options/settings|orders|copy`, `/api/me/volunteer/poll-options|poll-selections`) no longer exists.

### Organization manager self-service (#1192)

Visitors and organization contacts share one emailed login at `/me`, using the
existing visitor magic-link/session endpoints and cookie. The page shows
bookings and organizations associated with that verified identity. Contacts
without email cannot obtain organization access. Access follows the current
contact email on every request; the view includes inactive organizations too.
A Keycloak bearer token with an explicitly verified matching email also
grants organization access, alongside the account’s existing role-based sections.
Staff roles alone do not grant contact access. Full both-method account
unification remains in #1209.

| Method | Endpoint | Contract |
| --- | --- | --- |
| POST | `/api/visitor-sessions/request` | `{email}`; rate-limited, generic 202 for every valid email, without revealing bookings or contact membership. |
| POST | `/api/visitor-sessions/redeem` | `{token}`; establishes the shared HttpOnly-cookie session and returns owned bookings; invalid/expired/replayed links return 401. |
| GET | `/api/visitor-sessions/status` | `{authenticated, expires_at}`; absent/expired cookie returns false; no-store. |
| POST | `/api/visitor-sessions/sign-out` | 204; revokes the shared email session and clears its cookie; safe to repeat. |
| GET | `/api/me/organizations` | Email-session cookie or OIDC bearer token required; list of `{id, name, type, website, active, description_nl, description_fr, description_en}` for current matching verified contact email (`email_verified: true` for OIDC); no verified email means an empty list; 401 without authentication; no-store. |

Uses existing SMTP/frontend URL settings and visitor credential housekeeping.
No new authentication migration is required.
See the [login decision](../docs/decisions/1192-organization-manager-login.md)
and [retry safety](../docs/retry-safety.md). Interactive schemas are at `/docs`.

### Organization proposals and admin review

Managers use the Organizations tab on `/me` to propose website and multilingual
plain-text description edits. Proposals stay private until an admin accepts them
in the admin Organizations tab. Direct admin edits supersede pending fields; managers
see the outcome and any rejection reason. Admin REST and MCP review operations
share the same service and concurrency/retry contract.

Apply migrations through `004` (the full organization rename) and configure `ORGANIZATION_REVIEW_RECIPIENT` in the environment
infra env file to notify a shared mailbox through the existing SMTP outbox worker.
Leave it unset to use only the pending list. No new Keycloak roles are needed.
See the [API and workflow contract](../docs/organization-change-review.md) and
[retry safety](../docs/retry-safety.md#organization-proposals-and-review-1193).

### Organization description draft translation (#1195)

Set `TRANSLATION_SERVICE_URL` to the self-hosted LibreTranslate base URL to enable
explicit drafts. `TRANSLATION_API_KEY_FILE` points at the mounted per-app engine
credential (missing or invalid configured file fails closed, never anonymous).
`TRANSLATION_LANGUAGES` defaults to `nl,en`; leaving the URL empty
hides the action. Admin and live manager capabilities/draft endpoints are documented
in [the API contract](../docs/organization-description-translation.md), including
90-second total deadline, identity limits, retry safety and the apps#263 production gate.

The coordinated organization domain rename requires matching API clients, storage
configuration and Caddy paths; see the [migration and deployment sequence](../docs/organization-change-review.md#terminology-and-upgrade).

## Signage channels and public playlists

Migration `008` adds edition-scoped signage channels, validated layered templates
and scheduled organisation/notice/image slides. The public clock and playlist
are `GET /api/signage/time` and `GET /api/signage/{slug}/playlist?locale=nl|fr|en`.
Admin CRUD and reorder are under `/api/signage`; uploads reuse the artwork
validation/storage pattern. See [the signage API contract](../docs/signage-api.md)
for payloads, privacy, cache validators, fixed-epoch semantics, vendor membership,
image storage/hosting and retry decisions. The player and editors remain separate
work (#1262–#1264).


## Request schema conventions

Create and update models declare their own defaults, required fields, and
nullability. Do not derive a partial update from a complete create model, or
narrow mutable fields inherited from an optional base. Keep write contracts
explicit; do not generate partial models dynamically or suppress override errors.

Reuse the constrained `Annotated` value types in `app/schema_types.py` for fields
with the same contract. Constraints belong on the non-null value type; use
`ValueType | None = None` for optional update fields. Keep descriptions and
operation-specific defaults on the concrete model. Different domain limits need
different types, even when the underlying Python type matches.

Share normalisation and validation through a base when both operations use the
same rules. When a shared validator needs fields whose types differ between
complete and partial requests, use a generic base specialised with the exact
field types (see the translated-content schemas). Simple models do not need a
generic base solely to share field constraints. Keep operation-specific and
merged-state validation on the relevant concrete model. For example, a poll label
is required even on update, and volunteer updates distinguish omitted identity/help-period fields from
explicitly cleared values. Admin volunteer creation requires only a name, matching
creating a person with the volunteer role: identity numbers default to `null` and
help periods to `[]`. Blank identity input normalises to `null` on both create and
update. On update, omitted identity fields stay unchanged, while explicit `null`
or blank strings clear them. Omitted/null `help_periods` stay unchanged; `[]`
clears all periods, and supplied periods still require a valid start and date range.
The separate volunteer self-registration flow retains its checksum-validated identity
requirements.

Omission and explicit `null` are separate API decisions. Preserve
`model_fields_set` / `exclude_unset=True` handling, and document any intentional
change in null handling or write validation in `docs/retry-safety.md`. Tests in
`tests/test_request_schemas.py` cover create/update constraint consistency and
complete-versus-partial nullability.

## Private signage MP4 jobs (#1349)

Migration `008` adds creator-scoped frozen exports. The opt-in apps#273 adapter
uses `MEDIA_WORKER_URL`, `MEDIA_WORKER_TOKEN_FILE` and a private persistent
`SIGNAGE_VIDEO_STORAGE` shared by API replicas; blank URL disables new MP4
exports without affecting HTML/PNG. API lifespan reconciliation resumes after
restart and local expiry cleanup continues even when remote processing is
disabled. Never mount this volume into Caddy or a public upload directory.
See [API, limits and lifecycle](../docs/signage-api.md#private-mp4-exports-1349),
[setup/activation](../docs/signage-setup.md#one-cycle-mp4-exports-1349) and
[retry safety](../docs/retry-safety.md#private-signage-video-exports-1349).

#### Visitor order questions (migration `009`)

Events can collect optional **single choice**, **free text** (500 characters) and **rating** (integer 1–5)
answers once per registration/order, regardless of guest count. These reuse the volunteer poll's scalar
validation and shared frontend fields. Questions never create product lines, reserve stock or change prices.
Meals and other priced choices remain products; there are no per-guest or required questions in this version.

An administrator opens **Order questions** in an existing event's editor. This configuration saves separately
from the event. `PUT /api/events/{event_id}/order-questions` accepts `{questions: [...]}`: each question has a
client-generated stable `id`, `kind`, Dutch-required `title_nl` (optional `title_fr`/`title_en`), optional
`description_*` with Dutch fallback, `active`, and ordered `options` with their own stable IDs and translated
`label_*`. The array sets question order; options are only valid for single choice. IDs belonging to another
event/question are rejected. The response and admin event reads include inactive questions; public event
reads include active questions only. Limit: 50 submitted definitions and 200 options per question.

Definitions live in `event_order_questions` and `event_order_options`; `registration_order_answers` stores
one typed row per registration/question, with an option foreign key, bounded text or a bounded integer.
A composite question/kind foreign key and check constraint prevent mixing kinds or answer fields; a composite
option/question foreign key prevents selecting another question's option. Application validation also checks
that each question belongs to the registration's event. Used definitions are immutable, including translations
and options; changing them returns `order_question_in_use`. Deactivate the old question and add a new one.
Removing a used definition from configuration deactivates it and retains its answers; unused omitted definitions
are deleted. This preserves the meaning of answers on historical orders without storing an unvalidated JSON payload.

`RegistrationCreate`, `RegistrationAdminCreate` and `RegistrationUpdate` accept `order_answers`, for example:

```json
[
  {"question_id": "transport", "option_id": "bike"},
  {"question_id": "comment", "text": "Extra chairs, please"},
  {"question_id": "score", "rating": 5}
]
```

Every question is optional; null clears a scalar value and whitespace-only text also clears. Mixed fields,
duplicate questions, invalid values and wrong-event questions/options are rejected. Public checkout rejects
inactive questions (`order_question_unavailable`); admin corrections can still answer inactive questions.
On an admin update, omitted/null `order_answers` preserves answers, `[]` clears them, and a nonempty list
replaces all answers for that order. Existing callers therefore preserve answers when editing unrelated fields.
MCP `create_registration` and `update_registration` accept the same optional list. Question configuration is
currently REST/admin UI only.

Order reads include `order_answers` with the question definition for translated display, including inactive
questions. Visitor account reads expose answers only alongside the caller's own existing order access.
The admin booking editor can enter/correct answers; admin lists/CSV and visitor order details show them.
Event guest-list CSV adds an `Order answers` column with Dutch question/value pairs. The all-matching admin
CSV uses the interface locale. Existing CSV formula escaping applies to answer text too. Audit records include
answer counts, never answer contents. Configuration and order writes serialize under the existing event lock.

Downgrading `009` to `008` drops the new definitions and answers while preserving registrations and products. Export visitor answers before rolling back. Retry decisions are in `docs/retry-safety.md`.
