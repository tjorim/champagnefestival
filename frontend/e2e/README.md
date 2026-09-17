# E2E tests

Playwright, config in `../playwright.config.ts`. Tests run against `pnpm exec vite`
with `VITE_MSW=true` (mocked API responses, no real backend needed).

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
same value before running the setup step *and* before starting the backend
(see the root `AGENTS.md` and `backend/app/oidc_config.py`'s
`_DEV_BYPASS_CLAIMS`) — that value then flows through as the session's
Authorization header instead.

This is test/dev tooling only — `frontend/src/config/oidc.ts` and
`frontend/src/contexts/AuthContext.tsx` are untouched, and the normal login
flow works exactly as before for anyone not opting into the authenticated
project.
