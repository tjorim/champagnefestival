import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import RegistrationCreateModal from "@/components/admin/RegistrationCreateModal";
import { server } from "@/mocks/server";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: {
    admin_action_clear_selection: () => "Clear selection",
    admin_action_show_options: () => "Show options",
    admin_people_no_results: () => "No people found",
    close: () => "Close",
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

    server.use(
      http.get("/api/events", ({ request }) => {
        capturedRegistrationRequired = new URL(request.url).searchParams.get(
          "registration_required",
        );
        return HttpResponse.json([]);
      }),
    );

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <RegistrationCreateModal
          show={true}
          authHeaders={() => ({ "Content-Type": "application/json" })}
          onSaved={() => {}}
          onHide={() => {}}
        />
      </QueryClientProvider>,
    );

    await screen.findByRole("combobox", { name: "Event" });

    expect(capturedRegistrationRequired).toBe("true");

    const [eventSelect] = screen.getAllByRole("combobox");
    expect(eventSelect).toBeDisabled();
    expect(eventSelect).toHaveTextContent("No schedule events yet.");
    expect(screen.queryByPlaceholderText("Event ID / title")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });
  it("uses debounced server search, selects by keyboard and clears the selected person", async () => {
    const queries: string[] = [];
    server.use(
      http.get("/api/people", ({ request }) => {
        queries.push(new URL(request.url).searchParams.get("q") ?? "");
        // The server's result need not contain the literal search text.
        return HttpResponse.json([
          { id: "person-1", name: "Alice", email: "alice@example.com", phone: "123" },
        ]);
      }),
    );
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <RegistrationCreateModal
          show
          authHeaders={() => ({})}
          onSaved={() => {}}
          onHide={() => {}}
        />
      </QueryClientProvider>,
    );
    const input = screen.getByRole("combobox", { name: "Person" });
    await userEvent.type(input, "alternate spelling");
    const option = await screen.findByRole("option", { name: /Alice/ });
    expect(option).toHaveTextContent("alice@example.com");
    expect(queries).toContain("alternate spelling");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(input).toHaveValue("Alice"));
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });
});
