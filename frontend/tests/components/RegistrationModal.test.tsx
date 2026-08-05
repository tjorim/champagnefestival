import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import RegistrationModal from "@/components/RegistrationModal";
import { server } from "@/mocks/server";
import type { Event, Product } from "@/types/event";
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
    registration_preorder_required_hint: ({ products }: { products: string }) =>
      `Add ${products} first to unlock the optional items below.`,
    registration_preorder_included_note: ({ count, source }: { count: number; source: string }) =>
      `Includes ${count} free with your ${source}`,
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
    close: () => "Close",
  },
}));

vi.mock("@/paraglide/runtime", () => ({
  getLocale: () => "en",
  setLocale: vi.fn(),
}));

const champagneProduct: Product = {
  id: "champagne-standard",
  eventId: "fri-vip",
  name: "Champagne Bottle (Standard)",
  price: 65,
  category: "champagne",
  active: true,
  required: false,
  createdAt: "",
  updatedAt: "",
};

const vipEvent: Event = {
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
  products: [champagneProduct],
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

  it("shows pre-order products when the event has active products", () => {
    renderModal();
    expect(screen.getByText("Champagne Bottle (Standard) - €65")).toBeInTheDocument();
  });

  it("hides pre-order products when the event has no products", () => {
    renderModal({ event: { ...vipEvent, products: [] } });
    expect(screen.queryByText("Champagne Bottle (Standard) - €65")).not.toBeInTheDocument();
  });

  it("shows pre-order products for a non-vip category, as long as it has products", () => {
    // A Sunday-morning capsule exchange during the festival is not "vip", but can
    // still sell things — the category label must not gate this.
    renderModal({ event: { ...vipEvent, category: "exchange" } });
    expect(screen.getByText("Champagne Bottle (Standard) - €65")).toBeInTheDocument();
  });

  it("hides pre-order products for a vip-categorised event with no products", () => {
    // The inverse: being labelled "vip" grants nothing by itself.
    renderModal({ event: { ...vipEvent, category: "vip", products: [] } });
    expect(screen.queryByText("Champagne Bottle (Standard) - €65")).not.toBeInTheDocument();
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

  describe("required products", () => {
    const vipEntry: Product = {
      id: "vip-entry",
      eventId: "fri-vip",
      name: "VIP Entry",
      price: 50,
      category: "other",
      active: true,
      required: true,
      createdAt: "",
      updatedAt: "",
    };
    const eventWithRequiredProduct: Event = {
      ...vipEvent,
      products: [vipEntry, champagneProduct],
    };

    it("disables an optional product's increase button until the required one is added", () => {
      renderModal({ event: eventWithRequiredProduct });

      const increaseBottle = screen.getByRole("button", {
        name: /Increase quantity of Champagne Bottle \(Standard\)/i,
      });
      expect(increaseBottle).toBeDisabled();
      expect(
        screen.getByText("Add VIP Entry first to unlock the optional items below."),
      ).toBeInTheDocument();
    });

    it("enables the optional product once the required one is selected", () => {
      renderModal({ event: eventWithRequiredProduct });

      fireEvent.click(screen.getByRole("button", { name: /Increase quantity of VIP Entry/i }));

      const increaseBottle = screen.getByRole("button", {
        name: /Increase quantity of Champagne Bottle \(Standard\)/i,
      });
      expect(increaseBottle).not.toBeDisabled();
      expect(
        screen.queryByText("Add VIP Entry first to unlock the optional items below."),
      ).not.toBeInTheDocument();
    });

    it("does not lock the required product itself", () => {
      renderModal({ event: eventWithRequiredProduct });

      const increaseEntry = screen.getByRole("button", {
        name: /Increase quantity of VIP Entry/i,
      });
      expect(increaseEntry).not.toBeDisabled();
    });
  });

  describe("bundled products", () => {
    const bottle: Product = {
      id: "bottle",
      eventId: "fri-vip",
      name: "Champagne Bottle",
      price: 65,
      category: "champagne",
      active: true,
      required: false,
      createdAt: "",
      updatedAt: "",
    };
    const vipTable: Product = {
      id: "vip-table",
      eventId: "fri-vip",
      name: "VIP Table",
      price: 200,
      category: "other",
      active: true,
      required: true,
      includedProductId: "bottle",
      includedPerGuests: 2,
      createdAt: "",
      updatedAt: "",
    };
    const eventWithBundle: Event = {
      ...vipEvent,
      products: [vipTable, bottle],
    };

    it("shows no included-quantity note before the bundling product is selected", () => {
      renderModal({ event: eventWithBundle });
      expect(screen.queryByText(/Includes .* free with your/)).not.toBeInTheDocument();
    });

    it("shows the computed included quantity once the bundling product is selected", async () => {
      renderModal({ event: eventWithBundle });

      fireEvent.change(screen.getByLabelText(/Number of Guests/i), { target: { value: "4" } });
      fireEvent.click(screen.getByRole("button", { name: /Increase quantity of VIP Table/i }));

      await waitFor(() => {
        expect(screen.getByText("Includes 2 free with your VIP Table")).toBeInTheDocument();
      });
    });

    it("recomputes the included quantity as guest count changes", async () => {
      renderModal({ event: eventWithBundle });

      fireEvent.change(screen.getByLabelText(/Number of Guests/i), { target: { value: "6" } });
      fireEvent.click(screen.getByRole("button", { name: /Increase quantity of VIP Table/i }));

      await waitFor(() => {
        expect(screen.getByText("Includes 3 free with your VIP Table")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Number of Guests/i), { target: { value: "1" } });

      await waitFor(() => {
        expect(screen.queryByText(/Includes .* free with your/)).not.toBeInTheDocument();
      });
    });
  });
});
