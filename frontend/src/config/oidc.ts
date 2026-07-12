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

import type { AuthProviderProps } from "react-oidc-context";

const OIDC_AUTHORITY =
  import.meta.env.VITE_OIDC_AUTHORITY ?? "http://localhost:9000/application/o/champagnefestival";
const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID ?? "champagnefestival";
const OIDC_REDIRECT_URI =
  import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/admin`;
const OIDC_SILENT_REDIRECT_URI =
  import.meta.env.VITE_OIDC_SILENT_REDIRECT_URI ?? `${window.location.origin}/admin`;
const OIDC_SCOPE = import.meta.env.VITE_OIDC_SCOPE ?? "openid profile email";

interface OidcConfigOptions {
  navigateTo: (to: string) => void | Promise<void>;
}

export function createOidcConfig({ navigateTo }: OidcConfigOptions): AuthProviderProps {
  return {
    authority: OIDC_AUTHORITY,
    client_id: OIDC_CLIENT_ID,
    redirect_uri: OIDC_REDIRECT_URI,
    scope: OIDC_SCOPE,
    post_logout_redirect_uri: window.location.origin,
    silent_redirect_uri: OIDC_SILENT_REDIRECT_URI,
    automaticSilentRenew: true,
    onSigninCallback: (user) => {
      const returnTo = (user?.state as { returnTo?: string } | undefined)?.returnTo ?? "/admin";
      return navigateTo(returnTo);
    },
  };
}
