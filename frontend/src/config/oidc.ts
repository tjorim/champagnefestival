/**
 * OIDC configuration for react-oidc-context.
 *
 * Environment variables (all optional):
 *   VITE_OIDC_AUTHORITY     — OIDC provider base URL
 *   VITE_OIDC_CLIENT_ID     — Client identifier registered with the provider
 *   VITE_OIDC_REDIRECT_URI         — Callback URL after successful login
 *   VITE_OIDC_SILENT_REDIRECT_URI  — Hidden iframe callback URL for silent renewal
 *   VITE_OIDC_SCOPE                — Requested OAuth scopes (default: openid profile email)
 */

export const OIDC_AUTHORITY =
  import.meta.env.VITE_OIDC_AUTHORITY ?? "http://localhost:9000/application/o/champagnefestival";
export const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID ?? "champagnefestival";
export const OIDC_REDIRECT_URI =
  import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/admin`;
export const OIDC_SILENT_REDIRECT_URI =
  import.meta.env.VITE_OIDC_SILENT_REDIRECT_URI ?? `${window.location.origin}/admin`;
export const OIDC_USER_STORAGE_KEY = `oidc.user:${OIDC_AUTHORITY}:${OIDC_CLIENT_ID}`;
export const OIDC_SCOPE = import.meta.env.VITE_OIDC_SCOPE ?? "openid profile email";

export interface OidcConfigOptions {
  navigateTo: (to: string) => void | Promise<void>;
}

/**
 * Reads the current access token straight out of the same localStorage entry
 * `oidc-client-ts`'s `WebStorageStateStore` maintains (`oidc.user:<authority>:<client_id>`),
 * for the router loader, which runs outside React and can't call the
 * `useAuth()` hook. Mirrors `frontend/e2e/auth.setup.ts`'s storage key
 * construction — keep the two in sync if either changes.
 *
 * Best-effort only: returns `null` on any missing/unparsable/expired session
 * rather than throwing, since a failed prefetch should silently fall back to
 * the component's own `useQuery`/auth handling, not break navigation.
 */
export function getStoredAccessToken(): string | null {
  try {
    const raw = window.localStorage.getItem(OIDC_USER_STORAGE_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as { access_token?: string; expires_at?: number };
    if (!user.access_token) return null;
    if (typeof user.expires_at === "number" && user.expires_at * 1000 <= Date.now()) return null;
    return user.access_token;
  } catch {
    return null;
  }
}

export function resolvePostSigninReturnTo(state: unknown): string {
  const returnTo = (state as { returnTo?: unknown } | undefined)?.returnTo;
  return typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/admin";
}
