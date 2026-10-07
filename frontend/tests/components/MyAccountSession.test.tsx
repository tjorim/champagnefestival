import { render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyAccountPage from "@/components/MyAccountPage";
import { useAuth } from "@/contexts/AuthContext";
import { m } from "@/paraglide/messages";
import { server } from "@/mocks/server";
import { validateMyRegistrationsSearch } from "@/router";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const exhibitors = [
  { id: 1, name: "Managed business", type: "producer", active: true, website: "" },
];
const bookings = [
  {
    id: "reg-1",
    event_title: "Festival booking",
    check_in_token: "check-in",
    guest_count: 2,
    status: "confirmed",
    payment_status: "paid",
    checked_in: false,
    strap_issued: false,
    created_at: "2026-10-01T00:00:00Z",
    order_items: [],
  },
];

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    isSigningIn: false,
    isSigningOut: false,
    accountLabel: null,
    roles: [],
    hasRole: () => false,
    getAccessToken: () => null,
    authError: null,
    clearAuthError: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    renewSession: vi.fn().mockResolvedValue(false),
  });
  server.use(
    http.get("/api/visitor-sessions/status", () => HttpResponse.json({ authenticated: false })),
    http.get("/api/me/exhibitors", () => HttpResponse.json([])),
  );
});

async function renderPage(initialEntry = "/me") {
  const root = createRootRoute();
  const account = createRoute({
    getParentRoute: () => root,
    path: "/me",
    validateSearch: validateMyRegistrationsSearch,
    component: MyAccountPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([account]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  await router.load();
  render(
    <main>
      <RouterProvider router={router} />
    </main>,
    { wrapper: createTestQueryClientWrapper() },
  );
  return router;
}

function signedIn(registrations = bookings, managed = exhibitors) {
  server.use(
    http.get("/api/visitor-sessions/status", () => HttpResponse.json({ authenticated: true })),
    http.get("/api/me/registrations", () => HttpResponse.json(registrations)),
    http.get("/api/me/exhibitors", () => HttpResponse.json(managed)),
    http.get("/api/me/exhibitors/1/changes", () => HttpResponse.json([])),
  );
}

describe("one emailed account login", () => {
  it("shows one login form and requests the existing shared magic link", async () => {
    let requests = 0;
    server.use(
      http.post("/api/visitor-sessions/request", () => {
        requests += 1;
        return HttpResponse.json(
          { ok: true, delivery_mode: "email", expires_in_minutes: 30 },
          { status: 202 },
        );
      }),
    );
    await renderPage();
    const email = await screen.findByLabelText(m.my_registrations_email_label());
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("tab", { name: m.manager_title() })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(email, "contact@example.com");
    await user.click(screen.getByRole("button", { name: m.my_registrations_request_link() }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      m.my_registrations_request_success(),
    );
    expect(requests).toBe(1);
  });

  it("one token shows both owned bookings and managed exhibitors and one sign-out clears both", async () => {
    let redemptions = 0;
    let authenticated = true;
    server.use(
      http.post("/api/visitor-sessions/redeem", () => {
        redemptions += 1;
        return HttpResponse.json(bookings);
      }),
      http.get("/api/me/exhibitors", () => HttpResponse.json(exhibitors)),
      http.get("/api/me/exhibitors/1/changes", () => HttpResponse.json([])),
      http.get("/api/visitor-sessions/status", () => HttpResponse.json({ authenticated })),
      http.get("/api/me/registrations", () => HttpResponse.json(bookings)),
      http.post("/api/visitor-sessions/sign-out", () => {
        authenticated = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const router = await renderPage("/me?token=shared-secret");
    expect(await screen.findByText("Festival booking")).toBeVisible();
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    const exhibitorTab = await screen.findByRole("tab", { name: m.manager_title() });
    expect(redemptions).toBe(1);
    const user = userEvent.setup();
    await user.click(exhibitorTab);
    expect(screen.getByText("Managed business")).toBeVisible();
    expect(screen.getAllByRole("button", { name: m.my_registrations_sign_out() })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: m.my_registrations_sign_out() }));
    expect(await screen.findByLabelText(m.my_registrations_email_label())).toBeVisible();
    expect(screen.queryByText("Managed business")).not.toBeInTheDocument();
    expect(screen.queryByText("Festival booking")).not.toBeInTheDocument();
  });

  it("shows the exhibitor view directly for a contact with no bookings", async () => {
    signedIn([]);
    await renderPage();
    expect(await screen.findByText("Managed business")).toBeVisible();
    expect(await axe(document.body)).toHaveNoViolations();
    expect(screen.queryByRole("tab", { name: m.my_registrations_title() })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.my_registrations_sign_out() })).toBeVisible();
  });

  it("does not show an exhibitor tab for a booking-only visitor", async () => {
    signedIn(bookings, []);
    await renderPage();
    expect(await screen.findByText("Festival booking")).toBeVisible();
    expect(screen.queryByRole("tab", { name: m.manager_title() })).not.toBeInTheDocument();
  });

  it("keeps both views on a failed sign-out and does not retry it", async () => {
    let requests = 0;
    signedIn();
    server.use(
      http.post("/api/visitor-sessions/sign-out", () => {
        requests += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );
    await renderPage();
    const tab = await screen.findByRole("tab", { name: m.manager_title() });
    const user = userEvent.setup();
    await user.click(tab);
    await user.click(screen.getByRole("button", { name: m.my_registrations_sign_out() }));
    expect(await screen.findByRole("alert")).toHaveTextContent(m.my_registrations_error());
    expect(screen.getByText("Managed business")).toBeVisible();
    expect(requests).toBe(1);
  });
  it("discards an exhibitor response that arrives after shared sign-out", async () => {
    signedIn();
    let authenticated = true;
    let delivered = false;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/visitor-sessions/status", () => HttpResponse.json({ authenticated })),
      http.get("/api/me/exhibitors", async () => {
        await pending;
        delivered = true;
        return HttpResponse.json(exhibitors);
      }),
      http.post("/api/visitor-sessions/sign-out", () => {
        authenticated = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderPage();
    await screen.findByText("Festival booking");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: m.my_registrations_sign_out() }));
    expect(await screen.findByLabelText(m.my_registrations_email_label())).toBeVisible();
    release();
    await waitFor(() => expect(delivered).toBe(true));
    expect(screen.queryByText("Managed business")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: m.manager_title() })).not.toBeInTheDocument();
  });
});
