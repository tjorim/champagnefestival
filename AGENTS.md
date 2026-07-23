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
>
> Auth doesn't require a local Keycloak/IdP — set `DEV_AUTH_BYPASS_TOKEN` to any
> string and pass it as `Authorization: Bearer <value>`; it's treated as a fixed
> dev user with the admin and volunteer realm roles. Refuses to start if set
> outside `ENVIRONMENT=development`.

## Release process

1. Update version metadata to the same `X.Y.Z` value in:
   - `frontend/package.json`
   - `backend/pyproject.toml`
   - `backend/app/main.py`
2. Add/update `CHANGELOG.md` entry header as `## [X.Y.Z] - YYYY-MM-DD`.
3. Push tag `vX.Y.Z` to run `.github/workflows/release-draft.yml`.
4. Wait for backend/frontend checks and metadata validation to pass.
5. Publish the generated draft release to trigger the VPS deploy via the infra stack in `/opt/apps/infra`.

See `RELEASE-RUNBOOK.md` for release ownership, post-deploy verification, migration sign-off, and rollback procedures.

## Source Of Truth

- `frontend/src/config/navigation.ts` for site navigation
- `frontend/messages/` for translation content
- `frontend/src/components/ResponsiveImage.tsx` for shared image behavior
- `frontend/src/utils/adminApi.ts` and `frontend/src/utils/adminRegistrationApi.ts` for admin API integration

## CI & workflows

Third-party actions are pinned to full commit SHAs with inline version comments.

Required status checks on `main`:

- `Backend CI / Lint, Typecheck, Migrate & Test`
- `Frontend CI / Typecheck, Lint, Test & Build`
- `Frontend CI / E2E Tests (Chromium)`
- `Android CI / Lint, Unit Test & Build` (when Android changes are required)
- Relevant CodeQL checks (`CodeQL Backend`, `CodeQL Frontend`, `CodeQL Actions`, `CodeQL Android`)

Future workflow additions should follow these conventions:
- Event-day Android APK/manual workflows stay separate from normal frontend/backend CI.
- Android release artifacts skip gracefully when signing secrets are missing.
- New workflows scope their `paths` triggers to the code they actually test.

## Conventions

- Use American English in code, comments, and UI text
- Prefer targeted tests first, then broader checks before handoff
- Do not commit automatically unless explicitly asked
