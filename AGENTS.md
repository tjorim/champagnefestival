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

## Versioning

The app uses CalVer: `YYYY.MM.MICRO` (e.g. `2026.7.1`), where `MICRO` is a counter
that resets to `1` at the start of each new month.

The root `VERSION` file is the single source of truth. Everything else derives
from it — nothing else should be hand-edited:

- `backend/app/version.py` reads it at runtime (`APP_VERSION`), used by
  `app/main.py` and the `/api/health` response.
- `frontend/package.json`'s `version` field is synced from it automatically by
  `frontend/scripts/sync-version.mjs`, run as part of `pnpm build`.
- `android/app/build.gradle.kts` reads it directly to compute `versionName`/`versionCode`.

## Release process

1. Update the version in the root `VERSION` file (e.g. `2026.7.1`).
2. Add/update `CHANGELOG.md` entry header as `## [YYYY.MM.MICRO] - YYYY-MM-DD`.
3. Push tag `vYYYY.MM.MICRO` to run `.github/workflows/release-draft.yml`.
4. Wait for backend/frontend checks and metadata validation to pass.
5. Publish the generated draft release to trigger the VPS deploy via the infra stack in `/opt/apps/infra`.

See `RELEASE-RUNBOOK.md` for release ownership, post-deploy verification, migration sign-off, and rollback procedures.

## Source Of Truth

- `VERSION` (repo root) for the app version — see "Versioning" above
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
