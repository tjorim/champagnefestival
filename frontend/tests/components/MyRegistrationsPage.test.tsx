import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import MyRegistrationsPage, { buildCheckInQrUrl } from "@/components/MyRegistrationsPage";
import { server } from "@/mocks/server";
import { validateMyRegistrationsSearch } from "@/router";
import { createTestQueryClientWrapper } from "../utils/queryClient";

const authState = vi.hoisted(() => ({
  accessToken: null as string | null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  listeners: new Set<() => void>(),
  set(next: Partial<{ accessToken: string | null; isAuthenticated: boolean; isLoading: boolean }>) {
    Object.assign(this, next);
    this.listeners.forEach((listener) => listener());
  },
}));

vi.mock("@/contexts/AuthContext", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useAuth: () => {
      useSyncExternalStore(
        (listener) => {
          authState.listeners.add(listener);
          return () => authState.listeners.delete(listener);
        },
        () => `${authState.accessToken}:${authState.isAuthenticated}:${authState.isLoading}`,
      );
      return {
        getAccessToken: () => authState.accessToken,
        isAuthenticated: authState.isAuthenticated,
        isLoading: authState.isLoading,
        login: authState.login,
      };
    },
  };
});

vi.mock("@/paraglide/messages", () => ({
  m: {
    my_registrations_title: () => "My Registrations",
    my_registrations_description: () => "Request a secure link by email.",
    my_registrations_email_label: () => "Email",
    my_registrations_email_placeholder: () => "email@example.com",
    my_registrations_request_link: () => "Email me a secure link",
    my_registrations_sign_in_instead: () => "Already a member or volunteer? Sign in instead.",
    my_registrations_requesting: () => "Preparing secure link...",
    my_registrations_request_success: () =>
      "If we found registrations for that email, we prepared a secure link.",
    my_registrations_invalid_email: () => "Please enter a valid email address.",
    my_registrations_request_pending_notice: () => "Check your inbox for the secure link.",
    my_registrations_loading: () => "Loading registrations...",
    my_registrations_invalid_token: () => "This secure link is invalid or expired.",
    my_registrations_no_results: () => "No registrations found.",
    my_registrations_error: () => "Unable to load your registrations.",
    my_registrations_guests_label: () => "guests",
    registration_preferred_language: () => "Preferred communication language",
    my_registrations_save_language: () => "Save language",
    my_registrations_language_saved: () => "Communication language saved.",
    my_registrations_claim_other_email: () => "Have a booking under a different email? Claim it",
    my_registrations_claim_description: () => "Enter the other email address.",
    my_registrations_cancel_claim: () => "Never mind, go back",
    my_account_preference_error: () => "Could not update language.",
    my_registrations_qr_label: () => "Booking check-in QR code",
    my_registrations_add_calendar: () => "Add to calendar",
    registration_reference: ({ reference }: { reference: string }) =>
      `Booking reference: ${reference}`,
    my_registrations_request_new_link: () => "Request another secure link",
    my_registrations_sign_out: () => "Sign out",
    my_registrations_session_expires: ({ date }: { date: string }) => `Signed in until ${date}`,
    my_registrations_changes_contact: () => "Changes require approval.",
    my_registrations_request_change: () => "Request a change or cancellation",
    my_registrations_request_change_warning: () => "The booking remains active.",
    my_registrations_request_type: () => "Request",
    my_registrations_request_type_change: () => "Change my booking",
    my_registrations_request_type_cancellation: () => "Cancel my booking",
    my_registrations_request_details: () => "Details",
    my_registrations_request_details_placeholder: () => "Placeholder",
    my_registrations_submit_request: () => "Submit request",
    my_registrations_request_change_success: () => "Request submitted.",
    my_registrations_request_change_error: () => "Request failed.",
    close: () => "Close",
    admin_status_confirmed: () => "Confirmed",
    admin_status_cancelled: () => "Cancelled",
    admin_status_pending: () => "Pending",
    admin_payment_paid: () => "Paid",
    admin_payment_partial: () => "Partial",
    admin_payment_unpaid: () => "Unpaid",
    admin_checked_in: () => "Checked in",
  },
}));

