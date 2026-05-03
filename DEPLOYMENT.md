# Deployment guide

This repository contains:

- A **React/Vite frontend** in `frontend/`.
- A **FastAPI backend** in `backend/`.

Production runs on a **VPS** with Caddy as the reverse proxy.

## Architecture

```
VPS
├── Caddy  (TLS termination + reverse proxy)
│   └── champagnefestival.be  →  frontend static files + /api/* → backend
└── champagnefestival-api  (FastAPI, port 8000, internal only)
```

Caddy handles HTTPS certificates automatically via Let's Encrypt.

## Frontend build

Build the frontend and ensure `frontend/dist/` is up to date before deploying:

```bash
cd frontend
pnpm install
pnpm build
```

The `frontend/dist/` output is served as static files by Caddy.

## Backend environment

The backend reads configuration from environment variables — see `backend/.env.example` for all options.

Key variables:

| Variable | Description |
|---|---|
| `ENVIRONMENT` | Set to `production` |
| `DATABASE_URL` | e.g. `postgresql+asyncpg://user:password@postgres:5432/champagnefestival` |
| `OIDC_ISSUER_URL` | OIDC provider base URL, e.g. `https://auth.example.com/application/o/champagnefestival` |
| `OIDC_AUDIENCE` | Expected audience claim in the JWT (optional) |
| `OIDC_JWKS_URI` | JWKS endpoint override (defaults to `{OIDC_ISSUER_URL}/.well-known/jwks.json`) |
| `OIDC_ALGORITHMS` | Accepted JWT algorithms, default `RS256` |
| `ADMIN_USERNAMES` | Comma-separated `preferred_username` values allowed as admins |
| `CORS_ORIGINS` | Comma-separated allowed origins, e.g. `https://champagnefestival.be` |
| `SMTP_*` | Optional — reservation confirmation emails |

> **Note:** In `production` mode the server validates these at startup and **refuses to start**
> if `OIDC_ISSUER_URL` or `ADMIN_USERNAMES` is missing.

## Database migrations

Run Alembic migrations on first deploy and after each schema change:

```bash
docker compose run --rm champagnefestival-api alembic upgrade head
```

> **Note:** The migration files are baked into the Docker image at build time. If new migrations were added since the last build, rebuild the image first — otherwise Alembic will report `(head)` at the old revision without applying anything:
>
> ```bash
> docker compose build champagnefestival-api
> docker compose run --rm champagnefestival-api alembic upgrade head
> ```

## Admin access

- The admin UI is at `/admin`. Clicking **Login** redirects to the configured OIDC provider.
  After successful authentication, the provider redirects back to `/admin`.
- Backend admin API routes live under `/api/*` and require a valid Bearer JWT with a
  `preferred_username` (or email local part) present in `ADMIN_USERNAMES`.
- Frontend env vars: `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_REDIRECT_URI`
  (defaults to `{origin}/admin`), `VITE_OIDC_SCOPE`.
