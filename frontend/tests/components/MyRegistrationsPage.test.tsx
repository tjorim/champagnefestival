import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import MyRegistrationsPage from "@/components/MyRegistrationsPage";
import { createTestQueryClientWrapper } from "../utils/queryClient";

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
    my_registrations_request_pending_notice: () => "Automatic email sending is not enabled yet.",
    my_registrations_loading: () => "Loading registrations...",
    my_registrations_invalid_token: () => "This secure link is invalid or expired.",
    my_registrations_no_results: () => "No registrations found.",
    my_registrations_error: () => "Unable to load your registrations.",
    my_registrations_guests_label: () => "guests",
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
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function renderPage(initialEntry = "/my-registrations") {
    const rootRoute = createRootRoute();
    const myRegistrationsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/my-registrations",
      validateSearch: (search: Record<string, unknown>) => ({
        token: typeof search.token === "string" ? search.token : undefined,
      }),
      component: MyRegistrationsPage,
    });
    const routeTree = rootRoute.addChildren([myRegistrationsRoute]);
    const memoryHistory = createMemoryHistory({ initialEntries: [initialEntry] });
    const router = createRouter({ routeTree, history: memoryHistory });
    await router.load();
    const Wrapper = createTestQueryClientWrapper();

    return render(<RouterProvider router={router} />, { wrapper: Wrapper });
  }

  it("requests a secure link instead of looking registrations up by email", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        delivery_mode: "email",
        expires_in_minutes: 30,
      }),
    });

    await renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if we found registrations for that email/i)).toBeInTheDocument();
      expect(screen.getByText("Automatic email sending is not enabled yet.")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/registrations/my/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "guest@example.com" }),
    });
  });

  it("loads registrations when a secure token is present in the URL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "res_123",
          event_title: "VIP Reception",
          guest_count: 2,
          status: "confirmed",
          payment_status: "paid",
          checked_in: false,
          strap_issued: false,
          created_at: "2026-03-20T10:00:00Z",
          pre_orders: [],
        },
      ],
    });

    await renderPage("/my-registrations?token=secure-token");

    await waitFor(() => {
      expect(screen.getByText("VIP Reception")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/registrations/my/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "secure-token" }),
    });
  });

  it("shows an invalid-link message when the token is rejected", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

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

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an invalid email error when the API rejects the address", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
    });

    await renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    });
  });
});
