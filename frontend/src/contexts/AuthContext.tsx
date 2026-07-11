import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { useAuth as useOidcAuth } from "react-oidc-context";
import { devError } from "@/utils/devLog";

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  roles: string[];
  hasRole: (role: string) => boolean;
  /** Returns the current OIDC access token, or null when not authenticated. */
  getAccessToken: () => string | null;
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
    return JSON.parse(atob(padded)) as TokenClaims;
  } catch {
    return null;
  }
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

  const getAccessToken = useCallback((): string | null => {
    return oidcAuth.user?.access_token ?? null;
  }, [oidcAuth.user]);

  const roles = useMemo(() => {
    const accessTokenClaims = decodeTokenClaims(oidcAuth.user?.access_token);
    return extractRealmRoles(oidcAuth.user?.profile as TokenClaims | undefined, accessTokenClaims);
  }, [oidcAuth.user]);

  const hasRole = useCallback((role: string) => roles.includes(role), [roles]);

  const login = useCallback((returnTo = "/admin") => {
    oidcAuth.signinRedirect({ state: { returnTo } }).catch((error: unknown) => {
      devError("signinRedirect failed:", error);
    });
  }, [oidcAuth]);

  const logout = useCallback(() => {
    oidcAuth.signoutRedirect().catch((error: unknown) => {
      devError("signoutRedirect failed:", error);
    });
  }, [oidcAuth]);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      isAuthenticated: oidcAuth.isAuthenticated,
      isLoading: oidcAuth.isLoading,
      roles,
      hasRole,
      getAccessToken,
      login,
      logout,
    }),
    [oidcAuth.isAuthenticated, oidcAuth.isLoading, roles, hasRole, getAccessToken, login, logout],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
