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
| `SUPERTOKENS_CONNECTION_URI` | e.g. `http://supertokens:3567` |
| `SUPERTOKENS_API_KEY` | Shared secret between backend SDK and SuperTokens core |
| `API_DOMAIN` | Public backend origin, e.g. `https://champagnefestival.tjor.im` |
| `WEBSITE_DOMAIN` | Public frontend origin, e.g. `https://champagnefestival.tjor.im` |
| `CORS_ORIGINS` | Comma-separated allowed origins, e.g. `https://champagnefestival.be` |
| `SMTP_*` | Optional — reservation confirmation emails |

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

- `/admin` uses SuperTokens email/password sign-in on the website domain.
- Backend admin API routes require a valid session with the SuperTokens `admin` role.
- The backend also serves the SuperTokens dashboard at `/auth/dashboard`.
