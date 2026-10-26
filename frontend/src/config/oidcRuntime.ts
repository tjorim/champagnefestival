import type { AuthProviderProps } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import {
  OIDC_AUTHORITY,
  OIDC_CLIENT_ID,
  OIDC_REDIRECT_URI,
  OIDC_SILENT_REDIRECT_URI,
  OIDC_SCOPE,
  resolvePostSigninReturnTo,
  type OidcConfigOptions,
} from "./oidc";

export function createOidcConfig({ navigateTo }: OidcConfigOptions): AuthProviderProps {
  return {
    authority: OIDC_AUTHORITY,
    client_id: OIDC_CLIENT_ID,
    redirect_uri: OIDC_REDIRECT_URI,
    scope: OIDC_SCOPE,
    post_logout_redirect_uri: window.location.origin,
    silent_redirect_uri: OIDC_SILENT_REDIRECT_URI,
    automaticSilentRenew: true,
    monitorSession: true,
    revokeTokensOnSignout: true,
    // sessionStorage is thrown away on tab close, forcing a re-login even
    // though the still-valid Keycloak session (and refresh token behind it)
    // would otherwise let the app resume silently. See tjorim/worktime#1228
    // and tjorim/daynest#805 for the same fix.
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    onSigninCallback: (user) => {
      return navigateTo(resolvePostSigninReturnTo(user?.state));
    },
  };
}
