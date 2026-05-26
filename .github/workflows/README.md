# Workflow scope and release notes

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

- Android CI/release workflows must be path-scoped to `android/**`.
- Event-day Android APK/manual workflows should stay separate from normal frontend/backend CI.
- Android release artifacts should skip gracefully when signing secrets are missing.
- Event-day helper/offline workflows (if added) should trigger only for helper/offline paths.
- Event-day helper/offline artifacts should include version/build metadata and documented retention.
- If MCP docs/package workflows are added, scope triggers to MCP-specific code/docs paths only.

## Action pinning

Third-party actions in deployment/preview workflows are pinned to full commit SHAs with inline version comments.
