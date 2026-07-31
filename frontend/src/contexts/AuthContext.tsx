import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth as useOidcAuth } from "react-oidc-context";
import { devError } from "@/utils/devLog";

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * True from the moment a sign-in redirect is requested until the browser
   * leaves the page. Preparing the redirect needs a discovery round trip to the
   * IdP, so callers must show pending UI instead of an idle-looking button.
   */
  isSigningIn: boolean;
  /** Same idea for sign-out, which also round-trips to the IdP before leaving. */
  isSigningOut: boolean;
  /** Human-readable label for the signed-in account, or null when signed out. */
  accountLabel: string | null;
  roles: string[];
  hasRole: (role: string) => boolean;
  /** Returns the current OIDC access token, or null when not authenticated. */
  getAccessToken: () => string | null;
  /** Authentication error to show in the app instead of leaving it in the console/provider only. */
  authError: string | null;
  clearAuthError: () => void;
  login: (returnTo?: string) => void;
  logout: () => void;
  /**
   * Attempts a silent token renewal against the IdP session, resolving true when
   * a fresh token was obtained. Lets callers recover from a single 401 instead of
   * throwing the user out to the login screen.
   */
  renewSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface TokenClaims {
  realm_access?: {
    roles?: unknown;
  };
}

interface ProfileClaims {
  name?: unknown;
  preferred_username?: unknown;
  email?: unknown;
}

/** Prefer the friendliest identifier Keycloak gave us for "signed in as …". */
function resolveAccountLabel(profile: ProfileClaims | undefined): string | null {
  for (const claim of [profile?.name, profile?.preferred_username, profile?.email]) {
    if (typeof claim === "string" && claim.trim()) return claim.trim();
  }
  return null;
}

function decodeTokenClaims(token: string | undefined): TokenClaims | null {
  if (!token) return null;

  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as TokenClaims;
  } catch {
    return null;
  }
}

function formatAuthError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function extractRealmRoles(...claims: Array<TokenClaims | null | undefined>): string[] {
  const roles = new Set<string>();

  for (const claim of claims) {
    const claimRoles = claim?.realm_access?.roles;
    if (!Array.isArray(claimRoles)) continue;

    for (const role of claimRoles) {
      if (typeof role === "string") roles.add(role);
    }
  }

  return [...roles];
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const oidcAuth = useOidcAuth();
  const { signinRedirect, signoutRedirect, signinSilent } = oidcAuth;
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const [dismissedOidcError, setDismissedOidcError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const getAccessToken = useCallback((): string | null => {
    return oidcAuth.user?.access_token ?? null;
  }, [oidcAuth.user]);

  const roles = useMemo(() => {
    const accessTokenClaims = decodeTokenClaims(oidcAuth.user?.access_token);
    return extractRealmRoles(oidcAuth.user?.profile as TokenClaims | undefined, accessTokenClaims);
  }, [oidcAuth.user]);

  const hasRole = useCallback((role: string) => roles.includes(role), [roles]);

  const oidcError = oidcAuth.error
    ? formatAuthError(oidcAuth.error, "Authentication failed. Please try again.")
    : null;

  useEffect(() => {
    if (oidcError === null) {
      setDismissedOidcError(null);
    }
  }, [oidcError]);

  const visibleOidcError = oidcError === dismissedOidcError ? null : oidcError;
  const authError = redirectError ?? visibleOidcError;

  const clearAuthError = useCallback(() => {
    setRedirectError(null);
    setDismissedOidcError(oidcError);
  }, [oidcError]);

  // The pending flags are deliberately left set on success: the redirect has been
  // handed to the browser, so the control should stay busy until the page unloads
  // rather than flicking back to idle mid-navigation.
  const login = useCallback(
    (returnTo = "/admin") => {
      setRedirectError(null);
      setDismissedOidcError(null);
      setIsSigningIn(true);
      signinRedirect({ state: { returnTo } }).catch((error: unknown) => {
        devError("signinRedirect failed:", error);
        setIsSigningIn(false);
        setRedirectError(formatAuthError(error, "Could not start sign-in. Please try again."));
      });
    },
    [signinRedirect],
  );

  const logout = useCallback(() => {
    setRedirectError(null);
    setDismissedOidcError(null);
    setIsSigningOut(true);
    signoutRedirect().catch((error: unknown) => {
      devError("signoutRedirect failed:", error);
      setIsSigningOut(false);
      setRedirectError(formatAuthError(error, "Could not sign out. Please try again."));
    });
  }, [signoutRedirect]);

  const accountLabel = useMemo(
    () => resolveAccountLabel(oidcAuth.user?.profile as ProfileClaims | undefined),
    [oidcAuth.user],
  );

  const renewSession = useCallback(async (): Promise<boolean> => {
    try {
      // Resolves null when the IdP session is genuinely gone, which is a normal
      // outcome here rather than an error worth surfacing — the caller decides
      // what to do next.
      return (await signinSilent()) != null;
    } catch (error: unknown) {
      devError("signinSilent failed:", error);
      return false;
    }
  }, [signinSilent]);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      isAuthenticated: oidcAuth.isAuthenticated,
      isLoading: oidcAuth.isLoading,
      isSigningIn,
      isSigningOut,
      accountLabel,
      roles,
      hasRole,
      getAccessToken,
      authError,
      clearAuthError,
      login,
      logout,
      renewSession,
    }),
    [
      oidcAuth.isAuthenticated,
      oidcAuth.isLoading,
      isSigningIn,
      isSigningOut,
      accountLabel,
      roles,
      hasRole,
      getAccessToken,
      authError,
      clearAuthError,
      login,
      logout,
      renewSession,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
