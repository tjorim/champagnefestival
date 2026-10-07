# Champagnefestival Website

The official website for the Champagnefestival — a React/Vite frontend with a FastAPI backend.

## Project structure

```text
champagnefestival/
├── frontend/      # React + Vite SPA (TypeScript, pnpm)  → see frontend/README.md
├── backend/       # FastAPI REST API (Python, uv)         → see backend/README.md
├── DEPLOYMENT.md  # VPS + Caddy deployment guide
└── AGENTS.md      # Repo-specific contributor guidance
```

## Prerequisites

| Tool | Purpose | Install |
|---|---|---|
| Node.js 24+ + pnpm | Frontend | [nodejs.org](https://nodejs.org) / [pnpm.io](https://pnpm.io) |
| Python 3.14+ + uv | Backend | [uv install](https://docs.astral.sh/uv/getting-started/installation/) |
| Docker (optional) | Containerised backend | [docs.docker.com](https://docs.docker.com) |

## Releases

- Bump the version in the root `VERSION` file (CalVer `YYYY.MM.MICRO`, e.g. `2026.7.1`)
  — frontend, backend, and Android all derive from it; see "Versioning" in `AGENTS.md`.
- Add a matching `CHANGELOG.md` entry header: `## [YYYY.MM.MICRO] - YYYY-MM-DD`
- Push tag `vYYYY.MM.MICRO` to trigger the draft release workflow.
- Publish the generated draft release to trigger the production deploy.

## Quick start

```bash
# Backend (Terminal 1)
cd backend
cp .env.example .env          # configure DATABASE_URL + OIDC settings
uv sync                       # install dependencies
uv run alembic upgrade head   # run database migrations
uv run uvicorn app.main:app --reload

# Frontend (Terminal 2)
cd frontend
pnpm install
pnpm dev
```

- Frontend dev server: <http://localhost:5173>
- Backend API + docs: <http://localhost:8000/docs>

The frontend dev server proxies `/api/*` to the backend automatically.

## More details

- **[frontend/README.md](./frontend/README.md)** — commands, project structure, i18n, code style
- **[backend/README.md](./backend/README.md)** — architecture, API overview, dev tools, deployment options
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — production VPS + Caddy setup

## Documentation

See the [documentation guide](docs/README.md) for operational contracts,
current product work, and architectural decisions.

The UI uses **organisation** (Dutch **organisatie**, French **organisation**)
for producers, sponsors and vendors, covering companies and associations.
See the [terminology and upgrade guidance](docs/organization-change-review.md#terminology-and-upgrade).

Organisation contacts can request an emailed sign-in link at `/me`
and view their own bookings and organisations through one email session. Organisation
access follows the current contact email, using the email session or a
Keycloak token with an explicitly verified email. Keycloak remains authoritative
for staff roles. Both-method account unification is tracked in #1209.
See [manager API documentation](backend/README.md#organization-manager-self-service-1192)
and the [design decision](docs/decisions/1192-organization-manager-login.md).

Organisation contacts can propose website and description changes from `/me`;
admins review them in the Organisations tab before publication. Configure the optional
`ORGANIZATION_REVIEW_RECIPIENT` shared mailbox and run the existing outbox worker for
submission notifications. See [organization review and API documentation](docs/organization-change-review.md).

Organisation managers can upload logos for administrator review; administrators
can publish their own uploads immediately. PNG, JPEG and WebP uploads are
validated and re-encoded, and pending files stay in private storage.
See [logo upload setup, API and recovery](docs/organization-logo-upload.md) for
local directories, production volume requirements and cleanup operations.

Organisation editors can request editable description drafts from the optional
self-hosted translation service. Nothing is saved until a person saves or submits
it. See [configuration and API contract](docs/organization-description-translation.md).
