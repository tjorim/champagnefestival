import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import RegistrationCreateModal from "@/components/admin/RegistrationCreateModal";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: {
    admin_create_registration: () => "Create registration",
    admin_error_create_registration: () => "Could not create registration",
    admin_event_label: () => "Event",
    admin_loading_events: () => "Loading events",
    admin_select_event_placeholder: () => "Select event",
    admin_content_edition_no_events: () => "No schedule events yet.",
    admin_person_label: () => "Person",
    admin_search_person_placeholder: () => "Search person",
    admin_guests_count: () => "Guests",
    admin_notes: () => "Notes",
    admin_action_cancel: () => "Cancel",
    admin_create_action: () => "Create",
  },
}));

describe("RegistrationCreateModal", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders a disabled empty-state selector when no reservable events are available", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <RegistrationCreateModal
          show={true}
          authHeaders={() => ({ Authorization: "Bearer test" })}
          onSaved={() => {}}
          onHide={() => {}}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/events?registration_required=true", {
        headers: { Authorization: "Bearer test" },
      });
    });

    await screen.findByRole("option", { name: "No schedule events yet." });

    const [eventSelect] = screen.getAllByRole("combobox");
    expect(eventSelect).toBeDisabled();
    expect(screen.getByRole("option", { name: "No schedule events yet." })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Event ID / title")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });
});
