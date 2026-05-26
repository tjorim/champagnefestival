# Workflow scope and release notes

## Core CI workflows

- `backend-ci.yml`
  - Trigger scope:
    - `backend/**`
    - `.github/workflows/backend-ci.yml`
  - Runs:
    - `uv sync --frozen`
    - `ruff check .`
    - `ruff format --check .`
    - `ty check .`
    - `alembic upgrade head` (test Postgres service)
    - `pytest`

- `frontend-ci.yml`
  - Trigger scope:
    - `frontend/**`
    - `.github/workflows/frontend-ci.yml`
  - Runs:
    - `pnpm install --frozen-lockfile`
    - `pnpm run typecheck` (includes Paraglide compile)
    - `pnpm run lint`
    - `pnpm run test`
    - `pnpm run build`

- `android.yml`
  - Trigger scope:
    - `android/**`
    - `.github/workflows/android.yml`
  - Runs:
    - `./gradlew lintDebug`
    - `./gradlew testDebugUnitTest`
    - `./gradlew assembleDebug`

The previous monolithic `ci.yml` has been removed in favor of these path-scoped workflows.

## CodeQL workflows

- `codeql-backend.yml`: scoped to `backend/**`
- `codeql-frontend.yml`: scoped to `frontend/**`
- `codeql-actions.yml`: scoped to `.github/workflows/**`
- `codeql-android.yml`: scoped to `android/**`

Each CodeQL workflow also includes its own workflow file in `paths` so workflow edits self-validate.

## PR preview (`pr-preview.yml`)

- Trigger scope is intentionally limited to:
  - `frontend/**`
  - `.github/workflows/pr-preview.yml`
- Backend-only and docs-only pull requests should not run preview builds.
- If previews must react to backend API contracts in the future, add only explicit contract paths (not all backend paths).

## GitHub Pages deploy (`deploy.yml`)

- Deploy is release/manual only (`release.published` and `workflow_dispatch`).
- Frontend quality gates are required before publish:
  - `pnpm run lint`
  - `pnpm run test`
  - `pnpm run build`
- Backend install/build is intentionally excluded from this workflow.

### Release checklist

- Frontend deploy: confirm release branch/tag and successful frontend quality gates.
- Database migrations: run Alembic migrations separately when backend schema changes are included.
- Backend health: verify API health and auth flows separately from frontend Pages deployment.

## Future workflow expectations

- Event-day Android APK/manual workflows should stay separate from normal frontend/backend CI.
- Android release artifacts should skip gracefully when signing secrets are missing.
- Event-day helper/offline workflows (if added) should trigger only for helper/offline paths.
- Event-day helper/offline artifacts should include version/build metadata and documented retention.
- If MCP docs/package workflows are added, scope triggers to MCP-specific code/docs paths only.

## Branch protection checks

Update required status checks on `main` to the new workflow names:

- `Backend CI / Lint, Typecheck, Migrate & Test`
- `Frontend CI / Typecheck, Lint, Test & Build`
- `Android CI / Lint, Unit Test & Build` (when Android changes should be required)
- Relevant CodeQL checks (`CodeQL Backend`, `CodeQL Frontend`, `CodeQL Actions`, `CodeQL Android`)

## Action pinning

Third-party actions in CI/deployment/preview workflows are pinned to full commit SHAs with inline version comments.
