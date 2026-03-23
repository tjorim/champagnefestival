import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import RegistrationModal from "@/components/RegistrationModal";
import { createTestQueryClientWrapper } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: {
    registration_modal_title: () => "VIP Registration",
    registration_name: () => "Name",
    registration_email: () => "Email",
    registration_phone: () => "Phone Number",
    registration_event: () => "Event",
    registration_select_event: () => "Select an event",
    registration_guests: () => "Number of Guests",
    registration_preorder_title: () => "Pre-order",
    registration_preorder_description: () => "Order champagne or snacks in advance",
    registration_notes: () => "Notes",
    registration_notes_placeholder: () => "Any special requests...",
    registration_submit: () => "Place Registration",
    registration_submitting: () => "Placing registration...",
    registration_success: () => "Your registration has been received!",
    registration_error: () => "An error occurred. Please try again.",
    registration_network_error: () => "Network error. Please check your connection.",
    registration_errors_name_required: () => "Name is required",
    registration_errors_email_required: () => "Email address is required",
    registration_errors_email_invalid: () => "Please enter a valid email address",
    registration_errors_phone_required: () => "Phone number is required",
    registration_errors_event_required: () => "Please select an event",
    registration_errors_guests_required: () => "Please enter the number of guests",
    registration_errors_guests_min: () => "Minimum 1 guest required",
    registration_errors_guests_max: () => "Maximum 20 guests per registration",
    registration_errors_security_failed: () => "Security verification failed",
    registration_product_champagne_standard: () => "Champagne Bottle (Standard) - EUR65",
    registration_product_champagne_prestige: () => "Champagne Bottle (Prestige) - EUR120",
    registration_product_champagne_glass: () => "Glass of Champagne - EUR12",
    registration_product_food_cheese: () => "Cheese Platter - EUR25",
    registration_product_food_charcuterie: () => "Charcuterie Board - EUR20",
    close: () => "Close",
  },
}));

vi.mock("@/paraglide/runtime", () => ({
  getLocale: () => "en",
  setLocale: vi.fn(),
}));

const registrableEvents = [
  { id: "fri-vip", title: "VIP Reception" },
  { id: "sat-party", title: "Champagne Party" },
];

describe("RegistrationModal component", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function renderModal(props?: Partial<React.ComponentProps<typeof RegistrationModal>>) {
    const wrapper = createTestQueryClientWrapper();

    return render(
      <RegistrationModal
        show={true}
        onHide={() => {}}
        registrableEvents={registrableEvents}
        {...props}
      />,
      { wrapper },
    );
  }

  it("does not render when show=false", () => {
    const wrapper = createTestQueryClientWrapper();
    render(
      <RegistrationModal show={false} onHide={() => {}} registrableEvents={registrableEvents} />,
      { wrapper },
    );
    expect(screen.queryByText("VIP Registration")).not.toBeInTheDocument();
  });

  it("renders the modal when show=true", () => {
    renderModal();
    expect(screen.getByText("VIP Registration")).toBeInTheDocument();
    expect(screen.getByLabelText(/Name \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone Number \*/i)).toBeInTheDocument();
  });

  it("shows all reservable events in the event dropdown", () => {
    renderModal();
    expect(screen.getByText("VIP Reception")).toBeInTheDocument();
    expect(screen.getByText("Champagne Party")).toBeInTheDocument();
  });

  it("shows validation errors when submitting empty form", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /Place Registration/i }));

    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeInTheDocument();
      expect(screen.getByText("Email address is required")).toBeInTheDocument();
      expect(screen.getByText("Phone number is required")).toBeInTheDocument();
      expect(screen.getByText("Please select an event")).toBeInTheDocument();
    });
  });

  it("shows email validation error for invalid email", async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/Name \*/i), {
      target: { value: "John Doe" },
    });
    fireEvent.change(screen.getByLabelText(/Email \*/i), {
      target: { value: "not-an-email" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Place Registration/i }));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email address")).toBeInTheDocument();
    });
  });

  it("clears field error when the user starts typing", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /Place Registration/i }));
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

    renderModal();

    fireEvent.change(screen.getByLabelText(/Name \*/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/Email \*/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone Number \*/i), {
      target: { value: "+32 123 456 789" },
    });
    fireEvent.change(screen.getByLabelText(/Event \*/i), { target: { value: "fri-vip" } });

    fireEvent.click(screen.getByRole("button", { name: /Place Registration/i }));

    await waitFor(() => {
      expect(screen.getByText("Your registration has been received!")).toBeInTheDocument();
    });
  });

  it("shows error message on failed submission", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Server error" }),
    });

    renderModal();

    fireEvent.change(screen.getByLabelText(/Name \*/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/Email \*/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone Number \*/i), {
      target: { value: "+32 123 456 789" },
    });
    fireEvent.change(screen.getByLabelText(/Event \*/i), { target: { value: "fri-vip" } });

    fireEvent.click(screen.getByRole("button", { name: /Place Registration/i }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows network error when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));

    renderModal();

    fireEvent.change(screen.getByLabelText(/Name \*/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/Email \*/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone Number \*/i), {
      target: { value: "+32 123 456 789" },
    });
    fireEvent.change(screen.getByLabelText(/Event \*/i), { target: { value: "fri-vip" } });

    fireEvent.click(screen.getByRole("button", { name: /Place Registration/i }));

    await waitFor(() => {
      expect(screen.getByText("Network error. Please check your connection.")).toBeInTheDocument();
    });
  });

  it("shows pre-order products", () => {
    renderModal();
    expect(screen.getByText("Champagne Bottle (Standard) - EUR65")).toBeInTheDocument();
    expect(screen.getByText("Champagne Bottle (Prestige) - EUR120")).toBeInTheDocument();
    expect(screen.getByText("Glass of Champagne - EUR12")).toBeInTheDocument();
  });

  it("increments product quantity", () => {
    renderModal();
    const plusButtons = screen.getAllByRole("button", { name: /Increase quantity/i });
    fireEvent.click(plusButtons[0]!);

    const quantities = screen.getAllByText("1");
    expect(quantities.length).toBeGreaterThan(0);
  });

  it("calls onHide when close button is clicked", () => {
    const onHide = vi.fn();
    renderModal({ onHide });
    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);
    expect(onHide).toHaveBeenCalled();
  });
});
