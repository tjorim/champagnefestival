import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import MyReservationsPage from "@/components/MyReservationsPage";

vi.mock("@/paraglide/messages", () => ({
  m: {
    my_reservations_title: () => "My Reservations",
    my_reservations_description: () => "Request a secure link by email.",
    my_reservations_email_label: () => "Email",
    my_reservations_email_placeholder: () => "email@example.com",
    my_reservations_request_link: () => "Email me a secure link",
    my_reservations_requesting: () => "Preparing secure link...",
    my_reservations_request_success: () => "If we found reservations for that email, we prepared a secure link.",
    my_reservations_request_pending_notice: () =>
      "Automatic email sending is not enabled yet, so the server logs the link for now.",
    my_reservations_loading: () => "Loading reservations...",
    my_reservations_invalid_token: () => "This secure link is invalid or expired.",
    my_reservations_no_results: () => "No reservations found.",
    my_reservations_error: () => "Unable to load your reservations.",
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

describe("MyReservationsPage", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function renderPage(initialEntry = "/my-reservations") {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/my-reservations" element={<MyReservationsPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("requests a secure link instead of looking reservations up by email", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, delivery_mode: "log_only", expires_in_minutes: 30 }),
    });

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a secure link/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/if we found reservations for that email/i),
      ).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/reservations/my/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "guest@example.com" }),
    });
  });

  it("loads reservations when a secure token is present in the URL", async () => {
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

    renderPage("/my-reservations?token=secure-token");

    await waitFor(() => {
      expect(screen.getByText("VIP Reception")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reservations/my/access?token=secure-token",
    );
  });

  it("shows an invalid-link message when the token is rejected", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    renderPage("/my-reservations?token=expired-token");

    await waitFor(() => {
      expect(screen.getByText("This secure link is invalid or expired.")).toBeInTheDocument();
    });
  });
});
