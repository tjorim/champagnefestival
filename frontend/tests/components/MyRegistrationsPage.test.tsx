import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import MyRegistrationsPage from "@/components/MyRegistrationsPage";
import { createTestQueryClientWrapper } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: {
    my_registrations_title: () => "My Registrations",
    my_reservations_title: () => "My Registrations",
    my_reservations_description: () => "Request a secure link by email.",
    my_reservations_email_label: () => "Email",
    my_reservations_email_placeholder: () => "email@example.com",
    my_reservations_request_link: () => "Email me a secure link",
    my_reservations_requesting: () => "Preparing secure link...",
    my_reservations_request_success: () => "If we found registrations for that email, we prepared a secure link.",
    my_reservations_invalid_email: () => "Please enter a valid email address.",
    my_reservations_request_pending_notice: () =>
      "Automatic email sending is not enabled yet.",
    my_reservations_loading: () => "Loading registrations...",
    my_reservations_invalid_token: () => "This secure link is invalid or expired.",
    my_reservations_no_results: () => "No registrations found.",
    my_reservations_error: () => "Unable to load your registrations.",
    my_reservations_guests_label: () => "guests",
    my_reservations_request_new_link: () => "Request another secure link",
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

  function renderPage(initialEntry = "/my-registrations") {
    const wrapper = createTestQueryClientWrapper();
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/my-registrations" element={<MyRegistrationsPage />} />
        </Routes>
      </MemoryRouter>,
      { wrapper },
    );
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

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/if we found registrations for that email/i),
      ).toBeInTheDocument();
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

    renderPage("/my-registrations?token=secure-token");

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

    renderPage("/my-registrations?token=expired-token");

    await waitFor(() => {
      expect(screen.getByText("This secure link is invalid or expired.")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /request another secure link/i }),
      ).toBeInTheDocument();
    });
  });

  it("validates the email before sending the request", async () => {
    renderPage();

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

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    });
  });
});
