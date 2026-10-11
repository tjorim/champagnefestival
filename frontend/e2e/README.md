# E2E tests

Playwright, config in `../playwright.config.ts`. Tests run against `pnpm exec vite`
with `VITE_MSW=true` (mocked API responses, no real backend needed).

## Seeding mock state

The MSW service worker owns `/api`, so `page.route` cannot override it. Public state
the default handlers hard-code is seeded in `localStorage` before load (use
`page.addInitScript`): `msw:maintenance` (`"true"` shows the maintenance page) and
`msw:announcements` (a JSON array for `/api/announcements/active`). See
`custom-views.spec.ts`.

## Admin dashboard auth

Reaching `/admin` normally means a real Keycloak login. For local debugging and
authenticated e2e coverage, use Playwright's own recommended pattern instead —
authenticate once, save the session, reuse it — rather than clicking through
Keycloak every time:

- **New authenticated e2e specs**: name the file `*.authenticated.spec.ts`. It
  automatically runs under the `chromium-admin` project (see
  `playwright.config.ts`), which depends on the `setup` project
  (`auth.setup.ts`) and loads its `storageState`. See
  `admin-dashboard.authenticated.spec.ts` for the pattern. Existing specs are
  unaffected — the default `chromium` project still hits the real login flow,
  which is what `admin.spec.ts`'s "shows login prompt when not authenticated"
  test needs.

- **Manual debugging in a real browser**:
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
flow works exactly as before for anyone not opting into the authenticated
project.

## Accessibility scans

`accessibility.spec.ts` (public routes) and `accessibility.authenticated.spec.ts`
(admin shell) run `@axe-core/playwright` with the `wcag2a`, `wcag2aa`, `wcag21a` and
`wcag21aa` tags in three scenarios: light, dark (via `emulateMedia`) and a 375px-wide
viewport. Shared helpers live in `axe.ts`. To cover a new route, add it to the
route list in the matching spec.

Violations that predate the suite are recorded in `ALLOWED_VIOLATIONS` in `axe.ts`,
keyed by `route|scenario`, each with a reason. Fix the cause and delete the entry
instead of adding more; anything not listed fails the run. Contrast beyond what axe can
compute and screen-reader behavior still need manual review.

## Concurrent development servers

If another app occupies port 5173, run `PLAYWRIGHT_PORT=5174 pnpm test:e2e`.
The same port is used for Vite and Playwright's base URL; Vite uses strict-port
mode so a newly started server cannot silently move to a different port.
