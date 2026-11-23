import { SESSION_EXPIRED_ERROR, UNAUTHORIZED_ERROR } from "@/lib/api/adminApi";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  refresh: () => Promise<void>;
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
  return (
    error instanceof Error && [SESSION_EXPIRED_ERROR, UNAUTHORIZED_ERROR].includes(error.message)
  );
}

export function useAdminSessionRecovery({
  errors,
  renewSession,
  refresh,
  onSignOut,
}: UseAdminSessionRecoveryOptions): UseAdminSessionRecoveryResult {
  const [isRenewingSession, setIsRenewingSession] = useState(false);
  const loadError = errors.find((error) => error !== null && !isUnauthorized(error)) ?? null;
  /** Guards against renewing in a loop when the refreshed token is rejected too. */
  const renewAttempted = useRef(false);
  const renewalInFlight = useRef(false);
  const latestErrors = useRef(errors);
  useLayoutEffect(() => {
    latestErrors.current = errors;
  }, [errors]);

  useEffect(() => {
    if (renewalInFlight.current) return;
    const unauthorizedError = errors.find(isUnauthorized);
    if (unauthorizedError) {
      if (renewAttempted.current) {
        onSignOut();
        return;
      }
      renewAttempted.current = true;
      renewalInFlight.current = true;
      setIsRenewingSession(true);
      void (async () => {
        const renewed = await renewSession();
        const previousErrors = latestErrors.current;
        if (renewed) await refresh();
        renewalInFlight.current = false;
        setIsRenewingSession(false);
        // More reads can fail while the IdP is renewing the old token.
        // Only errors observed during the subsequent refresh reject the new token.
        const nextErrors = latestErrors.current;
        if (!renewed || (nextErrors !== previousErrors && nextErrors.some(isUnauthorized))) {
          onSignOut();
        } else if (nextErrors.every((error) => error === null)) {
          renewAttempted.current = false;
        }
      })();
      return;
    }

    if (!errors.some((error) => error !== null)) {
      // Everything loaded: re-arm the renewal so a later expiry gets its own attempt.
      renewAttempted.current = false;
    }
  }, [errors, renewSession, refresh, onSignOut]);

  return { isRenewingSession, loadError };
}
