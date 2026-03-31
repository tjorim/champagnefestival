# AGENTS.md

## Layout

- `frontend/` contains the web app
- `backend/` contains the FastAPI service
- Production hosting for `champagnefestival.tjor.im` is handled by the separate infra stack in `/opt/apps/infra`
- Frontend builds write to `frontend/dist`; in production, Caddy serves this content from `/srv/champagnefestival`

## Commands

### Frontend (`cd frontend`)

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Backend (`cd backend`)

```bash
uv run uvicorn app.main:app --reload
uv run ruff check app
uv run ty check app
uv run pytest
uv run alembic upgrade head
```

> **Prerequisites:** Backend development and tests require a running PostgreSQL instance.
> Start one with `docker compose up db -d` from the repo root (uses `docker-compose.yml`).
> Tests default to `postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne`;
> override via the `TEST_DATABASE_URL` environment variable.

## Source Of Truth

- `frontend/src/config/navigation.ts` for site navigation
- `frontend/messages/` for translation content
- `frontend/src/components/ResponsiveImage.tsx` for shared image behavior
- `frontend/src/utils/adminApi.ts` and `frontend/src/utils/adminRegistrationApi.ts` for admin API integration

## Conventions

- Use American English in code, comments, and UI text
- Prefer targeted tests first, then broader checks before handoff
- Do not commit automatically unless explicitly asked
