import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentType,
} from "react";
import type { AuthContextProps } from "react-oidc-context";
import type { User } from "oidc-client-ts";
import { OIDC_USER_STORAGE_KEY } from "@/config/oidc";
import { AuthProvider } from "./AuthContext";

type RuntimeProps = {
  navigateTo: (to: string) => void | Promise<void>;
  onReady: (auth: AuthContextProps) => void;
};
export function needsOidc(path: string): boolean {
  return /^\/(admin|check-in|venue-plan|me|pebble-pair)(\/|$)/.test(path);
}

function storedUser(): User | null {
  try {
    const raw = localStorage.getItem(OIDC_USER_STORAGE_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as User;
    if (!user.access_token || !user.profile?.sub) return null;
    return {
      ...user,
      expired: typeof user.expires_at === "number" && user.expires_at * 1000 <= Date.now(),
    } as User;
  } catch {
    return null;
  }
}

/** The runtime is a sibling: loading it never remounts a visitor's open form. */
export function LazyAuthProvider({
  children,
  navigateTo,
  subscribe,
}: {
  children: ReactNode;
  navigateTo: (to: string) => void | Promise<void>;
  subscribe: (onNavigate: (path: string) => void) => () => void;
}) {
  const [user] = useState(storedUser);
  const [path, setPath] = useState(location.pathname);
  const [enabled, setEnabled] = useState(
    () => !!user || needsOidc(location.pathname) || /[?&](code|error|state)=/.test(location.search),
  );
  const [auth, setAuth] = useState<AuthContextProps | null>(null);
  const [Runtime, setRuntime] = useState<ComponentType<RuntimeProps> | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  // Bumped by a new sign-in/renewal attempt after a failed import, to retry it.
  const [attempt, setAttempt] = useState(0);
  const ready = useRef<
    { resolve: (auth: AuthContextProps) => void; reject: (error: Error) => void }[]
  >([]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void import("./OidcRuntime")
      .then((module) => {
        if (current) setRuntime(() => module.default);
      })
      .catch((error: unknown) => {
        if (!current) return;
        const failure = error instanceof Error ? error : new Error("Authentication could not load");
        setLoadError(failure);
        for (const pending of ready.current.splice(0)) pending.reject(failure);
      });
    return () => {
      current = false;
    };
  }, [enabled, attempt]);
  const onReady = useCallback((value: AuthContextProps) => {
    setAuth(value);
    for (const pending of ready.current.splice(0)) pending.resolve(value);
  }, []);
  useEffect(
    () =>
      subscribe((path) => {
        setPath(path);
        if (needsOidc(path)) setEnabled(true);
      }),
    [subscribe],
  );
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === OIDC_USER_STORAGE_KEY && event.newValue) setEnabled(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const load = useCallback((): Promise<AuthContextProps> => {
    setEnabled(true);
    if (auth) return Promise.resolve(auth);
    const pending = new Promise<AuthContextProps>((resolve, reject) =>
      ready.current.push({ resolve, reject }),
    );
    if (loadError) {
      // A new attempt retries the failed import; it never replays an earlier sign-in.
      setLoadError(null);
      setAttempt((value) => value + 1);
    }
    return pending;
  }, [auth, loadError]);
  const snapshot = useMemo(
    () =>
      ({
        user,
        isAuthenticated: !!user && !user.expired,
        isLoading: needsOidc(path) && !auth && !loadError,
        error: loadError ?? undefined,
        signinRedirect: async (...args: Parameters<AuthContextProps["signinRedirect"]>) =>
          (await load()).signinRedirect(...args),
        signoutRedirect: async (...args: Parameters<AuthContextProps["signoutRedirect"]>) =>
          (await load()).signoutRedirect(...args),
        signinSilent: async () => (await load()).signinSilent(),
        removeUser: async () => (await load()).removeUser(),
      }) as AuthContextProps,
    [user, auth, load, loadError, path],
  );
  return (
    <>
      {Runtime && <Runtime navigateTo={navigateTo} onReady={onReady} />}
      <AuthProvider oidcAuth={auth ?? snapshot}>{children}</AuthProvider>
    </>
  );
}
