import { fireEvent, render, screen } from "@testing-library/react";
import { useAuth as useOidcAuth } from "react-oidc-context";
import type { User } from "oidc-client-ts";
import { describe, expect, it, vi } from "vitest";

const { AuthProvider, useAuth } =
  await vi.importActual<typeof import("@/contexts/AuthContext")>("@/contexts/AuthContext");

function mockOidcError(error: Error | null) {
  vi.mocked(useOidcAuth).mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    user: null as User | null,
    error,
    signinRedirect: vi.fn().mockResolvedValue(undefined),
    signoutRedirect: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useOidcAuth>);
}

function AuthErrorConsumer() {
  const auth = useAuth();

  return (
    <div>
      <span>{auth.authError ?? "No auth error"}</span>
      <button type="button" onClick={auth.clearAuthError}>
        Clear auth error
      </button>
    </div>
  );
}

describe("AuthProvider", () => {
  it("shows the same provider error again after the provider clears and re-emits it", () => {
    mockOidcError(new Error("Keycloak is unavailable."));
    const { rerender } = render(
      <AuthProvider>
        <AuthErrorConsumer />
      </AuthProvider>,
    );

    expect(screen.getByText("Keycloak is unavailable.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear auth error" }));

    expect(screen.getByText("No auth error")).toBeInTheDocument();

    mockOidcError(null);
    rerender(
      <AuthProvider>
        <AuthErrorConsumer />
      </AuthProvider>,
    );

    expect(screen.getByText("No auth error")).toBeInTheDocument();

    mockOidcError(new Error("Keycloak is unavailable."));
    rerender(
      <AuthProvider>
        <AuthErrorConsumer />
      </AuthProvider>,
    );

    expect(screen.getByText("Keycloak is unavailable.")).toBeInTheDocument();
  });

  describe("renewSession", () => {
    function renderWithSilentSignin(signinSilent: ReturnType<typeof vi.fn>) {
      vi.mocked(useOidcAuth).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { access_token: "token" } as unknown as User,
        error: null,
        signinRedirect: vi.fn().mockResolvedValue(undefined),
        signoutRedirect: vi.fn().mockResolvedValue(undefined),
        signinSilent,
      } as unknown as ReturnType<typeof useOidcAuth>);

      const results: (boolean | null)[] = [];
      function RenewConsumer() {
        const auth = useAuth();
        return (
          <button
            type="button"
            onClick={() => {
              void auth.renewSession().then((ok) => results.push(ok));
            }}
          >
            Renew
          </button>
        );
      }

      render(
        <AuthProvider>
          <RenewConsumer />
        </AuthProvider>,
      );
      return results;
    }

    it("reports success when the IdP issues a fresh token", async () => {
      const results = renderWithSilentSignin(
        vi.fn().mockResolvedValue({ access_token: "fresh" } as unknown as User),
      );

      fireEvent.click(screen.getByRole("button", { name: "Renew" }));

      await vi.waitFor(() => expect(results).toEqual([true]));
    });

    it("reports failure when the IdP session is gone", async () => {
      // oidc-client-ts resolves null rather than throwing when the session ended.
      const results = renderWithSilentSignin(vi.fn().mockResolvedValue(null));

      fireEvent.click(screen.getByRole("button", { name: "Renew" }));

      await vi.waitFor(() => expect(results).toEqual([false]));
    });

    it("reports failure instead of propagating a renewal error", async () => {
      const results = renderWithSilentSignin(
        vi.fn().mockRejectedValue(new Error("iframe blocked")),
      );

      fireEvent.click(screen.getByRole("button", { name: "Renew" }));

      await vi.waitFor(() => expect(results).toEqual([false]));
    });
  });
});
