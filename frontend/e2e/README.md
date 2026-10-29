# E2E tests

Playwright, config in `../playwright.config.ts`. Tests run against `pnpm exec vite`
with `VITE_MSW=true` (mocked API responses, no real backend needed).

## Failure feedback

Pull-request CI stops the standard Playwright run after three failed test cases
(after the existing one retry per case). This bounds repeated failures across
theme/viewport matrices. The separate signage run (`playwright.signage.config.ts`)
has no failure limit. Main, manual and local runs retain the full suite. Assertion and test timeouts are
unchanged: cold Vite loads still need the documented assertion allowance.

For diagnosis, run the affected files with `--retries=0 --max-failures=1`, fix the
first failure, then rerun the relevant matrix. Tests for a particular admin
section should open `/admin?section=...`; `/admin` intentionally opens My tasks.

## CI sharding

`Frontend CI` splits the Playwright run over four runners (`--shard=N/4`, one worker
each, because concurrent cold Vite loads cause contention) and runs the production
signage suite (`playwright.signage.config.ts`) on its own runner at the same time.
Playwright shards by spec file and adds the `setup` project to every shard that has
authenticated specs. The `E2E Tests (Chromium)` job aggregates all of them, so the
required check name is unchanged and fails if any shard or the signage run failed,
was cancelled or did not run.

Each shard uploads its own HTML report (`playwright-report-N`, with traces for retried
tests) and the signage run uploads `playwright-report-signage`. There is no merged report: a
failing shard's job names the report to open. Changing the shard count means editing the
matrix, the `--shard=N/4` flags and the job name in `.github/workflows/frontend-ci.yml`.

Pull requests and pushes to `main` run the default theme only; the other themes are
temporary and only manual runs (`workflow_dispatch`) cover all of them (553 tests, about
40 min serial, which exceeded the old 30 min single-job timeout).

Measurements (the default-theme run, 270 tests, one worker): the single job took 20.1 min
of tests (21.4 min wall). Split by file, the heaviest of four shards holds about 32% of the
test time (about 6.5 min of tests plus about 1.5 min setup), so the wall time should fall
to about 8 min while runner minutes rise by about 25% (four installs).

## Seeding mock state

The MSW service worker owns `/api`, so `page.route` cannot override it. Public state
the default handlers hard-code is seeded in `localStorage` before load (use
`page.addInitScript`): `msw:maintenance` (`"true"` shows the maintenance page) and
`msw:announcements` (a JSON array for `/api/announcements/active`). See
`custom-views.spec.ts`.

## Admin dashboard auth

For ordinary manual debugging in your own browser, run Vite with
`DEV_AUTH_BYPASS_TOKEN=dev-token pnpm dev`, run the backend in development with
the same token, then open <http://localhost:5173/admin>. The Vite dev server
seeds the OIDC session before the application loads and authenticates proxied
API calls. No special login URL is needed. See
[local admin setup](../../README.md#local-admin-sign-in-without-keycloak).

For authenticated e2e coverage, leave that frontend opt-in unset and use
Playwright's authenticate-once/storageState pattern:

- **New authenticated e2e specs**: name the file `*.authenticated.spec.ts`. It
  automatically runs under the `chromium-admin` project (see
  `playwright.config.ts`), which depends on the `setup` project
  (`auth.setup.ts`) and loads its `storageState`. See
  `admin-dashboard.authenticated.spec.ts` for the pattern. Existing specs are
  unaffected — the default `chromium` project still hits the real login flow,
  which is what `admin.spec.ts`'s "shows login prompt when not authenticated"
  test needs.

- **Optional separate Playwright browser window**:
  ```bash
  pnpm dev                                    # terminal 1
  pnpm exec playwright test --project=setup   # once, generates e2e/.auth/admin.json
  node e2e/open-admin.mjs                     # terminal 2 — opens a logged-in window
  ```

`auth.setup.ts` seeds the same `oidc.user:<authority>:<client_id>` localStorage
entry a real login would leave behind. By default it uses this repo's own MSW
happy-path token (`mock-access-token` — see `src/mocks/handlers/admin.ts`'s
`validAdminTokens`), so it authenticates against the mocks with zero setup.
To instead point at a real running backend, set `DEV_AUTH_BYPASS_TOKEN` to the
same value before running the setup step _and_ before starting the backend
(see the root `AGENTS.md` and `backend/app/oidc_config.py`'s
`_DEV_BYPASS_CLAIMS`) — that value then flows through as the session's
Authorization header instead.

This is test/dev tooling only — `frontend/src/config/oidc.ts` and
`frontend/src/contexts/AuthContext.tsx` are untouched, and the normal login
flow works exactly as before when neither the Vite dev-session opt-in nor
the authenticated Playwright project is used.

## Accessibility scans

`accessibility.spec.ts` (public routes) and `accessibility.authenticated.spec.ts`
(admin shell) run `@axe-core/playwright` with the `wcag2a`, `wcag2aa`, `wcag21a` and
`wcag21aa` tags in three scenarios: light, dark (via `emulateMedia`) and a 375px-wide
viewport. Shared helpers live in `axe.ts`. To cover a new route, add it to the
route list in the matching spec.

The default `refresh` theme is scanned on every route. The other visual themes in
`src/config/visualThemes.json` are scanned on the routes marked `allThemes` (`/`,
`/check-in`) and on `/admin`, with the theme seeded in `localStorage` before load. Only
themes whose `colorMode` is `system` run both light and dark; fixed-mode themes run their
own mode plus the narrow scenario. A new theme in the JSON file is picked up automatically.

A violation that cannot be fixed yet is recorded in `ALLOWED_VIOLATIONS` in `axe.ts`,
keyed by `theme|route|scenario`, each with a reason. Fix the cause and delete the entry
instead of adding more; anything not listed fails the run. Contrast beyond what axe can
compute and screen-reader behavior still need manual review.

## Concurrent development servers

If another app occupies port 5173, run `PLAYWRIGHT_PORT=5174 pnpm test:e2e`.
The same port is used for Vite and Playwright's base URL; Vite uses strict-port
mode so a newly started server cannot silently move to a different port.

## Production signage worker

`pnpm exec playwright test --config playwright.signage.config.ts` builds and
serves the production app on port 5178, testing the shared worker without MSW.
This runs separately in CI after the standard browser suite.

## What CI runs

Most specs repeat across the six visual themes, both colour schemes and two widths. To keep
feedback fast, pull request runs skip every title containing `classic`, `riviera`, `cuvee`,
`remuage` or `millesime` (`--grep-invert`, set in `.github/workflows/frontend-ci.yml`), which
leaves the default `refresh` theme at every width and colour scheme. Pushes to `main` and manual
runs (`gh workflow run frontend-ci.yml --ref <branch>`) run all themes, so run that before merging
a change to themes, CSS layers or shared UI. Name theme-specific test titles after the theme so
the filter applies to them. A job-level timeout stops a run that hangs.

## Public offline mode

`pnpm exec playwright test --config playwright.signage.config.ts public-offline.spec.ts`
builds the production app and exercises its real service worker, independently
of MSW. One online visit warms the shell and public information; Playwright then
sets the context offline and reloads, checking FAQ, schedule, venue, contact,
cache timestamp and refused form submission. The production-worker CI job runs
this alongside signage playback.
