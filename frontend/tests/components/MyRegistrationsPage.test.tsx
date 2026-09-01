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
    my_registrations_qr_label: () => "Booking check-in QR code",
    my_registrations_add_calendar: () => "Add to calendar",
    registration_reference: ({ reference }: { reference: string }) =>
      `Booking reference: ${reference}`,
    my_registrations_request_new_link: () => "Request another secure link",
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
  });

  it("keeps the check-in credential out of the QR query string", () => {
    const url = new URL(buildCheckInQrUrl("https://festival.example", "reg 1", "secret/token"));
    expect(url.searchParams.get("id")).toBe("reg 1");
    expect(url.searchParams.has("token")).toBe(false);
    expect(url.hash).toBe("#token=secret%2Ftoken");
  });

  async function renderPage(initialEntry = "/my-registrations") {
    const rootRoute = createRootRoute();
    const myRegistrationsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/my-registrations",
      validateSearch: validateMyRegistrationsSearch,
      component: MyRegistrationsPage,
    });
    const routeTree = rootRoute.addChildren([myRegistrationsRoute]);
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
    await renderPage("/my-registrations?token=any-valid-token");

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

    await renderPage("/my-registrations?token=email-access-token");

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

    const view = await renderPage("/my-registrations?token=email-access-token");
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
      http.post("/api/registrations/my/access", () => {
        accessCalls += 1;
        return HttpResponse.json([]);
      }),
    );

    const view = await renderPage("/my-registrations?token=email-access-token");
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
      http.post("/api/registrations/my/access", async () => {
        accessCalls += 1;
        await exchangePending;
        return HttpResponse.json([]);
      }),
    );

    const view = await renderPage("/my-registrations?token=email-access-token");
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

    const view = await renderPage("/my-registrations?token=email-access-token");
    await waitFor(() => {
      expect(screen.getByText("No registrations found.")).toBeInTheDocument();
    });
    expect(claimCalls).toBe(1);
    expect(ownedCalls).toBe(1);
    expect(view.router.state.location.search).toEqual({});
  });

  it("shows an invalid-link message when the token is rejected", async () => {
    server.use(
      http.post("/api/registrations/my/access", () => HttpResponse.json(null, { status: 401 })),
    );

    await renderPage("/my-registrations?token=expired-token");

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
      http.post("/api/registrations/my/request", () => HttpResponse.json(null, { status: 422 })),
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
    const { container } = await renderPage("/my-registrations?token=any-valid-token");

    await waitFor(() => {
      expect(screen.getByText("Grand Opening")).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations when showing a token error", async () => {
    server.use(
      http.post("/api/registrations/my/access", () => HttpResponse.json(null, { status: 401 })),
    );

    const { container } = await renderPage("/my-registrations?token=expired-token");

    await waitFor(() => {
      expect(screen.getByText("This secure link is invalid or expired.")).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
