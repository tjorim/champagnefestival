# AGENTS.md

## Project overview

Champagnefestival is the website, reservation and check-in system of the Champagnefestival: a React 19 + Vite +
TypeScript 7 single-page app (`frontend/`), a FastAPI + SQLAlchemy backend (`backend/`) whose OpenAPI document drives the
frontend's generated API types, an Android app for event days (`android/`) and an experimental Pebble companion (`pebble/`).
Toolchain versions live in `frontend/.node-version`, the `packageManager` field of `frontend/package.json` and
`backend/pyproject.toml`; see `docs/toolchain.md` for the coordinated rollout.

## Repository layout

- `frontend/` contains the web app
- `backend/` contains the FastAPI service
- `android/` contains the event-day Android app
- `pebble/` contains an experimental, unshipped Pebble (Alloy) companion app scaffold — see `pebble/README.md` (tracks issue #757)
- `docs/` holds operational contracts, decisions and the product audit; `scripts/` the release tooling
- `infra/` holds deployment configuration; production hosting for `champagnefestival.tjor.im` is handled by the separate infra stack in `/opt/apps/infra`
- Frontend builds write to `frontend/dist`; in production, Caddy serves this content from `/srv/champagnefestival`

### Uploaded files

Logos, edition artwork and signage images follow
`docs/file-storage-contract.md`: fresh names, write before commit and delete
after commit, every change under its feature's advisory lock (1194, 1224,
1261), and no dot-entries. The apps backup depends on these rules and lock
keys; keep new file-backed features inside them.

### Source of truth

- `VERSION` (repo root) for the app version — see "Release"
- `frontend/src/config/navigation.ts` for site navigation
- `frontend/messages/` for translation content
- `frontend/src/components/ResponsiveImage.tsx` for shared image behavior
- `backend/` for API shapes: `frontend/openapi.json` is the committed OpenAPI document (`uv run python -m app.openapi_export`), `frontend/src/api-schema/` is generated from it by Orval, and `frontend/src/api-types.ts` is the one place screens import API types from
- `frontend/src/utils/adminApi.ts` and `frontend/src/utils/adminRegistrationApi.ts` for admin API integration
- `docs/floor-plan-coordinates.md` for the `Table`/`Area` `x`/`y`/`rotation` coordinate contract
- `docs/product-audit-2026-08.md` for the combined product audit, feature-request scope, dependencies, and preferred implementation order

## Commands

### Frontend (`cd frontend`)

