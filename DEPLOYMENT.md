# Deployment guide

This repository contains:

- A **React/Vite frontend** in `frontend/`.
- A **FastAPI backend** in `backend/`.

Production runs on a **VPS** with Caddy as the reverse proxy, fronted by **Cloudflare**
(`champagnefestival.tjor.im` is proxied, not DNS-only).

## Architecture

```
Cloudflare  (edge TLS termination)
└── VPS
    ├── Caddy  (reverse proxy; may also terminate TLS on the Cloudflare→origin leg)
    │   └── champagnefestival.tjor.im  →  frontend static files + /api*, /docs*, /openapi.json, /mcp* → backend
    └── champagnefestival-api  (FastAPI, port 8000, internal only)
```

Caddy handles HTTPS certificates automatically via Let's Encrypt on the origin. Because
Cloudflare proxies the public hostname, **clients (including the Android app) only ever see
Cloudflare's edge certificate**, not Caddy's origin certificate directly — as of this writing
that's issued via Google Trust Services (`GTS Root R4` / `WE1`), not Let's Encrypt. Don't assume
"Caddy uses Let's Encrypt" tells you what CA a client actually observes; check the live chain
(e.g. via `openssl s_client`) instead.

> **Android app certificate pinning:** the Android release build pins TLS certificates for this
> host (see `android/README.md` → "Choosing what to pin"). Since the pinned cert is Cloudflare's
> edge certificate, its rotation cadence and CA are controlled by Cloudflare's edge certificate
> settings, not Caddy's ACME config. If Cloudflare's certificate authority or intermediate ever
> changes, the pins in the `CHAMPAGNEFESTIVAL_ANDROID_PROD_CERTIFICATE_PINS` GitHub secret must be
> regenerated and a new release shipped, or the app will fail to connect.

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
| `CORS_ORIGINS` | Comma-separated allowed origins, e.g. `https://champagnefestival.be` |
| `SMTP_*` | Optional — reservation confirmation emails |

> **Note:** In `production` mode the server validates these at startup and **refuses to start**
> if `OIDC_ISSUER_URL` is missing.

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
- Backend admin API routes live under `/api/*` and require a valid Bearer JWT containing the
  `admin` realm role in the `realm_access.roles` claim (set via Keycloak realm role assignment).
- Frontend env vars: `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_REDIRECT_URI`
  (defaults to `{origin}/admin`), `VITE_OIDC_SCOPE`.
