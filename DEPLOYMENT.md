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
| `ADMIN_TOKEN` | Long random string for admin bearer auth |
| `DATABASE_URL` | e.g. `sqlite+aiosqlite:////var/data/champagne/champagne.db` |
| `CORS_ORIGINS` | Comma-separated allowed origins, e.g. `https://champagnefestival.be` |
| `SMTP_*` | Optional — reservation confirmation emails |

## Database migrations

Run Alembic migrations on first deploy and after each schema change:

```bash
docker compose run --rm champagnefestival-api alembic upgrade head
```
