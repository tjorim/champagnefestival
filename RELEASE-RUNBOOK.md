# Release Runbook

Supplement to the release process steps in `AGENTS.md`. Covers ownership, pre-release migration sign-off, post-deploy verification, and rollback procedures.

## Release ownership

| Step | Owner |
|---|---|
| Version bump + CHANGELOG entry | Author of the release PR |
| Tag push (`vX.Y.Z`) | Repository maintainer (tjorim) |
| CI green sign-off | Author confirms all checks pass in `release.yml` |
| Draft release publish | Repository maintainer (tjorim) |
| Explicit VPS deployment (independent of release publication) | Repository maintainer (tjorim) |
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
   docker compose -f /opt/apps/infra/compose.yaml exec -T postgres pg_dump -c -U postgres champagnefestival > backup-$(date +%Y%m%d%H%M%S).sql
   ```

## Post-deploy verification checklist

Publishing a draft does not deploy the VPS. From `/opt/apps`, run
`scripts/upgrade-apps.sh champagnefestival` (or the infra deploy playbook). Both
build the latest `origin/main`, which may be newer than the published tag.
Record the previous commit and migration revision before deploying. Run these
checks after that explicit deploy completes:

- [ ] **Health endpoint** — `curl -sf https://champagnefestival.tjor.im/api/health` returns HTTP 200.
- [ ] **Frontend loads** — open `https://champagnefestival.tjor.im` in a browser; the page renders without console errors.
- [ ] **Public registration flow** — submit a test registration (use a clearly fake name) and confirm the confirmation appears.
- [ ] **Outbox worker** — confirm the separately supervised `python -m app.worker` service is healthy, then verify the test registration's confirmation job reaches `delivered` in `GET /api/outbox` and the email arrives.
- [ ] **Admin login** — navigate to `/admin`, click **Login**, complete OIDC auth, and confirm the dashboard loads.
- [ ] **Check-in token scan** — scan or manually enter a known check-in token; confirm guest lookup succeeds.
- [ ] **Version visible** — `curl -sf https://champagnefestival.tjor.im/api/health | jq '{version, commit}'` matches `cat /opt/apps/champagnefestival/VERSION` and `git -C /opt/apps/champagnefestival rev-parse HEAD` from the build. A release version alone does not identify the deployed commit.

If any check fails, proceed to the relevant rollback section below.

## Rollback: frontend

The frontend is served as static files from `/srv/champagnefestival` on the VPS, managed by the infra stack in `/opt/apps/infra`.

1. **Select the previous good source commit** in `/opt/apps/champagnefestival`:
   ```bash
   cd /opt/apps
   git -C champagnefestival switch --detach <previous-good-commit>
   (cd champagnefestival/frontend && CI=true pnpm install --frozen-lockfile && pnpm build)
   ```
   Caddy serves this checkout's `frontend/dist`. Use the recorded source commit;
   do not assume the previous release tag was the previous deployment.
2. **Verify** — re-run the frontend checks. Do not run the normal upgrade script
   or deploy playbook for a pinned rollback: they switch back to `origin/main`.

## Rollback: backend

The backend runs in Docker on the VPS, managed by the infra stack in `/opt/apps/infra`.

### 1. Revert the application

Images are built locally, not pulled by CalVer tags. Select the recorded
previous good commit, review migration compatibility, then build both services:

```bash
cd /opt/apps
git -C champagnefestival switch --detach <previous-good-commit>
metadata="$(python3 scripts/deployment-metadata.py --format shell)"
eval "$metadata"
docker compose -f infra/compose.yaml build champagnefestival-api champagnefestival-worker
```

If required, downgrade or restore the database using the rebuilt image before
starting old code. Then apply both services:

```bash
docker compose -f infra/compose.yaml up -d champagnefestival-api champagnefestival-worker
```

The durable outbox worker must use the same source commit as the API. The
production infra stack owns its separate supervised service; do not run it as
an in-process API task. Do not use the normal deploy commands for a pinned
rollback: they select `origin/main`.

### 2. Roll back Alembic migrations (if schema changed)

Only needed if the release included database migrations.

```bash
# Identify the target revision from the pre-release migration checklist
docker compose -f /opt/apps/infra/compose.yaml run --rm champagnefestival-api alembic downgrade <previous_revision_id>
```

> **Data-loss warning:** if the downgrade path drops columns or tables, data written since the upgrade is permanently lost. Restore from the pre-deploy backup instead:
> ```bash
> docker compose -f /opt/apps/infra/compose.yaml exec -T postgres psql -U postgres champagnefestival < backup-YYYYMMDDHHMMSS.sql
> ```

### 3. Verify

Re-run the full post-deploy verification checklist against the rolled-back version.

## Rollback: both (full revert)

If both frontend and backend must be rolled back simultaneously (e.g., a breaking API contract change):

1. Follow the backend rollback steps first to restore the API.
2. Follow the frontend rollback steps to restore the previous static build on the VPS.
3. Verify the health endpoint, frontend load, and registration flow together.