```bash
pnpm dev
pnpm lint
pnpm format         # rewrites files in place
pnpm format:check   # what CI runs — fails on unformatted files, doesn't rewrite
pnpm format:repo    # same for ../.github, ../scripts and the root JSON files (format:repo:check in CI)
pnpm typecheck      # includes api:check
pnpm api:generate   # rewrites openapi.json (needs uv) and src/api-schema/
pnpm api:check      # fails when src/api-schema/ is stale against openapi.json
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

Do not hand-edit generated or synced files: `frontend/openapi.json`, `frontend/src/api-schema/` and `frontend/src/paraglide/`
(see "API contract"), or the `version` field of `frontend/package.json` (see "Release").

Other frontend scripts follow the shared names: `test:watch`, `test:e2e`, `test:compatibility` (+ `:runtime`, `:browsers`),
`bundle:check`, `bundle:report`, `bundle:test`, `locale:audit`, `check-message-parity`, `paraglide:compile` and
`ui:check`, `ui:test`, `ui:usage`, `ui:upstream`, `ui:diff`, `ui:record`.

> **Prerequisites:** none. Tests and a local dev instance both run on SQLite by default, so no
> container is needed. The suite takes under two minutes that way (about four on PostgreSQL).
> Production runs on PostgreSQL and CI runs the whole suite against it too. What SQLite cannot
> do, `app/sqlite_compat.py` and `app/sqlite_functions.py` stand in for: UTC datetimes, foreign
> keys, the `pg_trgm`/`unaccent` search functions and their triggers, and an in-process
> `pg_notify` that reaches the live-update stream on commit. Tests that exercise real
> PostgreSQL behaviour (concurrent sessions and locks, the Alembic migrations, the ledger
> trigger, LISTEN reconnects) are marked `requires_postgres` and skip on SQLite. SQLite cannot
> relay across processes, so a SQLite dev instance is single-process.
>
> For a dev instance set `DATABASE_URL=sqlite+aiosqlite:///./dev.db`; the schema is created at
> startup. `create_all` never alters an existing table, so delete the file after a model change.
>
> To run against PostgreSQL instead, start one with `docker compose up db -d` from the repo root
> (uses `docker-compose.yml`) and set `DATABASE_URL` and `TEST_DATABASE_URL` to
> `postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne`.
>
> Auth doesn't require a local Keycloak/IdP — set `DEV_AUTH_BYPASS_TOKEN` to any
> string and pass it as `Authorization: Bearer <value>`; it's treated as a fixed
> dev user with the admin and volunteer realm roles. Refuses to start if set
> outside `ENVIRONMENT=development`.
>
> For manual UI work, start Vite with the same `DEV_AUTH_BYPASS_TOKEN`; opening
> `http://localhost:5173/admin` in any browser is then already signed in as that
> dev user. The Vite dev server seeds the session and authenticates proxied API
> calls; production builds and `pnpm preview` do not enable it. See the root
> README's "Local admin sign-in without Keycloak" section.
>
> Authenticated browser tests retain `frontend/e2e/auth.setup.ts` and Playwright's
> standard `storageState` pattern (https://playwright.dev/docs/auth), with no
> application-code bypass. See `frontend/e2e/README.md`.

## Conventions

### Code style

- Do not commit automatically unless explicitly asked
- Client code uses the API's own shapes: the types generated from `frontend/openapi.json` (via `@/api-types`) are the client types, with their snake_case field names (`start_date`, `table_type_id`, `width_m`), and responses are read as they arrive. There is no per-field mapper and no camelCase copy of an API record. camelCase is for values that exist only in the interface (component props, form state, local variables); a form draft that is sent to the API is built from, or typed as, the generated request type. Do not declare a hand-written type for an API record
- Follow `backend/README.md` ("Request schema conventions") for create/update schemas; reuse `backend/app/schema_types.py` constraints and keep defaults and nullability explicit.
- For every new or changed write operation, document its retry-safety decision in `docs/retry-safety.md`; do not advertise or automatically retry a write unless its documented strategy is implemented and tested
- Never render `error.message` (or a backend `detail`) in the interface: it is English diagnostics. Show `apiErrorMessage(error, m.<translated operation fallback>())` from `frontend/src/utils/apiErrors.ts`, and give errors the interface can explain a stable `code` in the backend (`ApiHTTPException`; see `backend/README.md`, "Error codes")

### Styling and UI

Tailwind v4 and Base UI are the frontend stack; Bootstrap was removed in #1111
(guide: `docs/frontend-ui.md`).

- UI is built from Base UI primitives in `frontend/src/components/ui/` styled
  with unprefixed Tailwind utilities (for example `flex gap-2 hover:bg-primary`).
  Tailwind preflight is the reset. Utilities are not `!important`.
- Cascade layers are declared in `frontend/src/styles/tailwind.css`, lowest to
  highest: `theme`, `base`, `vendor`, `components`, `utilities`. Leaflet
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
- Before implementing or restyling UI, inspect existing shared components and
  check the configured shadcn/Base UI registry and official documentation for
  an existing component, variant or behaviour. Reuse or generate the supported
  implementation first; add custom code only for requirements it does not cover.
  Apply shared improvements consistently to the relevant consumers.
- Generate Base UI primitives on demand with `cd frontend && pnpm exec shadcn
  add <component>` using the committed `components.json` (`base-vega`, Lucide,
  Tailwind v4). Own and restyle the generated source; never run `init` over the
  existing theme or bulk-generate controls. Use `@/lib/utils` for `cn`, and
  Lucide for icons.
- `pnpm lint` runs Oxlint with all four shadcn rules (`no-arbitrary-values`,
  `no-inline-styles`, `no-unknown-classes`, `no-raw-colors`) configured directly
  in `frontend/oxlint.config.ts`. The only allowance is the list of owned
  class-name namespaces (`admin-*`, `site-*`, `riviera-*` and so on) whose rules
  live in the owned stylesheets above; add a namespace only when you add owned CSS
  for it. There is no generated allow-list and no exception baseline.
- Runtime themes toggle light/dark through `data-theme-mode` on `<html>` (and on
  the fixed-dark `data-theme-scope="admin"` scope); the Tailwind `dark` variant
  reads the same attribute.

Follow [docs/ui-maintenance.md](docs/ui-maintenance.md) for Base UI/runtime updates and the pinned shadcn CLI, registry comparisons and review records. Run `pnpm ui:check` from `frontend/` after changing shared UI. Renovate does not update owned component source; preserve the documented customisations and validate interactions and bundle budgets.

Application UI imports use `@/components/ui/<component>`. Direct Base UI subpath imports belong in inventoried UI adapters or exact documented composition exceptions. `pnpm ui:check` enforces the policy; `pnpm ui:test` tests it. Keep styles and application behaviour when aligning imports.

### Tests

- Prefer targeted tests first, then broader checks before handoff (see "Testing")

### Internationalisation

- Use American English in code, comments, and identifiers; use British English in user-facing UI text and translations (`frontend/messages/`)
- Content written for visitors (events, FAQ, announcements, policies, products, categories, ...) stores required Dutch text (`_nl`) plus optional `_fr`/`_en` translations and falls back to Dutch (there is no original-language field); follow the pattern in `backend/README.md` ("Translated content and product categories") instead of adding single-language text columns

### Project process

- When a change implements, closes, splits, supersedes, or materially changes an issue tracked in `docs/product-audit-2026-08.md`, update that document in the same change. For completed or superseded items, remove the row from the active phase, renumber the remaining preferred order, and add a row to **Completed or superseded work** with the date, issue/PR or commit, outcome, and a concise implementation note. Update affected dependencies, index/specification text, and acceptance-criteria checkboxes. Partial work stays in the active phase with revised notes; do not record completion until the documented acceptance criteria are satisfied. Preserve the original finding/specification as historical context.
- GitHub issues are living documents: never add comments to them. Record clarifications, decisions, new sub-issue links and corrections by editing the issue body (read it first, keep the original text, and add or adjust a clearly headed section), including on closed issues

## API contract

The backend's response models are the source of truth for the frontend's API types, and nothing in between is written by hand:

```text
backend response models -> uv run python -m app.openapi_export (pnpm api:generate)
  -> frontend/openapi.json -> Orval (frontend/orval.config.mjs) -> frontend/src/api-schema/
  -> frontend/src/api-types.ts (the one import point for API shapes)
```

- `frontend/openapi.json` is a committed snapshot of the backend's OpenAPI document with `info.version` pinned to
  `"snapshot"`, so a release bump never stales it. `frontend/src/api-schema/` is generated from it, one file per
  schema. Never hand-edit either, and do not declare an API record type anywhere else in the frontend.
- To add or change an endpoint: give the route a `response_model` (a test enforces it; a response model derives from
  `ResponseModel` in `backend/app/schemas.py` so a field with a default is required in the generated type), run
  `pnpm api:generate` in `frontend/` (it needs `uv`), commit `openapi.json` and `src/api-schema/`, and alias the
  generated record for the screens in `frontend/src/api-types.ts`.
- `pnpm typecheck` runs `pnpm api:check` and fails when `src/api-schema/` is stale; the backend test
  `test_openapi_snapshot` fails when `openapi.json` is stale. `backend/tests/test_response_models.py` fails on a JSON
  route without a documented response schema, and on an optional response field without a per-field
  wire-omission reason in `OPTIONAL_ON_THE_WIRE` (it rejects both new unexplained fields and stale exceptions).
  Request optionality is a separate contract.
- Success fixtures (MSW handlers, fetch doubles, Playwright route fulfils) must choose a generated response schema
  explicitly: `HttpResponse.json<Api.Model>(...)`, `jsonResponse<Api.Model>(...)` from `@/mocks/response`, or
  `satisfies Api.Model` at a browser response boundary. `jsonResponse` uses `NoInfer` and defaults to `never`, so a
  payload never infers its own contract. The source guard `frontend/tests/types/fixtureContracts.test.ts` fails on a
  fixture that is unchecked or erased (`as unknown`, `any`), and `frontend/tests/types/apiFixtures.ts` holds
  compile-only negative checks.
- A deliberately malformed, error, external-provider, control or persistence fixture is exempt only with a comment
  at the call site that says why, starting `Fixture exception:` or `Deliberately malformed:`.

## Testing

- Frontend unit and component tests run with Vitest (`pnpm test`, happy-dom, `frontend/tests/setup.ts`); the runtime
  compatibility suite is `pnpm test:compatibility:runtime`. Playwright specs live in `frontend/e2e/` (`pnpm test:e2e`,
  see `frontend/e2e/README.md`; `playwright.signage.config.ts` covers the production signage build and
  `pnpm test:compatibility:browsers` the native-React baseline).
- `pnpm bundle:test` and `pnpm bundle:check` guard the bundle budgets (`frontend/bundle-budget.json`, `docs/bundle-budgets.md`);
  `pnpm ui:test` and `pnpm ui:check` guard the UI dependency inventory; `pnpm locale:audit` and `pnpm check-message-parity`
  guard interface strings and catalogues.
- Backend tests: `uv run pytest` (SQLite by default, PostgreSQL via `TEST_DATABASE_URL`; `requires_postgres` tests skip on
  SQLite). `test_openapi_snapshot` and `tests/test_response_models.py` enforce the API contract.
- API fixtures must follow the fixture-contract rules in "API contract".


## CI

Third-party actions are pinned to full commit SHAs with inline version comments.

`.github/workflows/ci.yml` detects changed components with path filters, calls the component workflows and ends in
a single `CI gate` job that fails when any needed job failed or was cancelled (a job skipped because its component
did not change is fine). No branch protection is configured. Component workflows are `backend-ci.yml` (job
`Backend`), `frontend-ci.yml` (job `Frontend`, plus the `E2E` jobs: pull requests run the default theme only, `main` and
manual runs run all themes, see `frontend/e2e/README.md`), `android.yml`, `pebble.yml`, `pr-preview.yml` and the
`codeql-actions.yml`, `codeql-javascript.yml`, `codeql-python.yml` and `codeql-android.yml` analyses. Checks appear as
`<ci.yml job> / <workflow job>`, for example `Frontend / E2E Tests (Chromium)`.

The frontend job runs, in order: `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `format:check`,
`format:repo:check`, `test`, `build`, `bundle:test` and `bundle:check`, `locale:audit`, `check-message-parity` and
`ui:test` with `ui:check`. The backend job runs `uv sync --locked`, `ruff check`, `ruff format --check`, `ty check`,
the migration checks and `pytest` (PostgreSQL, then SQLite).

Future workflow additions should follow these conventions:
- Event-day Android APK/manual workflows stay separate from normal frontend/backend CI.
- Android release artifacts skip gracefully when signing secrets are missing.
- New workflows scope their `paths` triggers to the code they actually test.


## Release

### Versioning

The app uses CalVer: `YYYY.MM.MICRO` (e.g. `2026.7.1`), where `MICRO` is a counter
that resets to `1` at the start of each new month.

The root `VERSION` file is the single source of truth. Everything else derives
from it — nothing else should be hand-edited:

- `backend/app/version.py` reads it at runtime (`APP_VERSION`), used by
  `app/main.py` and the `/api/health` response.
- `frontend/package.json`'s `version` field is synced from it automatically by
  `frontend/scripts/sync-version.mjs`, run as part of `pnpm build`.
- `android/app/build.gradle.kts` reads it directly to compute `versionName`/`versionCode`.

### Release process

1. Add entries under `## [Unreleased]` in `CHANGELOG.md` while working (`### Added`, `### Changed`,
   `### Fixed`, `### Removed`). Put backend, infrastructure, CI and dependency changes under
   `### Internal`: apps hide that heading from users. Prefix a bullet with `**Android:**` (any scope in
   `release.config.json`) when it only applies to one client.
   `node scripts/release.mjs export --audience app --platform android` prints what an app should show.
