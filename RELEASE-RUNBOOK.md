# Release Runbook

Supplement to the release process steps in `AGENTS.md`. Covers ownership, pre-release migration sign-off, post-deploy verification, and rollback procedures.

## Release ownership

| Step | Owner |
|---|---|
| Version bump + CHANGELOG entry | Author of the release PR |
| Tag push (`vX.Y.Z`) | Repository maintainer (tjorim) |
| CI green sign-off | Author confirms all checks pass in `release-draft.yml` |
| Draft release publish | Repository maintainer (tjorim) |
| Post-deploy verification | On-call volunteer / release author |
| Rollback decision | Repository maintainer (tjorim) |

## Pre-release: migration checklist

For every release that includes Alembic migrations, complete this before merging to `main`:

1. **Identify migrations** — list new revision files in `backend/alembic/versions/` not present in the previous release.
2. **Review downgrade** — confirm every new migration has a `downgrade()` function. If `downgrade()` raises `NotImplementedError` or is a no-op, document that rollback requires a database restore.
3. **Assess data loss** — note any `DROP COLUMN`, `DROP TABLE`, or destructive `ALTER` in the downgrade path. These require a pre-deploy backup before proceeding.
4. **Record downgrade command** — add a comment in the PR description or CHANGELOG entry:
   ```
   Migration rollback: alembic downgrade <previous_revision_id>
   ```
   Replace `<previous_revision_id>` with the `down_revision` value of the first new migration.
5. **Take a backup** — before applying migrations in production, snapshot the database:
   ```bash
   # Run from the VPS or a host with access to the Postgres container
   docker compose exec -T db pg_dump -c -U postgres champagnefestival > backup-$(date +%Y%m%d%H%M%S).sql
   ```

## Post-deploy verification checklist

Run these checks after the production deploy completes (typically within ~2–3 minutes of publishing the draft release):

- [ ] **Health endpoint** — `curl -sf https://champagnefestival.tjor.im/api/health` returns HTTP 200.
- [ ] **Frontend loads** — open `https://champagnefestival.tjor.im` in a browser; the page renders without console errors.
- [ ] **Public registration flow** — submit a test registration (use a clearly fake name) and confirm the confirmation appears.
- [ ] **Admin login** — navigate to `/admin`, click **Login**, complete OIDC auth, and confirm the dashboard loads.
- [ ] **Check-in token scan** — scan or manually enter a known check-in token; confirm guest lookup succeeds.
- [ ] **Version visible** — `curl -sf https://champagnefestival.tjor.im/api/health | jq .version` returns the expected `X.Y.Z`.

If any check fails, proceed to the relevant rollback section below.

## Rollback: frontend

The frontend is served as static files from `/srv/champagnefestival` on the VPS, managed by the infra stack in `/opt/apps/infra`.

1. **Identify the previous good release** — note the tag of the last known-good release (e.g., `vX.Y.(Z-1)`).
2. **Re-deploy the previous frontend build** via the infra stack:
   ```bash
   cd /opt/apps/infra
   # Update the pinned frontend version to the previous release tag, then apply
   # (exact command depends on the infra playbook/compose setup — see the private infra repo)
   ```
   If the infra stack uses a versioned artifact or Docker image for the frontend, roll back that image tag and restart the relevant service.
3. **Verify** — re-run the frontend steps from the post-deploy checklist once the rollback is applied.

## Rollback: backend

The backend runs in Docker on the VPS, managed by the infra stack in `/opt/apps/infra`.

### 1. Revert the application

```bash
cd /opt/apps/infra
# Roll back to the previous image tag
docker compose pull champagnefestival-api:<previous-version>
docker compose up -d champagnefestival-api
```

Images are tagged by the app's CalVer version (see "Versioning" in `AGENTS.md`); replace `<previous-version>` with the last known-good tag (e.g. `2026.6.3`).

### 2. Roll back Alembic migrations (if schema changed)

Only needed if the release included database migrations.

```bash
# Identify the target revision from the pre-release migration checklist
docker compose run --rm champagnefestival-api alembic downgrade <previous_revision_id>
```

> **Data-loss warning:** if the downgrade path drops columns or tables, data written since the upgrade is permanently lost. Restore from the pre-deploy backup instead:
> ```bash
> docker compose exec -T db psql -U postgres champagnefestival < backup-YYYYMMDDHHMMSS.sql
> ```

### 3. Verify

Re-run the full post-deploy verification checklist against the rolled-back version.

## Rollback: both (full revert)

If both frontend and backend must be rolled back simultaneously (e.g., a breaking API contract change):

1. Follow the backend rollback steps first to restore the API.
2. Follow the frontend rollback steps to restore the previous static build on the VPS.
3. Verify the health endpoint, frontend load, and registration flow together.
