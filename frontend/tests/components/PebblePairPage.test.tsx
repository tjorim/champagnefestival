import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PebblePairPage from "@/components/PebblePairPage";
import { useAuth } from "@/contexts/AuthContext";
import { server } from "@/mocks/server";

vi.mock("@/paraglide/messages", () => ({
  m: {
    pebble_pair_title: () => "Pair Pebble Watch",
    pebble_pair_description: () => "Sign in to link your Pebble companion app to your account.",
    pebble_pair_connecting: () => "Connecting your watch...",
    pebble_pair_error: () => "Could not complete pairing.",
    pebble_pair_retry: () => "Retry pairing",
    pebble_pair_retry_sign_in: () => "Try signing in again",
    pebble_pair_close_instruction: () => "You can close this window and return to your watch.",
  },
}));

describe("PebblePairPage", () => {
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

  it("offers a way out when sign-in itself fails", async () => {
    // The config webview has no address bar, back button, or reload, so an auth
    // error with no control here would strand the user.
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
    render(<PebblePairPage />);

    // The real reason, not a generic pairing message that hides it.
    expect(screen.getByText("Keycloak is unreachable.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try signing in again" }));

    expect(clearAuthError).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith("/pebble-pair");
  });

  it("allows retrying a transient token-creation failure", async () => {
    let attempts = 0;
    server.use(
      http.post("/api/me/pebble-token", ({ request }) => {
        attempts += 1;
        expect(request.headers.get("Authorization")).toBe("Bearer oidc-access-token");
        if (attempts === 1) {
          return HttpResponse.json({ detail: "Unavailable" }, { status: 503 });
        }
        return HttpResponse.json({ token: "cfpat_retry-token" });
      }),
    );

    const user = userEvent.setup();
    render(<PebblePairPage />);

    expect(await screen.findByText("Pairing failed (503)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry pairing" }));

    await waitFor(() => expect(attempts).toBe(2));
    expect(
      await screen.findByText("You can close this window and return to your watch."),
    ).toBeInTheDocument();
  });
});
