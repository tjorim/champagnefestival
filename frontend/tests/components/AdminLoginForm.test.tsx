import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminLoginForm from "@/components/admin/AdminLoginForm";
import { useAuth } from "@/contexts/AuthContext";
import { recordSignOutReason } from "@/utils/signOutReason";

const baseAuth = {
  isAuthenticated: false,
  isLoading: false,
  isSigningIn: false,
  isSigningOut: false,
  accountLabel: null,
  roles: [],
  hasRole: vi.fn().mockReturnValue(false),
  getAccessToken: vi.fn().mockReturnValue(null),
  authError: null,
  clearAuthError: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  renewSession: vi.fn().mockResolvedValue(false),
};

vi.mock("@/paraglide/messages", () => ({
  m: {
    admin_title: () => "Admin",
    admin_login_button: () => "Login",
    auth_error_title: () => "Authentication problem",
    auth_signing_in: () => "Signing in…",
    auth_session_expired_notice: () => "Your session expired, so you were signed out.",
  },
}));

describe("AdminLoginForm", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("explains an expired session instead of silently showing the login screen", () => {
    vi.mocked(useAuth).mockReturnValue({ ...baseAuth });
    recordSignOutReason("session-expired");

    const { unmount } = render(<AdminLoginForm />);

    expect(screen.getByText("Your session expired, so you were signed out.")).toBeInTheDocument();

    // The reason is cleared after being shown, so a later deliberate sign-out
    // lands on a clean screen.
    unmount();
    render(<AdminLoginForm />);
    expect(
      screen.queryByText("Your session expired, so you were signed out."),
    ).not.toBeInTheDocument();
  });

  it("shows a pending state while the sign-in redirect is being prepared", () => {
    vi.mocked(useAuth).mockReturnValue({ ...baseAuth, isSigningIn: true });

    render(<AdminLoginForm />);

    // Disabled so an unresponsive-looking button cannot be clicked repeatedly.
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });

  it("surfaces OIDC and redirect errors in the login UI", () => {
    const clearAuthError = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      isSigningIn: false,
      isSigningOut: false,
      accountLabel: "mock-user",
      roles: [],
      hasRole: vi.fn().mockReturnValue(false),
      getAccessToken: vi.fn().mockReturnValue(null),
      authError: "Keycloak is unreachable.",
      clearAuthError,
      login: vi.fn(),
      logout: vi.fn(),
      renewSession: vi.fn().mockResolvedValue(false),
    });

    render(<AdminLoginForm />);

    expect(screen.getByRole("heading", { name: "Authentication problem" })).toBeInTheDocument();
    expect(screen.getByText("Keycloak is unreachable.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(clearAuthError).toHaveBeenCalledTimes(1);
  });
});
