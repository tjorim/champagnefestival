import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import RegistrationCreateModal from "@/components/admin/RegistrationCreateModal";
import { server } from "@/mocks/server";
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
  it("renders a disabled empty-state selector when no reservable events are available", async () => {
    let capturedRegistrationRequired: string | null = null;
    let capturedAuthorization: string | null = null;

    server.use(
      http.get("/api/events", ({ request }) => {
        capturedRegistrationRequired = new URL(request.url).searchParams.get("registration_required");
        capturedAuthorization = request.headers.get("Authorization");
        return HttpResponse.json([]);
      }),
    );

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

    await screen.findByRole("option", { name: "No schedule events yet." });

    expect(capturedRegistrationRequired).toBe("true");
    expect(capturedAuthorization).toBe("Bearer test");

    const [eventSelect] = screen.getAllByRole("combobox");
    expect(eventSelect).toBeDisabled();
    expect(screen.getByRole("option", { name: "No schedule events yet." })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Event ID / title")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });
});
