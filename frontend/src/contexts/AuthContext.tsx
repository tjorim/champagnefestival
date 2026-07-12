import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth as useOidcAuth } from "react-oidc-context";
import { devError } from "@/utils/devLog";

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  roles: string[];
  hasRole: (role: string) => boolean;
  /** Returns the current OIDC access token, or null when not authenticated. */
  getAccessToken: () => string | null;
  /** Authentication error to show in the app instead of leaving it in the console/provider only. */
  authError: string | null;
  clearAuthError: () => void;
  login: (returnTo?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface TokenClaims {
  realm_access?: {
    roles?: unknown;
  };
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
  const { signinRedirect, signoutRedirect } = oidcAuth;
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const [dismissedOidcError, setDismissedOidcError] = useState<string | null>(null);

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

  const login = useCallback(
    (returnTo = "/admin") => {
      setRedirectError(null);
      setDismissedOidcError(null);
      signinRedirect({ state: { returnTo } }).catch((error: unknown) => {
        devError("signinRedirect failed:", error);
        setRedirectError(formatAuthError(error, "Could not start sign-in. Please try again."));
      });
    },
    [signinRedirect],
  );

  const logout = useCallback(() => {
    setRedirectError(null);
    setDismissedOidcError(null);
    signoutRedirect().catch((error: unknown) => {
      devError("signoutRedirect failed:", error);
      setRedirectError(formatAuthError(error, "Could not sign out. Please try again."));
    });
  }, [signoutRedirect]);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      isAuthenticated: oidcAuth.isAuthenticated,
      isLoading: oidcAuth.isLoading,
      roles,
      hasRole,
      getAccessToken,
      authError,
      clearAuthError,
      login,
      logout,
    }),
    [
      oidcAuth.isAuthenticated,
      oidcAuth.isLoading,
      roles,
      hasRole,
      getAccessToken,
      authError,
      clearAuthError,
      login,
      logout,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
