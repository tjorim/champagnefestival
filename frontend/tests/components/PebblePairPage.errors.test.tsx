import { cleanup, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { m } from "@/paraglide/messages";
import { setLocale } from "@/paraglide/runtime";
import PebblePairPage from "@/components/PebblePairPage";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    getAccessToken: () => "access-token",
    authError: null,
    clearAuthError: vi.fn(),
  }),
}));

beforeEach(() => setLocale("nl", { reload: false }));

afterEach(() => {
  cleanup();
  setLocale("en", { reload: false });
});

describe("PebblePairPage errors", () => {
  it("shows the translation of a known error code, not the English detail", async () => {
    server.use(
      http.post("/api/me/pebble-token", () =>
        HttpResponse.json(
          { detail: "Invalid or revoked Pebble token", code: "pebble_token_invalid" },
          { status: 401 },
        ),
      ),
    );

    render(<PebblePairPage />);

    const alert = await screen.findByText(m.api_error_pebble_token_invalid());
    expect(alert).toBeInTheDocument();
    expect(screen.queryByText(/Invalid or revoked/)).not.toBeInTheDocument();
  });

  it("falls back to the translated pairing message for an unknown code", async () => {
    server.use(
      http.post("/api/me/pebble-token", () =>
        HttpResponse.json(
          { detail: "A brand new English rule.", code: "not_yet_translated" },
          { status: 400 },
        ),
      ),
    );

    render(<PebblePairPage />);

    expect(await screen.findByText(m.pebble_pair_error())).toBeInTheDocument();
    expect(screen.queryByText(/brand new English rule/)).not.toBeInTheDocument();
  });

  it("falls back to the translated pairing message when the response has no token", async () => {
    server.use(http.post("/api/me/pebble-token", () => HttpResponse.json({})));

    render(<PebblePairPage />);

    expect(await screen.findByText(m.pebble_pair_error())).toBeInTheDocument();
  });
});
