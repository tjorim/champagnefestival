/**
 * Carries the *reason* for a sign-out across the IdP redirect.
 *
 * Signing out navigates away to Keycloak and back, so React state cannot survive
 * the trip. Without this, a session that expires mid-task dumps the user on the
 * login screen with no explanation of what happened. `sessionStorage` is the
 * right scope: per-tab, and gone when the tab closes.
 */

const STORAGE_KEY = "cf.auth.signOutReason";

export type SignOutReason = "session-expired";

export function recordSignOutReason(reason: SignOutReason): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, reason);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The reason is
    // a nicety, never a requirement — sign-out must proceed regardless.
  }
}

/**
 * Reads the pending reason without clearing it.
 *
 * Reading and clearing are deliberately separate: a React state initializer must
 * be pure, and StrictMode double-invokes it. A combined read-and-clear would
 * consume the reason on the first invocation and hand back `null` on the second.
 * Callers read here and clear from an effect (see `clearSignOutReason`).
 */
export function peekSignOutReason(): SignOutReason | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored === "session-expired" ? stored : null;
  } catch {
    return null;
  }
}

/** Clears the pending reason so it is shown once. Safe to call repeatedly. */
export function clearSignOutReason(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // See recordSignOutReason: storage is best-effort.
  }
}
