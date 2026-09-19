import { test as setup } from "@playwright/test";

/**
 * Playwright's documented "authenticate once, reuse everywhere" pattern
 * (https://playwright.dev/docs/auth) applied to this app's react-oidc-context
 * setup. Seeds the same localStorage entry a real Keycloak login would leave
 * behind — using the backend's existing DEV_AUTH_BYPASS_TOKEN dev user
 * (see AGENTS.md and backend/app/oidc_config.py's _DEV_BYPASS_CLAIMS) — then
 * saves it as reusable storageState.
 *
 * This never touches application auth code: it's Playwright constructing a
 * valid logged-in session up front, the same way any e2e suite authenticates
 * against a real login flow.
 *
 * Run via the "setup" project (see playwright.config.ts) before any spec file
 * that opts in with `test.use({ storageState: authFile })`.
 */

export const authFile = "e2e/.auth/admin.json";

// Matches frontend/src/config/oidc.ts's own defaults, overridable the same way.
const OIDC_AUTHORITY =
  process.env.VITE_OIDC_AUTHORITY ?? "http://localhost:9000/application/o/champagnefestival";
const OIDC_CLIENT_ID = process.env.VITE_OIDC_CLIENT_ID ?? "champagnefestival";
const storageKey = `oidc.user:${OIDC_AUTHORITY}:${OIDC_CLIENT_ID}`;

// Matches the backend's _DEV_BYPASS_CLAIMS (backend/app/oidc_config.py) so a
// real backend started with the same DEV_AUTH_BYPASS_TOKEN also accepts this
// session's Authorization header, not just the frontend UI. The fallback is
// this repo's own MSW happy-path token (src/mocks/handlers/admin.ts's
// validAdminTokens, also used throughout frontend/tests/), so e2e runs
// (VITE_MSW=true, no real backend) authenticate against the mocks too.
const bypassToken = process.env.DEV_AUTH_BYPASS_TOKEN ?? "mock-access-token";

function buildFakeOidcUser() {
  return {
    id_token: bypassToken,
    session_state: null,
    access_token: bypassToken,
    refresh_token: null,
    token_type: "Bearer",
    scope: "openid profile email",
    profile: {
      sub: "dev-bypass-user",
      preferred_username: "devuser",
      name: "Dev User",
      email: "dev@localhost",
      email_verified: true,
      realm_access: { roles: ["admin", "volunteer"] },
    },
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  };
}

setup("authenticate as admin", async ({ page, baseURL }) => {
  // Navigate first so the localStorage write lands on the app's own origin.
  await page.goto(baseURL ?? "/");
  await page.evaluate(([key, user]) => window.localStorage.setItem(key, user), [
    storageKey,
    JSON.stringify(buildFakeOidcUser()),
  ] as [string, string]);
  await page.context().storageState({ path: authFile });
});
