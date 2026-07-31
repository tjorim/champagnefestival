import { useEffect, useRef, useState } from "react";

/**
 * Recovers from a 401 across the admin dashboard's queries by attempting one
 * silent token renewal before signing the user out.
 *
 * A 401 here usually means the access token aged out while the Keycloak
 * session is still valid, so ejecting the user immediately is the wrong first
 * response. Exactly one renewal is attempted per episode — if the refreshed
 * token is rejected too, the session really is gone and retrying would stall
 * the dashboard rather than recover it.
 */

export interface UseAdminSessionRecoveryOptions {
  /** One error slot per watched query; `null` for queries that are fine. */
  errors: readonly (Error | null)[];
  /** Resolves true when a fresh token was obtained. */
  renewSession: () => Promise<boolean>;
  /** Refetches the watched queries after a successful renewal. */
  loadData: () => Promise<void>;
  /** Called once renewal has failed (or already been tried this episode). */
  onSignOut: () => void;
}

export interface UseAdminSessionRecoveryResult {
  /** True while a renewal attempt (and the refetch after it) is in flight. */
  isRenewingSession: boolean;
  /** The first non-unauthorized error across the watched queries, if any. */
  loadError: Error | null;
}

function isUnauthorized(error: Error | null): error is Error {
  return error instanceof Error && error.message === "unauthorized";
}

export function useAdminSessionRecovery({
  errors,
  renewSession,
  loadData,
  onSignOut,
}: UseAdminSessionRecoveryOptions): UseAdminSessionRecoveryResult {
  const [isRenewingSession, setIsRenewingSession] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);
  /** Guards against renewing in a loop when the refreshed token is rejected too. */
  const renewAttempted = useRef(false);

  useEffect(() => {
    const unauthorizedError = errors.find(isUnauthorized);
    if (unauthorizedError) {
      if (renewAttempted.current) {
        onSignOut();
        return;
      }
      renewAttempted.current = true;
      setIsRenewingSession(true);
      void (async () => {
        const renewed = await renewSession();
        if (!renewed) {
          setIsRenewingSession(false);
          onSignOut();
          return;
        }
        await loadData();
        setIsRenewingSession(false);
      })();
      return;
    }

    const firstError = errors.find((error) => error !== null);
    if (firstError) {
      setLoadError(firstError);
    } else {
      // Everything loaded: re-arm the renewal so a later expiry gets its own attempt.
      renewAttempted.current = false;
      setLoadError(null);
    }
  }, [errors, renewSession, loadData, onSignOut]);

  return { isRenewingSession, loadError };
}
