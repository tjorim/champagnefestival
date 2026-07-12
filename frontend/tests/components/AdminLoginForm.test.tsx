import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminLoginForm from "@/components/admin/AdminLoginForm";
import { useAuth } from "@/contexts/AuthContext";

vi.mock("@/paraglide/messages", () => ({
  m: {
    admin_title: () => "Admin",
    admin_login_button: () => "Login",
    auth_error_title: () => "Authentication problem",
  },
}));

describe("AdminLoginForm", () => {
  it("surfaces OIDC and redirect errors in the login UI", () => {
    const clearAuthError = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      roles: [],
      hasRole: vi.fn().mockReturnValue(false),
      getAccessToken: vi.fn().mockReturnValue(null),
      authError: "Keycloak is unreachable.",
      clearAuthError,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<AdminLoginForm />);

    expect(screen.getByRole("heading", { name: "Authentication problem" })).toBeInTheDocument();
    expect(screen.getByText("Keycloak is unreachable.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(clearAuthError).toHaveBeenCalledTimes(1);
  });
});
