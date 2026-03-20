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

## Analytics (Umami)

The site supports self-hosted [Umami](https://umami.is/) analytics — a free, open-source, privacy-first analytics tool that collects no personal data and sets no cookies.

### Install Umami on the VPS

Follow the [official Umami docs](https://umami.is/docs/install) or use Docker:

```bash
# Example — adapt to your own database credentials
docker run -d \
  --name umami \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://umami:password@db:5432/umami \
  -e DATABASE_TYPE=postgresql \
  ghcr.io/umami-software/umami:postgresql-latest
```

Once running, log in, add your website, and copy the **Script URL** and **Website ID** from the *Tracking code* settings page.

### Configure the frontend

Set the following environment variables before building the frontend (add them to the production `.env` file or your CI secrets):

| Variable | Description | Example |
|---|---|---|
| `VITE_UMAMI_SCRIPT_URL` | URL of the Umami tracking script | `https://analytics.example.com/script.js` |
| `VITE_UMAMI_WEBSITE_ID` | UUID of the website created in Umami | `a1b2c3d4-...` |

The Vite build will automatically inject the `<script>` tag into `index.html` when both variables are set. If either variable is empty, the analytics script is omitted entirely (safe for development and staging builds).

```bash
# frontend/.env.production
VITE_UMAMI_SCRIPT_URL=https://analytics.champagnefestival.be/script.js
VITE_UMAMI_WEBSITE_ID=<your-website-uuid>
```
