# Champagne Festival Website

The official website for the Champagne Festival — a React/Vite frontend with a FastAPI backend.

## Project Structure

```
champagnefestival/
├── frontend/   # React + Vite SPA (TypeScript, pnpm)
└── backend/    # FastAPI REST API (Python, uv)
```

## Frontend

All frontend commands run from the `frontend/` directory.

```bash
cd frontend
pnpm install        # install dependencies
pnpm dev            # start dev server → http://localhost:5173
pnpm build          # production build → dist/
pnpm lint           # oxlint
pnpm typecheck      # TypeScript check
pnpm test           # run tests (vitest)
```

**Key directories:**

- `src/components/` — React components
- `src/config/` — site configuration (schedule, navigation, …)
- `src/hooks/` — custom React hooks
- `src/types/` — TypeScript type definitions
- `messages/` — i18n translation files (JSON per locale: `nl`, `en`, `fr`)
- `public/` — static assets

**Technologies:** React, Vite, TypeScript, Bootstrap, Paraglide i18n, Vitest

## Backend

All backend commands run from the `backend/` directory.

```bash
cd backend
uv sync                                    # install dependencies
uv run uvicorn app.main:app --reload       # start dev server → http://localhost:8000
uv run ruff check .                        # lint
uv run ruff format .                       # format
uv run ty check .                          # type check
uv run pytest                              # run tests
```

See `backend/.env.example` for environment variable configuration.

**Technologies:** FastAPI, SQLite (aiosqlite), Alembic, uv, Ruff, ty

## Internationalization

Translations use [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) (`@inlang/paraglide-js`). Edit files in `frontend/messages/{locale}.json` and run `pnpm paraglide:compile` to regenerate message functions.

```tsx
import * as m from "../paraglide/messages.js";
<h1>{m.welcome_title()}</h1>
```

## Deployment

Production runs on a VPS with Caddy as the reverse proxy serving the built frontend and proxying `/api/*` to the FastAPI backend. See [DEPLOYMENT.md](./DEPLOYMENT.md) for details.