describe("MyRegistrationsPage", () => {
  beforeEach(() => {
    authState.accessToken = null;
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.login.mockClear();
  });

  it("keeps the check-in credential out of the QR query string", () => {
    const url = new URL(buildCheckInQrUrl("https://festival.example", "reg 1", "secret/token"));
    expect(url.searchParams.get("id")).toBe("reg 1");
    expect(url.searchParams.has("token")).toBe(false);
    expect(url.hash).toBe("#token=secret%2Ftoken");
  });

  async function renderPage(initialEntry = "/me") {
    const rootRoute = createRootRoute();
    const myAccountRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/me",
      validateSearch: validateMyRegistrationsSearch,
      component: MyRegistrationsPage,
    });
    const routeTree = rootRoute.addChildren([myAccountRoute]);
    const memoryHistory = createMemoryHistory({ initialEntries: [initialEntry] });
    const router = createRouter({ routeTree, history: memoryHistory });
    await router.load();
    const Wrapper = createTestQueryClientWrapper();

    return { ...render(<RouterProvider router={router} />, { wrapper: Wrapper }), router };
  }

  it("requests a secure link instead of looking registrations up by email", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if we found registrations for that email/i)).toBeInTheDocument();
      expect(screen.getByText("Check your inbox for the secure link.")).toBeInTheDocument();
    });
  });

  it("loads registrations when a secure token is present in the URL", async () => {
    // Any non-empty token is accepted by the MSW handler and returns the seed
    // registrations — reg-01 (Grand Opening), reg-02 (Tasting Day 1), reg-03
    // (Tasting Day 2).
    await renderPage("/me?token=any-valid-token");

    await waitFor(() => {
      expect(screen.getByText("Grand Opening")).toBeInTheDocument();
    });
    expect(screen.getAllByLabelText("Booking check-in QR code").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Add to calendar" })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("calendar.google.com"),
    );
  });

  it("claims email-proven registrations when the visitor is signed in", async () => {
    authState.accessToken = "visitor-access-token";
    authState.isAuthenticated = true;
    let authorization = "";
    server.use(
      http.post("/api/me/registrations/claim", ({ request }) => {
        authorization = request.headers.get("Authorization") ?? "";
        return HttpResponse.json([]);
      }),
      http.get("/api/me/registrations", () => HttpResponse.json([])),
    );

    await renderPage("/me?token=email-access-token");

    await waitFor(() => {
      expect(screen.getByText("No registrations found.")).toBeInTheDocument();
    });
    expect(authorization).toBe("Bearer visitor-access-token");
  });

  it("waits for authentication restoration before claiming the token", async () => {
    authState.isLoading = true;
    let anonymousCalls = 0;
    let claimCalls = 0;
    let ownedCalls = 0;
    server.use(
      http.post("/api/registrations/my/access", () => {
        anonymousCalls += 1;
        return HttpResponse.json([]);
      }),
      http.post("/api/me/registrations/claim", () => {
        claimCalls += 1;
        return HttpResponse.json([]);
      }),
      http.get("/api/me/registrations", () => {
        ownedCalls += 1;
        return HttpResponse.json([]);
      }),
    );

    const view = await renderPage("/me?token=email-access-token");
    expect(screen.getByText("Loading registrations...")).toBeInTheDocument();
    expect(anonymousCalls).toBe(0);

    authState.set({
      isLoading: false,
      isAuthenticated: true,
      accessToken: "restored-access-token",
    });

    await waitFor(() => {
      expect(screen.getByText("No registrations found.")).toBeInTheDocument();
    });
    expect(anonymousCalls).toBe(0);
    expect(claimCalls).toBe(1);
    expect(ownedCalls).toBe(1);
    await waitFor(() => expect(view.router.state.location.search).toEqual({}));
    const currentHref = view.router.state.location.href;
    view.unmount();
    await renderPage(currentHref);
    expect(claimCalls).toBe(1);
  });

  it("does not replay an anonymous token exchange after successful remount", async () => {
    let accessCalls = 0;
    server.use(
      http.post("/api/visitor-sessions/redeem", () => {
        accessCalls += 1;
        return HttpResponse.json([]);
      }),
    );

    const view = await renderPage("/me?token=email-access-token");
    await waitFor(() => {
      expect(screen.getByText("No registrations found.")).toBeInTheDocument();
    });
    expect(accessCalls).toBe(1);

    await waitFor(() => expect(view.router.state.location.search).toEqual({}));
    const currentHref = view.router.state.location.href;
    view.unmount();
    await renderPage(currentHref);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(accessCalls).toBe(1);
  });

  it("scrubs an anonymous token before an in-flight exchange can be remounted", async () => {
    let accessCalls = 0;
    let finishExchange: (() => void) | undefined;
    const exchangePending = new Promise<void>((resolve) => {
      finishExchange = resolve;
    });
    server.use(
      http.post("/api/visitor-sessions/redeem", async () => {
        accessCalls += 1;
        await exchangePending;
        return HttpResponse.json([]);
      }),
    );

    const view = await renderPage("/me?token=email-access-token");
    await waitFor(() => expect(accessCalls).toBe(1));
    await waitFor(() => expect(view.router.state.location.search).toEqual({}));
    const currentHref = view.router.state.location.href;
    view.unmount();
    await renderPage(currentHref);
    expect(accessCalls).toBe(1);
    finishExchange?.();
  });

  it("reconciles an ambiguous signed claim through the owned registrations GET", async () => {
    authState.accessToken = "visitor-access-token";
    authState.isAuthenticated = true;
    let claimCalls = 0;
    let ownedCalls = 0;
    server.use(
      http.post("/api/me/registrations/claim", () => {
        claimCalls += 1;
        return HttpResponse.error();
      }),
      http.get("/api/me/registrations", () => {
        ownedCalls += 1;
        return HttpResponse.json([]);
      }),
    );

    const view = await renderPage("/me?token=email-access-token");
    await waitFor(() => {
      expect(screen.getByText("No registrations found.")).toBeInTheDocument();
    });
    expect(claimCalls).toBe(1);
    expect(ownedCalls).toBe(1);
    expect(view.router.state.location.search).toEqual({});
  });

  it("shows an invalid-link message when the token is rejected", async () => {
    server.use(
      http.post("/api/visitor-sessions/redeem", () => HttpResponse.json(null, { status: 401 })),
    );

    await renderPage("/me?token=expired-token");

    await waitFor(() => {
      expect(screen.getByText("This secure link is invalid or expired.")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /request another secure link/i }),
      ).toBeInTheDocument();
    });
  });

  it("validates the email before sending the request", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    });
  });

  it("shows an invalid email error when the API rejects the address", async () => {
    server.use(
      http.post("/api/visitor-sessions/request", () => HttpResponse.json(null, { status: 422 })),
    );

    await renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    });
  });

  it("has no axe violations on the email request form", async () => {
    const { container } = await renderPage();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations when showing an email validation error", async () => {
    const { container } = await renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations when registrations are loaded", async () => {
    const { container } = await renderPage("/me?token=any-valid-token");

    await waitFor(() => {
      expect(screen.getByText("Grand Opening")).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations when showing a token error", async () => {
    server.use(
      http.post("/api/visitor-sessions/redeem", () => HttpResponse.json(null, { status: 401 })),
    );

    const { container } = await renderPage("/me?token=expired-token");

    await waitFor(() => {
      expect(screen.getByText("This secure link is invalid or expired.")).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
  it("lets an authenticated visitor update the language for their owned registrations", async () => {
    authState.accessToken = "visitor-access-token";
    authState.isAuthenticated = true;
    let savedBody: unknown;
    server.use(
      http.post("/api/me/registrations/claim", () => HttpResponse.json([])),
      http.get("/api/me/registrations", () =>
        HttpResponse.json([
          {
            id: "reg-owned",
            event_title: "Grand Opening",
            event_date: "2026-05-01",
            check_in_token: "token",
            guest_count: 1,
            status: "confirmed",
            payment_status: "paid",
            checked_in: false,
            strap_issued: false,
            created_at: "2026-01-01T00:00:00Z",
            order_items: [],
          },
        ]),
      ),
      http.get("/api/me/communication-preference", () =>
        HttpResponse.json({ preferred_language: "fr" }),
      ),
      http.put("/api/me/communication-preference", async ({ request }) => {
        savedBody = await request.json();
        return HttpResponse.json({ preferred_language: "en" });
      }),
    );
    await renderPage("/me?token=email-access-token");
    const language = await screen.findByLabelText("Preferred communication language");
    await waitFor(() => expect(language).toHaveValue("fr"));
    fireEvent.change(language, { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "Save language" }));
    await screen.findByText("Communication language saved.");
    expect(savedBody).toEqual({ preferred_language: "en" });
  });

  it("disables preference editing until the saved preference has loaded", async () => {
    authState.accessToken = "visitor-access-token";
    authState.isAuthenticated = true;
    let resolvePreference!: () => void;
    const preferenceGate = new Promise<void>((resolve) => {
      resolvePreference = resolve;
    });
    server.use(
      http.post("/api/me/registrations/claim", () => HttpResponse.json([])),
      http.get("/api/me/registrations", () =>
        HttpResponse.json([
          {
            id: "reg-owned",
            event_title: "Grand Opening",
            event_date: null,
            check_in_token: "token",
            guest_count: 1,
            status: "confirmed",
            payment_status: "paid",
            checked_in: false,
            strap_issued: false,
            created_at: "2026-01-01T00:00:00Z",
            order_items: [],
          },
        ]),
      ),
      http.get("/api/me/communication-preference", async () => {
        await preferenceGate;
        return HttpResponse.json({ preferred_language: "fr" });
      }),
    );
    await renderPage("/me?token=email-access-token");
    const language = await screen.findByLabelText("Preferred communication language");
    expect(language).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save language" })).toBeDisabled();
    resolvePreference();
    await waitFor(() => expect(language).toBeEnabled());
    expect(language).toHaveValue("fr");
  });

  it("shows a returning visitor's orders from an existing session, with no token and no email form", async () => {
    server.use(
      http.get("/api/visitor-sessions/status", () =>
        HttpResponse.json({ authenticated: true, expires_at: "2026-09-14T00:00:00Z" }),
      ),
      http.get("/api/me/registrations", () =>
        HttpResponse.json([
          {
            id: "reg-returning",
            event_title: "Grand Opening",
            event_date: "2026-05-01",
            check_in_token: "token",
            guest_count: 1,
            status: "confirmed",
            payment_status: "paid",
            checked_in: false,
            strap_issued: false,
            created_at: "2026-01-01T00:00:00Z",
            order_items: [],
          },
        ]),
      ),
    );

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Grand Opening")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    // toLocaleDateString's exact format is locale-dependent (varies between
    // dev machines and CI runners); only assert the locale-independent parts.
    expect(screen.getByText(/^Signed in until /)).toBeInTheDocument();
  });

  it("shows a signed-in member's own registrations directly, with no token needed", async () => {
    authState.accessToken = "member-access-token";
    authState.isAuthenticated = true;
    let authorization = "";
    server.use(
      http.get("/api/me/registrations", ({ request }) => {
        authorization = request.headers.get("Authorization") ?? "";
        return HttpResponse.json([
          {
            id: "reg-member",
            event_title: "Grand Opening",
            event_date: "2026-05-01",
            check_in_token: "token",
            guest_count: 1,
            status: "confirmed",
            payment_status: "paid",
            checked_in: false,
            strap_issued: false,
            created_at: "2026-01-01T00:00:00Z",
            order_items: [],
          },
        ]);
      }),
    );

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Grand Opening")).toBeInTheDocument();
    });
    expect(authorization).toBe("Bearer member-access-token");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    // Neither of the anonymous-only controls makes sense for a signed-in member.
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request another secure link" }),
    ).not.toBeInTheDocument();
  });

  it("lets a signed-in member claim a booking made under a different email", async () => {
    authState.accessToken = "member-access-token";
    authState.isAuthenticated = true;
    let requestedEmail = "";
    server.use(
      http.get("/api/me/registrations", () =>
        HttpResponse.json([
          {
            id: "reg-member",
            event_title: "Grand Opening",
            event_date: "2026-05-01",
            check_in_token: "token",
            guest_count: 1,
            status: "confirmed",
            payment_status: "paid",
            checked_in: false,
            strap_issued: false,
            created_at: "2026-01-01T00:00:00Z",
            order_items: [],
          },
        ]),
      ),
      http.post("/api/registrations/my/request", async ({ request }) => {
        const body = (await request.json()) as { email: string };
        requestedEmail = body.email;
        return HttpResponse.json({ ok: true, delivery_mode: "email", expires_in_minutes: 30 });
      }),
    );

    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Grand Opening")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Have a booking under a different email? Claim it" }),
    );

    // Claiming replaces the owned-registrations view with the email form —
    // the two aren't shown at once.
    expect(screen.queryByText("Grand Opening")).not.toBeInTheDocument();
    const emailInput = screen.getByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "other@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if we found registrations for that email/i)).toBeInTheDocument();
    });
    expect(requestedEmail).toBe("other@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Never mind, go back" }));

    await waitFor(() => {
      expect(screen.getByText("Grand Opening")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("offers a sign-in link alongside the email-lookup form", async () => {
    await renderPage();

    const signInLink = await screen.findByRole("button", {
      name: "Already a member or volunteer? Sign in instead.",
    });
    fireEvent.click(signInLink);

    expect(authState.login).toHaveBeenCalledWith("/me");
  });

  it("shows the email form directly when there is no existing session", async () => {
    await renderPage();

    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("returns to the email form after signing out of a returning-visitor session", async () => {
    let signedOut = false;
    server.use(
      http.get("/api/visitor-sessions/status", () =>
        signedOut
          ? HttpResponse.json({ authenticated: false, expires_at: null })
          : HttpResponse.json({ authenticated: true, expires_at: "2026-09-14T00:00:00Z" }),
      ),
      http.get("/api/me/registrations", () => HttpResponse.json([])),
      http.post("/api/visitor-sessions/sign-out", () => {
        signedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await renderPage();

    const signOutButton = await screen.findByRole("button", { name: "Sign out" });
    fireEvent.click(signOutButton);

    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toBeInTheDocument();
    });
  });

  it("keeps the session and shows an error when sign-out fails", async () => {
    server.use(
      http.get("/api/visitor-sessions/status", () =>
        HttpResponse.json({ authenticated: true, expires_at: "2026-09-14T00:00:00Z" }),
      ),
      http.get("/api/me/registrations", () => HttpResponse.json([])),
      http.post("/api/visitor-sessions/sign-out", () => HttpResponse.json(null, { status: 500 })),
    );

    await renderPage();

    const signOutButton = await screen.findByRole("button", { name: "Sign out" });
    fireEvent.click(signOutButton);

    await waitFor(() => {
      expect(screen.getByText("Unable to load your registrations.")).toBeInTheDocument();
    });
    // Must still show the signed-in view, not fall back to the email form —
    // the server session and cookie are still valid after a failed sign-out.
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