2. `node scripts/release.mjs bump` writes the next `YYYY.M.MICRO` into `VERSION` and
   `frontend/package.json` and turns `[Unreleased]` into the dated release section and compare links.
   Review the diff, open the release PR and merge it.
3. Push tag `vYYYY.M.MICRO` to run `.github/workflows/release.yml`. It re-checks the tag against
   `VERSION`, `frontend/package.json` and the changelog (`node scripts/release.mjs check --tag`).
4. Wait for backend/frontend checks to pass; the workflow creates a **draft** release whose notes are the
   changelog section.
5. Publish the draft release. Publishing does not deploy: the VPS deploys `origin/main` through the infra stack
   (`scripts/upgrade-apps.sh` in `tjorim/apps`), see tjorim/apps#345.
6. Deploy explicitly with `/opt/apps/scripts/upgrade-apps.sh champagnefestival` or the infra deploy playbook.
   Verify `/api/health` reports the build checkout's `VERSION` and full `commit`;
   `origin/main` may be newer than the published release tag.

`node scripts/release.mjs check` also runs in CI on every pull request.

See `RELEASE-RUNBOOK.md` for release ownership, post-deploy verification, migration sign-off, and rollback procedures.

## Pitfalls

- Never hand-edit `frontend/openapi.json` or `frontend/src/api-schema/`; run `pnpm api:generate` instead.
- A dev instance on SQLite creates its schema at startup with `create_all`, which never alters an existing table: delete
  the SQLite file after a model change. Only SQLAlchemy model/table changes need an Alembic revision.
- `DEV_AUTH_BYPASS_TOKEN` makes the backend refuse to start outside `ENVIRONMENT=development`; it is never enabled in
  production builds or `pnpm preview`.
- Unlayered CSS beats every Tailwind cascade layer: declare new stylesheet rules inside a layer.
- File-backed features must follow `docs/file-storage-contract.md` and its advisory lock keys, or the apps backup breaks.
- Publishing a GitHub release does not deploy; deploy explicitly (see "Release process").
