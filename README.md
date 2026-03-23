# Champagne Festival Website

The official website for the Champagne Festival — a React/Vite frontend with a FastAPI backend.

## Project structure

```text
champagnefestival/
├── frontend/      # React + Vite SPA (TypeScript, pnpm)  → see frontend/README.md
├── backend/       # FastAPI REST API (Python, uv)         → see backend/README.md
├── DEPLOYMENT.md  # VPS + Caddy deployment guide
└── CLAUDE.md      # AI coding agent guidelines
```

## Prerequisites

| Tool | Purpose | Install |
|---|---|---|
| Node.js 24+ + pnpm | Frontend | [nodejs.org](https://nodejs.org) / [pnpm.io](https://pnpm.io) |
| Python 3.11+ + uv | Backend | [uv install](https://docs.astral.sh/uv/getting-started/installation/) |
| Docker (optional) | Containerised backend | [docs.docker.com](https://docs.docker.com) |

## Quick start

```bash
# Backend (Terminal 1)
cd backend
cp .env.example .env          # configure — at minimum set ADMIN_TOKEN
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
