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
});
