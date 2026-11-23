import { jsonResponse } from "@/mocks/response";
import { editionOut, eventOut, venueOut } from "@/mocks/data/builders";
/**
 * The admin's per-event capacity panel reads GET /api/events/checkin-stats —
 * the endpoint built for it, and the same one the Android entrance display uses
 * — instead of counting whatever registrations this client happens to hold.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import RegistrationList from "@/features/admin/registrations/RegistrationList";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import type { Registration } from "@/types/registration";
import { server } from "@/mocks/server";
import { registrationRow } from "../../../utils/registrationFixtures";
import { createTestQueryClient } from "../../../utils/queryClient";
import { noEventTranslations } from "../../../utils/eventFixtures";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const activeEdition: ActiveEdition = {
  ...editionOut(),
  id: "edition-1",
  year: 2026,
  edition_type: "bourse",
  month: "october",
  dates: [],
  venue: venueOut(),
  events: [],
  producers: [],
  sponsors: [],
};

function buildRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    ...registrationRow(),
    id: "reg-1",
    person_id: "person-1",
    person: {
      id: "person-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+32 470 00 00 00",
      preferred_language: null,
    },
    event_id: "event-1",
    event: eventOut({
      id: "event-1",
      edition_id: "edition-1",
      ...noEventTranslations,
      title: "Collectors Bourse",
      description: "",
      date: "2026-11-21",
      start_time: "10:00",
      category: "bourse",
      products: [],
      registration_required: true,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      edition: {
        id: "edition-1",
        year: 2026,
        month: "november",
        edition_type: "bourse",
        active: true,
      },
    }),
    guest_count: 2,
    order_items: [],
    notes: "",
    status: "confirmed",
    payment_status: "unpaid",
    checked_in: false,
    strap_issued: false,
    check_in_token: "token-abc",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderRegistrationList(registrations: Registration[]) {
  const queryClient = createTestQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <RegistrationList
        registrations={registrations}
        tables={[]}
        organizations={[]}
        filter="all"
        onFilterChange={vi.fn()}
        onUpdateStatus={vi.fn()}
        onRecordPayment={vi.fn()}
        onAssignTable={vi.fn()}
        onViewDetail={vi.fn()}
        onCheckIn={vi.fn()}
        onIssueStrap={vi.fn()}
        onAddRegistration={vi.fn()}
        authHeaders={() => ({ Authorization: "Bearer test-token" })}
        activeEdition={activeEdition}
        applyActiveEditionFilterRequest={0}
      />
    </QueryClientProvider>,
  );
}

describe("RegistrationList — per-event capacity panel", () => {
  it("reports the server's guest counts, not the ones derivable from the loaded registrations", async () => {
    server.use(
      http.get("/api/events/checkin-stats", () =>
        jsonResponse<import("@/api-types").EventCheckInStats[]>([
          {
            event_id: "historical-event",
            event_title: "Historical event title",
            total: 30,
            checked_in: 12,
          },
        ]),
      ),
    );

    renderRegistrationList([buildRegistration()]);

    // The one loaded registration would tally 0/2 on its own.
    expect(screen.getByText(/admin_checked_in: 0\/2/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/admin_checked_in: 12\/30/)).toBeInTheDocument());
    expect(screen.getByText("Historical event title")).toBeInTheDocument();
    const summary = screen.getByRole("button", { name: /admin_event_checkin_summary/ });
    expect(summary).toHaveTextContent('"checkedIn":"12","total":"32"');
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Historical event title")).not.toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByText("Historical event title")).toBeVisible();
  });

  it("falls back to the locally derived counts when the stats request fails", async () => {
    server.use(
      http.get("/api/events/checkin-stats", () =>
        HttpResponse.json(
          /* Fixture exception: error response; intentionally outside the success schema. */ null,
          { status: 500 },
        ),
      ),
    );

    renderRegistrationList([
      buildRegistration(),
      buildRegistration({ id: "reg-2", checked_in: true, guest_count: 3 }),
    ]);

    await waitFor(() => expect(screen.getByText(/admin_checked_in: 3\/5/)).toBeInTheDocument());
  });

  it("scopes each event's counts separately", async () => {
    server.use(
      http.get("/api/events/checkin-stats", () =>
        jsonResponse<import("@/api-types").EventCheckInStats[]>([
          { event_title: "Collectors Bourse", event_id: "event-1", total: 30, checked_in: 12 },
          { event_title: "Capsule Exchange", event_id: "event-2", total: 8, checked_in: 8 },
        ]),
      ),
    );

    renderRegistrationList([
      buildRegistration(),
      buildRegistration({
        id: "reg-2",
        event_id: "event-2",
        event: eventOut({
          ...buildRegistration().event!,
          id: "event-2",
          title: "Capsule Exchange",
        }),
      }),
    ]);

    // Each event's counts stay labelled with the event they belong to.
    await waitFor(() =>
      expect(screen.getByText(/admin_checked_in: 12\/30/)).toHaveTextContent("Collectors Bourse"),
    );
    expect(screen.getByText(/admin_checked_in: 8\/8/)).toHaveTextContent("Capsule Exchange");
  });
});
