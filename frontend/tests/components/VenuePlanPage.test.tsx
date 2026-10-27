import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VenuePlanPage from "@/components/VenuePlanPage";
import { useAuth } from "@/contexts/AuthContext";
import { server } from "@/mocks/server";
import { m } from "@/paraglide/messages";
import { createTestQueryClientWrapper } from "../utils/queryClient";

let search: { edition?: string; table?: string } = {};

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => search,
  useLocation: () => ({ pathname: "/venue-plan", searchStr: "?edition=ed-1" }),
  Link: ({
    to,
    search: linkSearch,
    ...props
  }: { to: string; search?: { edition?: string } } & ComponentProps<"a">) => (
    <a href={`${to}?edition=${linkSearch?.edition}`} {...props} />
  ),
}));

const login = vi.fn();

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    isSigningIn: false,
    isSigningOut: false,
    accountLabel: "mock-user",
    roles: ["volunteer"],
    hasRole: vi.fn((role: string) => role === "volunteer"),
    getAccessToken: vi.fn().mockReturnValue("token"),
    authError: null,
    clearAuthError: vi.fn(),
    login,
    logout: vi.fn(),
    renewSession: vi.fn().mockResolvedValue(false),
    ...overrides,
  });
}

const plan = (layouts: unknown[]) => ({ edition_id: "ed-1", layouts });

function renderPage() {
  return render(<VenuePlanPage />, { wrapper: createTestQueryClientWrapper() });
}

describe("VenuePlanPage recovery states", () => {
  beforeEach(() => {
    search = { edition: "ed-1" };
    login.mockReset();
    mockAuth();
  });

  it("asks a signed-out visitor to sign in and returns to the same plan", async () => {
    mockAuth({ isAuthenticated: false, roles: [], hasRole: vi.fn().mockReturnValue(false) });
    renderPage();

    expect(screen.getByText(m.venue_plan_sign_in_required())).toBeInTheDocument();
    expect(screen.queryByText(m.venue_plan_empty())).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: m.admin_login_button() }));
    expect(login).toHaveBeenCalledWith("/venue-plan?edition=ed-1");
  });

  it("explains missing access to a signed-in account and offers a way out", () => {
    mockAuth({ roles: [], hasRole: vi.fn().mockReturnValue(false) });
    renderPage();

    expect(screen.getByText(m.venue_plan_forbidden())).toBeInTheDocument();
    expect(screen.getByRole("link", { name: m.back_to_site() })).toHaveAttribute("href", "/");
  });

  it("offers an edition picker instead of a dead end when no edition is open", async () => {
    search = {};
    server.use(
      http.get("/api/editions/upcoming", () =>
        HttpResponse.json([{ id: "ed-1", year: 2026, month: "October", venue: { name: "Hall" } }]),
      ),
    );
    renderPage();

    expect(screen.getByText(m.venue_plan_missing_edition())).toBeInTheDocument();
    const choice = await screen.findByRole("link", { name: "October 2026 · Hall" });
    expect(choice).toHaveAttribute("href", "/venue-plan?edition=ed-1");
  });

  it("recovers from a failed edition list through Retry", async () => {
    search = {};
    let attempts = 0;
    server.use(
      http.get("/api/editions/upcoming", () => {
        attempts += 1;
        return attempts === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json([
              { id: "ed-1", year: 2026, month: "October", venue: { name: "Hall" } },
            ]);
      }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: m.admin_retry() }));
    expect(await screen.findByRole("link", { name: "October 2026 · Hall" })).toBeInTheDocument();
  });

  it("recovers from a failed plan load through Retry without reloading", async () => {
    let attempts = 0;
    server.use(
      http.get("/api/venue-plan/:editionId", () => {
        attempts += 1;
        return attempts === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json(
              plan([
                {
                  event_id: "e",
                  event_title: "Festival",
                  id: "l1",
                  date: null,
                  label: "Main",
                  room: null,
                  tables: [],
                  areas: [],
                },
              ]),
            );
      }),
    );
    renderPage();

    expect(await screen.findByText(m.venue_plan_error())).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: m.admin_retry() }));
    expect(await screen.findByText(/Festival/)).toBeInTheDocument();
    expect(screen.queryByText(m.venue_plan_error())).not.toBeInTheDocument();
  });

  it("asks for a new sign-in when the session has expired", async () => {
    server.use(
      http.get("/api/venue-plan/:editionId", () => new HttpResponse(null, { status: 401 })),
    );
    renderPage();

    expect(await screen.findByText(m.venue_plan_session_expired())).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: m.admin_login_button() }));
    expect(login).toHaveBeenCalledWith("/venue-plan?edition=ed-1");
  });

  it("explains a refused read as missing access", async () => {
    server.use(
      http.get("/api/venue-plan/:editionId", () => new HttpResponse(null, { status: 403 })),
    );
    renderPage();

    expect(await screen.findByText(m.venue_plan_forbidden())).toBeInTheDocument();
  });

  it("sends an unknown edition back to the picker", async () => {
    server.use(
      http.get("/api/venue-plan/:editionId", () =>
        HttpResponse.json({ detail: "Edition not found." }, { status: 404 }),
      ),
      http.get("/api/editions/upcoming", () => HttpResponse.json([])),
    );
    renderPage();

    expect(await screen.findByText(m.venue_plan_edition_not_found())).toBeInTheDocument();
    expect(await screen.findByText(m.venue_plan_no_editions())).toBeInTheDocument();
  });

  it("keeps a genuinely empty plan distinct from a failure", async () => {
    server.use(http.get("/api/venue-plan/:editionId", () => HttpResponse.json(plan([]))));
    renderPage();

    expect(await screen.findByText(m.venue_plan_empty())).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.admin_retry() })).not.toBeInTheDocument();
  });

  it("shows a loading state while the plan is slow", async () => {
    server.use(
      http.get("/api/venue-plan/:editionId", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(plan([]));
      }),
    );
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(m.loading());
    expect(await screen.findByText(m.venue_plan_empty())).toBeInTheDocument();
  });
});
