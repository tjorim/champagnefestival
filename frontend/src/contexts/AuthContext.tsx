import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { useAuth as useOidcAuth } from "react-oidc-context";
import { devError } from "@/utils/devLog";

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Returns the current OIDC access token, or null when not authenticated. */
  getAccessToken: () => string | null;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

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

  const login = useCallback(() => {
    oidcAuth.signinRedirect({ state: { returnTo: window.location.pathname } }).catch((error: unknown) => {
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
      getAccessToken,
      login,
      logout,
    }),
    [oidcAuth.isAuthenticated, oidcAuth.isLoading, getAccessToken, login, logout],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
