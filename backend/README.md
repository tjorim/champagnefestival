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
| 15  | Manager   | Quickly manage members                                    | ✅ Create/update/delete via `/api/members`; browse/search via `/api/people?role=member`                                                                            |
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

Tests use a separate database by default:

```bash
psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE test_champagne;"
```

They connect to `postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne`
unless `TEST_DATABASE_URL` overrides it.

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
| `DELETE` | `/api/volunteers/{id}`          | admin          | Delete volunteer profile                                                   |
| `POST`   | `/api/members`                  | admin          | Create member (person with role `member`)                                  |
| `GET`    | `/api/members/{id}`             | admin          | Get member detail                                                          |
| `PUT`    | `/api/members/{id}`             | admin          | Update member                                                              |
| `DELETE` | `/api/members/{id}`             | admin          | Delete member                                                              |
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
| `q`        | Search text; whitespace-only is treated as omitted. The same case-insensitive substring search on both endpoints: name, e-mail, phone, address, NISS, eID document number, club, notes and roles, plus fuzzy name/e-mail matching. |
| `page`     | 1-based page number (default `1`). May be used without `limit`. |
| `limit`    | Page size: default **50**, maximum **1000**. An omitted `limit` is never unbounded, and `0` or more than 1000 is a 422. |
| `sort`     | One of a whitelist; any other value is a 422, never a silent default. People: `name`, `email`, `created`, `updated`, `registration_count`. Volunteers: `name`, `created`, `updated`. |
| `sort_dir` | `asc` (default) or `desc`; used only with `sort`. |

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

### Exhibitor descriptions

Admin `POST /api/exhibitors` and partial `PUT /api/exhibitors/{id}` accept
`description_language` (`nl`, `fr`, or `en`) and nullable `description_nl`,
`description_fr`, `description_en`. Each text is limited to 600 characters;
leading/trailing whitespace is removed and blank text becomes null. Whenever
any text exists, the selected original language must have non-empty text.
Clear the description by setting all four fields to null. Updates validate the
merged stored/requested values, so translations can be edited independently.

Descriptions are literal plain text: HTML and Markdown syntax is stored as text
and escaped by the public UI, never interpreted. Admin collection responses and
public edition exhibitors include all four fields. The visitor's language wins
when non-empty, otherwise the original text is displayed. Descriptions appear
under exhibitor names in the public carousel, including a conditional vendor
section when the edition payload contains vendors; floor plans and compact admin
lists remain unchanged. The existing edition lineup restriction to producers
and sponsors is unchanged (vendors cannot currently be linked to a lineup).

MCP `create_exhibitor` and `update_exhibitor` expose the same fields and validation.
Omitted/null MCP arguments leave update fields unchanged; empty text strings
clear individual translations, and an empty `description_language` clears the
original-language selector. Clearing all text requires clearing that selector
in the same update. Admin edits are immediately live. Manager proposals and
supersession use the private review workflow below (#1193).

### Exhibitor manager self-service (#1192)

Visitors and exhibitor contacts share one emailed login at `/me`, using the
existing visitor magic-link/session endpoints and cookie. The page shows
bookings and exhibitors associated with that verified identity. Contacts
without email cannot obtain exhibitor access. Access follows the current
contact email on every request; the view includes inactive exhibitors too.
A Keycloak bearer token with an explicitly verified matching email also
grants exhibitor access, alongside the account’s existing role-based sections.
Staff roles alone do not grant contact access. Full both-method account
unification remains in #1209.

| Method | Endpoint | Contract |
| --- | --- | --- |
| POST | `/api/visitor-sessions/request` | `{email}`; rate-limited, generic 202 for every valid email, without revealing bookings or contact membership. |
| POST | `/api/visitor-sessions/redeem` | `{token}`; establishes the shared HttpOnly-cookie session and returns owned bookings; invalid/expired/replayed links return 401. |
| GET | `/api/visitor-sessions/status` | `{authenticated, expires_at}`; absent/expired cookie returns false; no-store. |
| POST | `/api/visitor-sessions/sign-out` | 204; revokes the shared email session and clears its cookie; safe to repeat. |
| GET | `/api/me/exhibitors` | Email-session cookie or OIDC bearer token required; list of `{id, name, type, website, active, description_language, description_nl, description_fr, description_en}` for current matching verified contact email (`email_verified: true` for OIDC); no verified email means an empty list; 401 without authentication; no-store. |

Uses existing SMTP/frontend URL settings and visitor credential housekeeping.
No new authentication migration is required; migration `004` adds descriptions.
See the [login decision](../docs/decisions/1192-exhibitor-manager-login.md)
and [retry safety](../docs/retry-safety.md). Interactive schemas are at `/docs`.

### Exhibitor proposals and admin review

Managers use the Exhibitors tab on `/me` to propose website and multilingual
plain-text description edits. Proposals stay private until an admin accepts them
in the admin Exhibitors tab. Direct admin edits supersede pending fields; managers
see the outcome and any rejection reason. Admin REST and MCP review operations
share the same service and concurrency/retry contract.

Apply migration `004` and configure `EXHIBITOR_REVIEW_RECIPIENT` in the environment
infra env file to notify a shared mailbox through the existing SMTP outbox worker.
Leave it unset to use only the pending list. No new Keycloak roles are needed.
See the [API and workflow contract](../docs/exhibitor-change-review.md) and
[retry safety](../docs/retry-safety.md#exhibitor-proposals-and-review-1193).

### Exhibitor description draft translation (#1195)

Set `TRANSLATION_SERVICE_URL` to the self-hosted LibreTranslate base URL to enable
explicit drafts. `TRANSLATION_LANGUAGES` defaults to `nl,en`; leaving the URL empty
hides the action. Admin and live manager capabilities/draft endpoints are documented
in [the API contract](../docs/exhibitor-description-translation.md), including
90-second timeout, identity limits, retry safety and the apps#263 production gate.
