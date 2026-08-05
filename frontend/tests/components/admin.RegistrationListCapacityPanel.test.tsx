/**
 * The admin's per-event capacity panel reads GET /api/events/checkin-stats —
 * the endpoint built for it, and the same one the Android entrance display uses
 * — instead of counting whatever registrations this client happens to hold.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import RegistrationList from "@/components/admin/RegistrationList";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import type { Registration } from "@/types/registration";
import { server } from "@/mocks/server";
import { createTestQueryClient } from "../utils/queryClient";

vi.mock("@/paraglide/messages", () => ({
  m: new Proxy({} as Record<string, (...args: unknown[]) => string>, {
    get(_target, key: string) {
      return (...args: unknown[]) => (args.length ? `${key}(${JSON.stringify(args[0])})` : key);
    },
  }),
}));

const activeEdition: ActiveEdition = {
  id: "edition-1",
  year: 2026,
  editionType: "bourse",
  month: "october",
  dates: [],
  venue: {
    venueName: "MEC Staf Versluys",
    address: "Kapelstraat 76",
    city: "Bredene",
    postalCode: "8450",
    country: "BE",
    coordinates: { lat: 0, lng: 0 },
  },
  events: [],
  producers: [],
  sponsors: [],
};

function buildRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: "reg-1",
    personId: "person-1",
    person: {
      id: "person-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+32 470 00 00 00",
    },
    eventId: "event-1",
    event: {
      id: "event-1",
      editionId: "edition-1",
      title: "Collectors Bourse",
      description: "",
      date: "2026-11-21",
      startTime: "10:00",
      category: "bourse",
      products: [],
      registrationRequired: true,
      maxCapacity: 40,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      edition: {
        id: "edition-1",
        year: 2026,
        month: "november",
        editionType: "bourse",
        active: true,
      },
    },
    guestCount: 2,
    orderItems: [],
    notes: "",
    accessibilityNote: "",
    status: "confirmed",
    paymentStatus: "unpaid",
    checkedIn: false,
    strapIssued: false,
    checkInToken: "token-abc",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
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
        exhibitors={[]}
        filter="all"
        onFilterChange={vi.fn()}
        onUpdateStatus={vi.fn()}
        onUpdatePayment={vi.fn()}
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
        HttpResponse.json([{ event_id: "event-1", total: 30, checked_in: 12 }]),
      ),
    );

    renderRegistrationList([buildRegistration()]);

    // The one loaded registration would tally 0/2 on its own.
    expect(screen.getByText(/admin_checked_in: 0\/2/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/admin_checked_in: 12\/30/)).toBeInTheDocument());
    // Capacity comes from the event, which the stats endpoint doesn't carry.
    expect(screen.getByText("event_capacity: 30/40")).toBeInTheDocument();
  });

  it("falls back to the locally derived counts when the stats request fails", async () => {
    server.use(
      http.get("/api/events/checkin-stats", () => HttpResponse.json(null, { status: 500 })),
    );

    renderRegistrationList([
      buildRegistration(),
      buildRegistration({ id: "reg-2", checkedIn: true, guestCount: 3 }),
    ]);

    await waitFor(() => expect(screen.getByText(/admin_checked_in: 3\/5/)).toBeInTheDocument());
  });

  it("scopes each event's counts separately", async () => {
    server.use(
      http.get("/api/events/checkin-stats", () =>
        HttpResponse.json([
          { event_id: "event-1", total: 30, checked_in: 12 },
          { event_id: "event-2", total: 8, checked_in: 8 },
        ]),
      ),
    );

    renderRegistrationList([
      buildRegistration(),
      buildRegistration({
        id: "reg-2",
        eventId: "event-2",
        event: {
          ...buildRegistration().event!,
          id: "event-2",
          title: "Capsule Exchange",
          maxCapacity: undefined,
        },
      }),
    ]);

    // Each event's counts stay labelled with the event they belong to.
    await waitFor(() =>
      expect(screen.getByText(/admin_checked_in: 12\/30/)).toHaveTextContent("Collectors Bourse"),
    );
    expect(screen.getByText(/admin_checked_in: 8\/8/)).toHaveTextContent("Capsule Exchange");
  });
});
