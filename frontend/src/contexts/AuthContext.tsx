import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState, useEffect } from "react";
import { useAuth as useOidcAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";
import { adminCachePersistence, ADMIN_CACHE_WIPE_SIGNAL } from "@/state/adminCachePersistence";
import { OIDC_USER_STORAGE_KEY } from "@/config/oidc";
import { devError } from "@/utils/devLog";
import { removeAuthenticatedQueries } from "@/utils/queryInvalidation";
import { signOutVisitorSession } from "@/utils/publicRegistrationApi";
import { m } from "@/paraglide/messages";

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
  /** Stable provider identity used to scope account data caches. */
  accountId?: string | null;
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
  const queryClient = useQueryClient();
  const cache = useMemo(() => adminCachePersistence(queryClient), [queryClient]);
  const [cacheOwnerReady, setCacheOwnerReady] = useState<string | null | undefined>(undefined);
  const cacheSubject = oidcAuth.user?.profile?.sub;
  const cacheOwner =
    !oidcAuth.isLoading &&
    oidcAuth.isAuthenticated &&
    !oidcAuth.user?.expired &&
    extractRealmRoles(
      oidcAuth.user?.profile as TokenClaims | undefined,
      decodeTokenClaims(oidcAuth.user?.access_token),
    ).some((role) => role === "admin" || role === "volunteer")
      ? cacheSubject
        ? `${OIDC_USER_STORAGE_KEY}:${cacheSubject}`
        : null
      : null;
  useEffect(() => {
    if (oidcAuth.isLoading) return;
    let current = true;
    void cache.setSession(cacheOwner).then(() => {
      if (current) setCacheOwnerReady(cacheOwner);
    });
    return () => {
      current = false;
    };
  }, [cache, cacheOwner, oidcAuth.isLoading]);
  const { removeUser } = oidcAuth;
  const expiresAt = oidcAuth.user?.expires_at;
  useEffect(() => {
    if (!cacheOwner || expiresAt === undefined) return;
    let timer: ReturnType<typeof setTimeout>;
    const checkExpiry = () => {
      const remaining = expiresAt * 1000 - Date.now();
      if (remaining <= 0) {
        void cache.wipe(true);
        void removeUser();
      } else {
        timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
      }
    };
    checkExpiry();
    return () => clearTimeout(timer);
  }, [cache, cacheOwner, expiresAt, removeUser]);
  useEffect(() => {
    if (!cacheOwner) return;
    const onStorage = (event: StorageEvent) => {
      let sessionLost = event.key === ADMIN_CACHE_WIPE_SIGNAL || event.key === null;
      if (event.key === OIDC_USER_STORAGE_KEY) {
        try {
          const user = event.newValue
            ? (JSON.parse(event.newValue) as {
                access_token?: string;
                expires_at?: number;
                profile?: TokenClaims & { sub?: string };
              })
            : null;
          sessionLost =
            !user ||
            user.profile?.sub !== cacheSubject ||
            (typeof user.expires_at === "number" && user.expires_at * 1000 <= Date.now()) ||
            !extractRealmRoles(user.profile, decodeTokenClaims(user.access_token)).some(
              (role) => role === "admin" || role === "volunteer",
            );
        } catch {
          sessionLost = true;
        }
      }
      if (sessionLost) {
        void cache.wipe();
        void removeUser();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [cache, cacheOwner, cacheSubject, removeUser]);
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

  const oidcError = oidcAuth.error ? formatAuthError(oidcAuth.error, m.auth_failed_retry()) : null;

  // Clear a stale dismissal once the underlying error itself clears. Adjust
  // during render (comparing against the previous oidcError) rather than in
  // an effect, since this only needs to react to that one transition.
  const [prevOidcError, setPrevOidcError] = useState(oidcError);
  if (oidcError !== prevOidcError) {
    setPrevOidcError(oidcError);
    if (oidcError === null) {
      setDismissedOidcError(null);
    }
  }

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
        setRedirectError(formatAuthError(error, m.auth_sign_in_start_failed()));
      });
    },
    [signinRedirect],
  );

  const logout = useCallback(() => {
    setRedirectError(null);
    setDismissedOidcError(null);
    setIsSigningOut(true);
    // One account can hold both an IdP session and an emailed-link session
    // (#1209). Revoke the latter first and keep every view if the server does
    // not confirm, so a failed sign-out never looks like a completed one.
    signOutVisitorSession()
      .then(() => {
        void cache.wipe(true);
        removeAuthenticatedQueries(queryClient);
        return signoutRedirect();
      })
      .catch((error: unknown) => {
        devError("sign out failed:", error);
        setIsSigningOut(false);
        setRedirectError(formatAuthError(error, m.auth_sign_out_failed()));
      });
  }, [cache, queryClient, signoutRedirect]);

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
      accountId: oidcAuth.user?.profile?.sub ?? null,
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
      oidcAuth.user?.profile?.sub,
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

  return (
    <AuthContext.Provider value={contextValue}>
      {cacheOwner !== null && (oidcAuth.isLoading || cacheOwnerReady !== cacheOwner)
        ? null
        : children}
    </AuthContext.Provider>
  );
}
