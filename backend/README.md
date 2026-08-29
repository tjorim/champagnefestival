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
| 15  | Manager   | Quickly manage members                                    | ✅ Convenience CRUD via `/api/members` (role-filtered view on people)                                                                                              |
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
| `SMTP_HOST`        | no       | `""`                                                   | SMTP server used to deliver guest access links; empty disables delivery |
| `SMTP_PORT`        | no       | `587`                                                  | SMTP port                                                            |
| `SMTP_USER`        | no       | `""`                                                   | SMTP username                                                        |
| `SMTP_PASSWORD`    | no       | `""`                                                   | SMTP password                                                        |
| `SMTP_FROM`        | no       | `""`                                                   | Sender address for guest access-link e-mails                         |
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
| `POST`   | `/api/registrations`             | public         | Create a registration                                                       |
| `GET`    | `/api/registrations`             | admin          | List registrations (supports `?q=`, `?status=`, `?event_id=`, `?table_id=`) |
| `GET`    | `/api/registrations/export`      | admin          | Export one event's non-cancelled registrations as CSV                       |
| `POST`   | `/api/registrations/my/request`  | public         | E-mail a short-lived visitor access link                                    |
| `POST`   | `/api/registrations/my/access`   | public + token | View visitor registrations using a short-lived secure token                 |
| `GET`    | `/api/registrations/{id}`        | admin          | Get registration detail (token included)                                    |
| `PUT`    | `/api/registrations/{id}`        | admin          | Update registration                                                         |
| `DELETE` | `/api/registrations/{id}`        | admin          | Delete registration                                                         |
| `POST`   | `/api/check-in/{id}/lookup`      | public + token | Verify QR token and return guest information                                |
| `POST`   | `/api/check-in/{id}`            | public + token | Mark checked-in, issue strap                                               |
| `POST`   | `/api/tables`                   | admin          | Create table                                                               |
| `GET`    | `/api/tables`                   | admin          | List tables                                                                |
| `GET`    | `/api/tables/{id}`              | admin          | Get table                                                                  |
| `PUT`    | `/api/tables/{id}`              | admin          | Update table                                                               |
| `DELETE` | `/api/tables/{id}`              | admin          | Delete table                                                               |
| `GET`    | `/api/content/{key}`            | public         | Get CMS content (producers / sponsors)                                     |
| `PUT`    | `/api/content/{key}`            | admin          | Save CMS content                                                           |
| `POST`   | `/api/volunteers`               | admin          | Create volunteer profile (person with role `volunteer`)                    |
| `GET`    | `/api/volunteers`               | admin          | List volunteers (supports `?q=` search)                                    |
| `GET`    | `/api/volunteers/export`        | admin          | Export active volunteer insurance records as CSV                           |
| `GET`    | `/api/volunteers/{id}`          | admin          | Get volunteer detail                                                       |
| `PUT`    | `/api/volunteers/{id}`          | admin          | Update volunteer profile                                                   |
| `DELETE` | `/api/volunteers/{id}`          | admin          | Delete volunteer profile                                                   |
| `POST`   | `/api/members`                  | admin          | Create member (person with role `member`)                                  |
| `GET`    | `/api/members`                  | admin          | List members (supports `?q=`, `?active=`)                                  |
| `GET`    | `/api/members/{id}`             | admin          | Get member detail                                                          |
| `PUT`    | `/api/members/{id}`             | admin          | Update member                                                              |
| `DELETE` | `/api/members/{id}`             | admin          | Delete member                                                              |
| `POST`   | `/api/people`                   | admin          | Create person with role tags                                               |
| `GET`    | `/api/people`                   | admin          | List people (supports `?q=`, `?role=`, `?active=`)                         |
| `GET`    | `/api/people/{id}`              | admin          | Get person detail                                                          |
| `PUT`    | `/api/people/{id}`              | admin          | Update person + roles                                                      |
| `DELETE` | `/api/people/{id}`              | admin          | Delete person                                                              |
| `GET`    | `/api/people/{id}/registrations` | admin          | List grouped registration history for that person                          |
| `GET`    | `/api/health/liveness`          | public         | Fast alive check — no DB hit (for load-balancer liveness probes)           |
| `GET`    | `/api/health/readiness`         | public         | DB connectivity check with 2 s timeout (for load-balancer readiness probes)|
| `GET`    | `/api/health`                   | public         | Summary with links to liveness and readiness endpoints                     |
| `GET`    | `/api/metrics`                  | `X-Metrics-Token` header | Uptime, request rate, error rate, p50/p99 latency          |

---


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
[product audit](../docs/product-audit-2026-08.md). In particular, automatic
confirmation e-mail after registration creation is tracked by
[#924](https://github.com/tjorim/champagnefestival/issues/924). The existing
SMTP integration only delivers short-lived guest access links requested via
`POST /api/registrations/my/request`.
