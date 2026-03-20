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

## Analytics

Because `champagnefestival.be` is **proxied through Cloudflare** (not just DNS), two complementary tiers of analytics are available at no cost.

### Tier 1 — Cloudflare Zone Analytics (100 % coverage, zero code)

Cloudflare records every request that passes through its edge — before any ad blocker or JavaScript setting on the visitor's device matters. No script is required.

Enable it in the dashboard: **Analytics & Logs → Traffic**.

Use this for: total request volume, bandwidth, country breakdown, and bot traffic.

### Tier 2 — Cloudflare Web Analytics JS beacon (per-page detail)

A lightweight, cookieless JavaScript beacon adds per-page view counts and Core Web Vitals to the Cloudflare dashboard. Because it is a client-side script it will not fire for visitors who block `static.cloudflare.com` (typically 25–40 % of desktop users with ad blockers). Zone Analytics remains the authoritative source for total visitor counts.

#### Enable the beacon

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com) and select your zone (`champagnefestival.be`).
2. Go to **Analytics & Logs → Web Analytics**.
3. Click **Add a site** (or select the existing site) and copy the **JS Snippet token** — a 32-character hex string.

#### Configure the frontend build

Set `VITE_CF_BEACON_TOKEN` before building the frontend (in the production `.env` file or CI/CD secrets):

| Variable | Description | Example |
|---|---|---|
| `VITE_CF_BEACON_TOKEN` | Token from the Cloudflare Web Analytics JS snippet | `a1b2c3d4e5f6...` (32 hex chars) |

```bash
# frontend/.env.production
VITE_CF_BEACON_TOKEN=<your-32-char-token-from-cloudflare-dashboard>
```

The Vite build injects the beacon `<script defer>` tag into `index.html` automatically when the token is set. If the variable is empty the script is omitted entirely, keeping development and staging builds clean.

> **Note:** A Python/FastAPI backend approach cannot track page loads in this architecture — Caddy serves the static frontend directly, so the backend only ever sees `/api/*` requests.
