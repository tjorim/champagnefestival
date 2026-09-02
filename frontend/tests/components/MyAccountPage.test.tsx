import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyAccountPage from "@/components/MyAccountPage";
import { useAuth } from "@/contexts/AuthContext";
import { server } from "@/mocks/server";

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
    admin_action_cancel: () => "Cancel",
    admin_action_confirm: () => "Confirm",
  },
}));

async function openDeleteConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Delete my account" }));
  return screen.getByRole("dialog");
}

describe("MyAccountPage", () => {
  beforeEach(() => {
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
    await openDeleteConfirm(user);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(capturedAuth).toBe("Bearer oidc-access-token");
  });

  it("does not delete when the confirmation is declined", async () => {
    let deleteCalled = false;
    server.use(
      http.delete("/api/me", () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    render(<MyAccountPage />);
    await openDeleteConfirm(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteCalled).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error and re-enables the button when deletion fails", async () => {
    server.use(
      http.delete("/api/me", () =>
        HttpResponse.json({ detail: "Something went wrong" }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    render(<MyAccountPage />);
    await openDeleteConfirm(user);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).not.toBeDisabled();
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
