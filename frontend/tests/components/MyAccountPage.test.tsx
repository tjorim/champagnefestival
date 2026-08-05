import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyAccountPage from "@/components/MyAccountPage";
import { useAuth } from "@/contexts/AuthContext";
import { server } from "@/mocks/server";

// happy-dom does not implement window.confirm, so it must be stubbed rather
// than wrapped (vi.spyOn requires an existing function).
function mockConfirm(returnValue: boolean) {
  const fn = vi.fn().mockReturnValue(returnValue);
  vi.stubGlobal("confirm", fn);
  return fn;
}

vi.mock("@/paraglide/messages", () => ({
  m: {
    my_account_title: () => "My Account",
    my_account_signed_in_as: ({ account }: { account: string }) => `Signed in as ${account}`,
    my_account_delete_heading: () => "Delete my account",
    my_account_delete_description: () => "Your festival records are kept.",
    my_account_delete_button: () => "Delete my account",
    my_account_deleting: () => "Deleting…",
    my_account_delete_confirm: () => "Delete your account?",
    my_account_delete_error: () => "Could not delete your account. Please try again.",
    pebble_pair_retry_sign_in: () => "Try signing in again",
    auth_signing_in: () => "Signing in…",
    auth_signing_out: () => "Signing out…",
  },
}));

describe("MyAccountPage", () => {
  beforeEach(() => {
    mockConfirm(true);
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: "mock-user",
      roles: [],
      hasRole: vi.fn().mockReturnValue(false),
      getAccessToken: vi.fn().mockReturnValue("oidc-access-token"),
      authError: null,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      renewSession: vi.fn().mockResolvedValue(false),
    });
  });

  it("deletes the account and signs out after confirmation", async () => {
    const logout = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: "mock-user",
      roles: [],
      hasRole: vi.fn().mockReturnValue(false),
      getAccessToken: vi.fn().mockReturnValue("oidc-access-token"),
      authError: null,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      logout,
      renewSession: vi.fn().mockResolvedValue(false),
    });

    let capturedAuth: string | null = null;
    server.use(
      http.delete("/api/me", ({ request }) => {
        capturedAuth = request.headers.get("Authorization");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    render(<MyAccountPage />);

    expect(screen.getByText("Signed in as mock-user")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(capturedAuth).toBe("Bearer oidc-access-token");
  });

  it("does not delete when the confirmation is declined", async () => {
    mockConfirm(false);
    let deleteCalled = false;
    server.use(
      http.delete("/api/me", () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    render(<MyAccountPage />);
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(deleteCalled).toBe(false);
  });

  it("shows an error and re-enables the button when deletion fails", async () => {
    server.use(
      http.delete("/api/me", () => HttpResponse.json({ detail: "Something went wrong" }, { status: 500 })),
    );

    const user = userEvent.setup();
    render(<MyAccountPage />);
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete my account" })).not.toBeDisabled();
  });

  it("offers a way out when sign-in itself fails", async () => {
    const login = vi.fn();
    const clearAuthError = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: null,
      roles: [],
      hasRole: vi.fn().mockReturnValue(false),
      getAccessToken: vi.fn().mockReturnValue(null),
      authError: "Keycloak is unreachable.",
      clearAuthError,
      login,
      logout: vi.fn(),
      renewSession: vi.fn().mockResolvedValue(false),
    });

    const user = userEvent.setup();
    render(<MyAccountPage />);

    expect(screen.getByText("Keycloak is unreachable.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try signing in again" }));

    expect(clearAuthError).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith("/me");
  });
});
