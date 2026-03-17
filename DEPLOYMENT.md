# Deployment guide

This repository contains:

- A **React/Vite frontend** in `frontend/`.
- A **FastAPI backend** in `backend/`.

The chosen deployment target is a **VPS** with frontend and backend combined on one host.

## Combined deployment on one VPS

The pattern is:

- Build and serve frontend static assets with nginx.
- Run FastAPI backend as a separate service/container.
- Route `/api/*` from nginx to backend.

This repo includes starter files:

- `docker-compose.combined.yml`
- `deploy/nginx/champagne.conf`

### 1) Prepare environment

```bash
cp backend/.env.example backend/.env
```

Set at least:

- `ENVIRONMENT=production`
- `ADMIN_TOKEN=<long-random-token>`
- `CORS_ORIGINS=https://your-domain.example`
- `DATABASE_URL=sqlite+aiosqlite:////var/data/champagne/champagne.db`

### 2) Start the combined stack

```bash
docker compose -f docker-compose.combined.yml up -d --build
```

### 3) Run database migrations (first deploy and each schema change)

```bash
docker compose -f docker-compose.combined.yml run --rm backend alembic upgrade head
```

### 4) Verify

```bash
curl -i http://localhost/health
curl -i http://localhost/api/health
```

> TLS note: either terminate TLS in a host-level reverse proxy (recommended) or extend the nginx container to listen on 443 with certificates.
