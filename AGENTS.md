# AGENTS.md

## Layout

- `frontend/` contains the web app
- `backend/` contains the FastAPI service
- `pebble/` contains an experimental, unshipped Pebble (Alloy) companion app scaffold — see `pebble/README.md` (tracks issue #757)
- Production hosting for `champagnefestival.tjor.im` is handled by the separate infra stack in `/opt/apps/infra`
- Frontend builds write to `frontend/dist`; in production, Caddy serves this content from `/srv/champagnefestival`

## Commands

### Frontend (`cd frontend`)

```bash
pnpm dev
pnpm lint
pnpm format         # rewrites files in place
pnpm format:check   # what CI runs — fails on unformatted files, doesn't rewrite
pnpm typecheck
pnpm test
pnpm build
```

### Backend (`cd backend`)

```bash
uv run uvicorn app.main:app --reload
uv run ruff check .
uv run ruff format --check .  # what CI runs; includes tests and migrations
uv run ty check .
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
>
> The frontend has the matching piece for local UI work: `frontend/e2e/auth.setup.ts`
> seeds a browser session as that same dev-bypass user (Playwright's standard
> `storageState` auth pattern — https://playwright.dev/docs/auth — nothing in
> application code changes). See `frontend/e2e/README.md`.

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
- `docs/floor-plan-coordinates.md` for the `Table`/`Area` `x`/`y`/`rotation` coordinate contract
- `docs/product-audit-2026-08.md` for the combined product audit, feature-request scope, dependencies, and preferred implementation order

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

- Use American English in code, comments, and identifiers; use British English in user-facing UI text and translations (`frontend/messages/`)
- Prefer targeted tests first, then broader checks before handoff
- For every new or changed write operation, document its retry-safety decision in `docs/retry-safety.md`; do not advertise or automatically retry a write unless its documented strategy is implemented and tested
- When a change implements, closes, splits, supersedes, or materially changes an issue tracked in `docs/product-audit-2026-08.md`, update that document in the same change. For completed or superseded items, remove the row from the active phase, renumber the remaining preferred order, and add a row to **Completed or superseded work** with the date, issue/PR or commit, outcome, and a concise implementation note. Update affected dependencies, index/specification text, and acceptance-criteria checkboxes. Partial work stays in the active phase with revised notes; do not record completion until the documented acceptance criteria are satisfied. Preserve the original finding/specification as historical context.
- Do not commit automatically unless explicitly asked
- GitHub issues are living documents: never add comments to them. Record clarifications, decisions, new sub-issue links and corrections by editing the issue body (read it first, keep the original text, and add or adjust a clearly headed section), including on closed issues

## Styling

Tailwind v4 and Base UI are the frontend stack; Bootstrap was removed in #1111
(guide: `docs/frontend-ui.md`).

- UI is built from Base UI primitives in `frontend/src/components/ui/` styled
  with unprefixed Tailwind utilities (for example `flex gap-2 hover:bg-primary`).
  Tailwind preflight is the reset. Utilities are not `!important`.
- Cascade layers are declared in `frontend/src/styles/tailwind.css`, lowest to
  highest: `theme`, `base`, `vendor`, `components`, `utilities`. Leaflet/Swiper
  CSS goes in `vendor`; runtime themes (`frontend/public/themes/*.css`),
  `admin.css`, other component stylesheets and the `data-slot` rules in
  `tailwind.css` go in `components`. A utility on an element therefore beats all
  of them without specificity tricks. Any new stylesheet must declare its rules
  inside one of those layers, never unlayered (unlayered CSS beats every layer).
- Use semantic colours from `frontend/src/styles/tailwind.css`, mapped to the
  active runtime theme. Do not use raw palette colours, arbitrary values or
  inline styles. Dynamic positioning needs a deliberate, narrow lint exception
  (a scoped `oxlint-disable` comment with a justification; floor-plan
  coordinates, saved colours and data-derived ratios are the existing cases).
- Generate Base UI primitives on demand with `cd frontend && pnpm dlx shadcn@latest
  add <component>` using the committed `components.json` (`base-vega`, Lucide,
  Tailwind v4). Own and restyle the generated source; never run `init` over the
  existing theme or bulk-generate controls. Use `@/lib/utils` for `cn`, and
  Lucide for icons.
- `pnpm lint` runs Oxlint with all four shadcn rules (`no-arbitrary-values`,
  `no-inline-styles`, `no-unknown-classes`, `no-raw-colors`) configured directly
  in `frontend/.oxlintrc.json`. The only allowance is the list of owned
  class-name namespaces (`admin-*`, `site-*`, `riviera-*` and so on) whose rules
  live in the owned stylesheets above; add a namespace only when you add owned CSS
  for it. There is no generated allow-list and no exception baseline.
- Runtime themes toggle light/dark through `data-theme-mode` on `<html>` (and on
  the fixed-dark `data-theme-scope="admin"` scope); the Tailwind `dark` variant
  reads the same attribute.
