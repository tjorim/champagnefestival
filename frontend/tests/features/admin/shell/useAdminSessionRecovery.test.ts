import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAdminSessionRecovery } from "@/features/admin/shell/useAdminSessionRecovery";

const unauthorized = new Error("session_expired");
const otherError = new Error("boom");

function setup() {
  const renewSession = vi.fn();
  const refresh = vi.fn().mockResolvedValue(undefined);
  const onSignOut = vi.fn();

  const { result, rerender } = renderHook(
    ({ errors }: { errors: (Error | null)[] }) =>
      useAdminSessionRecovery({ errors, renewSession, refresh, onSignOut }),
    { initialProps: { errors: [null] as (Error | null)[] } },
  );

  return { result, rerender, renewSession, refresh, onSignOut };
}

describe("useAdminSessionRecovery", () => {
  it("does nothing while every watched query is clean", () => {
    const { result, renewSession, refresh, onSignOut } = setup();

    expect(result.current).toEqual({ isRenewingSession: false, loadError: null });
    expect(renewSession).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("renews once on a 401 and refetches instead of signing out immediately", async () => {
    const { result, rerender, renewSession, refresh, onSignOut } = setup();
    renewSession.mockResolvedValue(true);

    rerender({ errors: [unauthorized] });

    expect(result.current.isRenewingSession).toBe(true);
    await waitFor(() => expect(result.current.isRenewingSession).toBe(false));

    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("coalesces auth failures from reads that finish during renewal", async () => {
    const { rerender, renewSession, refresh, onSignOut } = setup();
    let finishRenewal: (value: boolean) => void = () => {};
    renewSession.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishRenewal = resolve;
      }),
    );

    rerender({ errors: [unauthorized, null] });
    rerender({ errors: [unauthorized, new Error("session_expired")] });
    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(onSignOut).not.toHaveBeenCalled();

    finishRenewal(true);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender({ errors: [null, null] });
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("signs out when the renewed token is rejected too, without retrying", async () => {
    const { rerender, renewSession, refresh, onSignOut } = setup();
    renewSession.mockResolvedValue(true);

    // First 401: renews and refetches.
    rerender({ errors: [unauthorized] });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // The refetch comes back 401 again — the refreshed token didn't help.
    rerender({ errors: [unauthorized] });

    // Guarded: no second renewal attempt, straight to sign-out.
    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("signs out directly when the IdP session is already gone", async () => {
    const { result, rerender, renewSession, onSignOut } = setup();
    renewSession.mockResolvedValue(false);

    rerender({ errors: [unauthorized] });

    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
    expect(result.current.isRenewingSession).toBe(false);
  });

  it("re-arms the renewal guard once queries succeed again", async () => {
    const { rerender, renewSession, refresh, onSignOut } = setup();
    renewSession.mockResolvedValue(true);

    rerender({ errors: [unauthorized] });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // A later, unrelated success clears the guard...
    rerender({ errors: [null] });
    // ...so a fresh expiry gets its own renewal attempt rather than an
    // immediate sign-out.
    rerender({ errors: [unauthorized] });

    await waitFor(() => expect(renewSession).toHaveBeenCalledTimes(2));
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("surfaces a non-auth error without touching renewal or sign-out", () => {
    const { result, rerender, renewSession, onSignOut } = setup();

    rerender({ errors: [otherError] });

    expect(result.current.loadError).toBe(otherError);
    expect(renewSession).not.toHaveBeenCalled();
    expect(onSignOut).not.toHaveBeenCalled();
  });
});
