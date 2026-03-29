import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import RegistrationModal from "@/components/RegistrationModal";
import { server } from "@/mocks/server";
import { createTestQueryClientWrapper } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: {
    registration_modal_title: () => "Registration",
    registration_name: () => "Name",
    registration_email: () => "Email",
    registration_phone: () => "Phone Number",
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
    registration_errors_guests_required: () => "Please enter the number of guests",
    registration_errors_guests_min: () => "Minimum 1 guest required",
    registration_errors_guests_max: () => "Maximum 20 guests per registration",
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

const vipEvent = {
  id: "fri-vip",
  editionId: "ed-1",
  title: "VIP Reception",
  startTime: "19:30",
  description: "VIP event",
  category: "vip" as const,
  date: "2025-10-03",
  registrationRequired: true,
  active: true,
  createdAt: "",
  updatedAt: "",
};

describe("RegistrationModal component", () => {
  function renderModal(props?: Partial<React.ComponentProps<typeof RegistrationModal>>) {
    const wrapper = createTestQueryClientWrapper();

    return render(<RegistrationModal show={true} onHide={() => {}} event={vipEvent} {...props} />, {
      wrapper,
    });
  }

  it("does not render when show=false", () => {
    const wrapper = createTestQueryClientWrapper();
    render(<RegistrationModal show={false} onHide={() => {}} event={vipEvent} />, { wrapper });
    expect(screen.queryByText("VIP Reception")).not.toBeInTheDocument();
  });

  it("renders the modal when show=true", () => {
    renderModal();
    expect(screen.getByText("VIP Reception")).toBeInTheDocument();
    expect(screen.getByLabelText(/Name \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone Number \*/i)).toBeInTheDocument();
  });

  it("shows validation errors when submitting empty form", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /Place Registration/i }));

    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeInTheDocument();
      expect(screen.getByText("Email address is required")).toBeInTheDocument();
      expect(screen.getByText("Phone number is required")).toBeInTheDocument();
    });
  });

  it("submits form successfully and shows success message", async () => {
    // The default MSW POST /api/registrations handler accepts the submission,
    // stores the new registration, and returns 201 with the created object.
    // The component only checks response.ok, so no handler override is needed.
    renderModal();

    fireEvent.change(screen.getByLabelText(/Name \*/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/Email \*/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone Number \*/i), {
      target: { value: "+32 123 456 789" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Place Registration/i }));

    await waitFor(() => {
      expect(screen.getByText("Your registration has been received!")).toBeInTheDocument();
    });
  });

  it("shows pre-order products for VIP events", () => {
    renderModal();
    expect(screen.getByText("Champagne Bottle (Standard) - EUR65")).toBeInTheDocument();
  });

  it("hides pre-order products for non-VIP events", () => {
    renderModal({ event: { ...vipEvent, category: "general" } });
    expect(screen.queryByText("Champagne Bottle (Standard) - EUR65")).not.toBeInTheDocument();
  });

  it("shows error message on submission failure (server error)", async () => {
    server.use(
      http.post("/api/registrations", () =>
        HttpResponse.json({ error: "Internal server error" }, { status: 500 }),
      ),
    );

    renderModal();

    fireEvent.change(screen.getByLabelText(/Name \*/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/Email \*/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone Number \*/i), {
      target: { value: "+32 123 456 789" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Place Registration/i }));

    await waitFor(() => {
      expect(screen.getByText("Internal server error")).toBeInTheDocument();
    });
  });

  it("shows network error message on network error", async () => {
    server.use(http.post("/api/registrations", () => HttpResponse.error()));

    renderModal();

    fireEvent.change(screen.getByLabelText(/Name \*/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText(/Email \*/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone Number \*/i), {
      target: { value: "+32 123 456 789" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Place Registration/i }));

    await waitFor(() => {
      expect(screen.getByText("Network error. Please check your connection.")).toBeInTheDocument();
    });
  });

  it("shows error state when event is null", () => {
    renderModal({ event: null });
    expect(screen.getByText("An error occurred. Please try again.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Name \*/i)).not.toBeInTheDocument();
  });

  it("increments pre-order quantity when + button is clicked", () => {
    renderModal();

    const increaseButton = screen.getByRole("button", {
      name: /Increase quantity of Champagne Bottle \(Standard\)/i,
    });
    fireEvent.click(increaseButton);

    const controlsContainer = increaseButton.closest("div") as HTMLElement;
    expect(within(controlsContainer).getByText("1")).toBeInTheDocument();
  });

  it("decrements pre-order quantity when - button is clicked", () => {
    renderModal();

    const increaseButton = screen.getByRole("button", {
      name: /Increase quantity of Champagne Bottle \(Standard\)/i,
    });
    const decreaseButton = screen.getByRole("button", {
      name: /Decrease quantity of Champagne Bottle \(Standard\)/i,
    });

    fireEvent.click(increaseButton);
    fireEvent.click(increaseButton);
    fireEvent.click(decreaseButton);

    const controlsContainer = increaseButton.closest("div") as HTMLElement;
    expect(within(controlsContainer).getByText("1")).toBeInTheDocument();
  });

  it("does not decrement pre-order quantity below zero", () => {
    renderModal();

    const decreaseButton = screen.getByRole("button", {
      name: /Decrease quantity of Champagne Bottle \(Standard\)/i,
    });

    expect(decreaseButton).toBeDisabled();
  });
});
