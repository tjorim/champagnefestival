import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import ReservationModal from "@/components/ReservationModal";

vi.mock("@/paraglide/messages", () => ({
  m: {
    reservation_modal_title: () => "VIP Reservation",
    reservation_name: () => "Name",
    reservation_email: () => "Email",
    reservation_phone: () => "Phone Number",
    reservation_event: () => "Event",
    reservation_select_event: () => "Select an event",
    reservation_guests: () => "Number of Guests",
    reservation_preorder_title: () => "Pre-order",
    reservation_preorder_description: () => "Order champagne or snacks in advance",
    reservation_notes: () => "Notes",
    reservation_notes_placeholder: () => "Any special requests...",
    reservation_submit: () => "Place Reservation",
    reservation_submitting: () => "Placing reservation...",
    reservation_success: () => "Your reservation has been received!",
    reservation_error: () => "An error occurred. Please try again.",
    reservation_network_error: () => "Network error. Please check your connection.",
    reservation_errors_name_required: () => "Name is required",
    reservation_errors_email_required: () => "Email address is required",
    reservation_errors_email_invalid: () => "Please enter a valid email address",
    reservation_errors_phone_required: () => "Phone number is required",
    reservation_errors_event_required: () => "Please select an event",
    reservation_errors_guests_required: () => "Please enter the number of guests",
    reservation_errors_guests_min: () => "Minimum 1 guest required",
    reservation_errors_guests_max: () => "Maximum 20 guests per reservation",
    reservation_errors_security_failed: () => "Security verification failed",
    reservation_product_champagne_standard: () => "Champagne Bottle (Standard) - EUR65",
    reservation_product_champagne_prestige: () => "Champagne Bottle (Prestige) - EUR120",
    reservation_product_champagne_glass: () => "Glass of Champagne - EUR12",
    reservation_product_food_cheese: () => "Cheese Platter - EUR25",
    reservation_product_food_charcuterie: () => "Charcuterie Board - EUR20",
    close: () => "Close",
  },
}));

vi.mock("@/paraglide/runtime", () => ({
  getLocale: () => "en",
  setLocale: vi.fn(),
}));

const reservableEvents = [
  { id: "fri-vip", title: "VIP Reception" },
  { id: "sat-party", title: "Champagne Party" },
];

describe("ReservationModal component", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not render when show=false", () => {
    render(<ReservationModal show={false} onHide={() => {}} reservableEvents={reservableEvents} />);
    expect(screen.queryByText("VIP Reservation")).not.toBeInTheDocument();
  });

  it("renders the modal when show=true", () => {
    render(<ReservationModal show={true} onHide={() => {}} reservableEvents={reservableEvents} />);
    expect(screen.getByText("VIP Reservation")).toBeInTheDocument();
    expect(screen.getByLabelText(/Name \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone Number \*/i)).toBeInTheDocument();
  });

  it("shows all reservable events in the event dropdown", () => {
    render(<ReservationModal show={true} onHide={() => {}} reservableEvents={reservableEvents} />);
    expect(screen.getByText("VIP Reception")).toBeInTheDocument();
    expect(screen.getByText("Champagne Party")).toBeInTheDocument();
  });

  it("shows validation errors when submitting empty form", async () => {
    render(<ReservationModal show={true} onHide={() => {}} reservableEvents={reservableEvents} />);

    fireEvent.click(screen.getByRole("button", { name: /Place Reservation/i }));

    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeInTheDocument();
      expect(screen.getByText("Email address is required")).toBeInTheDocument();
      expect(screen.getByText("Phone number is required")).toBeInTheDocument();
      expect(screen.getByText("Please select an event")).toBeInTheDocument();
    });
  });

  it("shows email validation error for invalid email", async () => {
    render(<ReservationModal show={true} onHide={() => {}} reservableEvents={reservableEvents} />);

    fireEvent.change(screen.getByLabelText(/Name \*/i), {
      target: { value: "John Doe" },
    });
    fireEvent.change(screen.getByLabelText(/Email \*/i), {
      target: { value: "not-an-email" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Place Reservation/i }));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email address")).toBeInTheDocument();
    });
  });

  it("clears field error when the user starts typing", async () => {
    render(<ReservationModal show={true} onHide={() => {}} reservableEvents={reservableEvents} />);

    fireEvent.click(screen.getByRole("button", { name: /Place Reservation/i }));
    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Name \*/i), {
      target: { value: "A" },
    });
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
  });

  it("submits form successfully and shows success message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, id: "res_123" }),
    });

    render(<ReservationModal show={true} onHide={() => {}} reservableEvents={reservableEvents} />);

    fireEvent.change(screen.getByLabelText(/Name \*/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/Email \*/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone Number \*/i), {
      target: { value: "+32 123 456 789" },
    });
    fireEvent.change(screen.getByLabelText(/Event \*/i), { target: { value: "fri-vip" } });

    fireEvent.click(screen.getByRole("button", { name: /Place Reservation/i }));

    await waitFor(() => {
      expect(screen.getByText("Your reservation has been received!")).toBeInTheDocument();
    });
  });

  it("shows error message on failed submission", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Server error" }),
    });

    render(<ReservationModal show={true} onHide={() => {}} reservableEvents={reservableEvents} />);

    fireEvent.change(screen.getByLabelText(/Name \*/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/Email \*/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone Number \*/i), {
      target: { value: "+32 123 456 789" },
    });
    fireEvent.change(screen.getByLabelText(/Event \*/i), { target: { value: "fri-vip" } });

    fireEvent.click(screen.getByRole("button", { name: /Place Reservation/i }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows network error when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));

    render(<ReservationModal show={true} onHide={() => {}} reservableEvents={reservableEvents} />);

    fireEvent.change(screen.getByLabelText(/Name \*/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/Email \*/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone Number \*/i), {
      target: { value: "+32 123 456 789" },
    });
    fireEvent.change(screen.getByLabelText(/Event \*/i), { target: { value: "fri-vip" } });

    fireEvent.click(screen.getByRole("button", { name: /Place Reservation/i }));

    await waitFor(() => {
      expect(screen.getByText("Network error. Please check your connection.")).toBeInTheDocument();
    });
  });

  it("shows pre-order products", () => {
    render(<ReservationModal show={true} onHide={() => {}} reservableEvents={reservableEvents} />);
    expect(screen.getByText("Champagne Bottle (Standard) - EUR65")).toBeInTheDocument();
    expect(screen.getByText("Champagne Bottle (Prestige) - EUR120")).toBeInTheDocument();
    expect(screen.getByText("Glass of Champagne - EUR12")).toBeInTheDocument();
  });

  it("increments product quantity", () => {
    render(<ReservationModal show={true} onHide={() => {}} reservableEvents={reservableEvents} />);
    const plusButtons = screen.getAllByRole("button", { name: /Increase quantity/i });
    fireEvent.click(plusButtons[0]!);

    const quantities = screen.getAllByText("1");
    expect(quantities.length).toBeGreaterThan(0);
  });

  it("calls onHide when close button is clicked", () => {
    const onHide = vi.fn();
    render(<ReservationModal show={true} onHide={onHide} reservableEvents={reservableEvents} />);
    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);
    expect(onHide).toHaveBeenCalled();
  });
});
