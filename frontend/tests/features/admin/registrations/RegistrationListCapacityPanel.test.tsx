import { jsonResponse } from "@/mocks/response";
import { editionOut, eventOut, venueOut } from "@/mocks/data/builders";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import RegistrationList from "@/features/admin/registrations/RegistrationList";
import {
  summarizeGuestCheckIns,
  useRegistrationCountsQuery,
} from "@/features/admin/registrations/useRegistrationListQuery";
import { useTodayKey } from "@/hooks/useTodayKey";
import { queryKeys } from "@/lib/query/queryKeys";
import type { RegistrationDashboardStats } from "@/api-types";
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

const authHeaders = () => ({ Authorization: "Bearer mock-access-token" });

function EditionCounter() {
  const stats = useRegistrationCountsQuery(activeEdition.id, useTodayKey(), authHeaders).data;
  if (!stats) return null;
  const total = summarizeGuestCheckIns(
    stats.events.filter((event) => event.edition_id === activeEdition.id),
  );
  return (
    <div data-testid="edition-counter">
      {total.checkedIn}/{total.total}
    </div>
  );
}

function renderRegistrationList(registrations: Registration[], applyEdition = false) {
  const queryClient = createTestQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <EditionCounter />
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
        authHeaders={authHeaders}
        activeEdition={activeEdition}
        applyActiveEditionFilterRequest={applyEdition ? 1 : 0}
      />
    </QueryClientProvider>,
  );
  return queryClient;
}

const stats: RegistrationDashboardStats = {
  all: 15,
  pending: 3,
  confirmed: 12,
  active: 10,
  festival: 5,
  standalone: 10,
  today: 0,
  events: [
    {
      event_id: "event-1",
      event_title: "Collectors Bourse",
      edition_id: "edition-1",
      total: 30,
      checked_in: 12,
    },
    {
      event_id: "historical-event",
      event_title: "Capsule Exchange",
      edition_id: "previous-edition",
      total: 8,
      checked_in: 8,
    },
  ],
};

describe("RegistrationList — per-event capacity panel", () => {
  it("shares one counts request with the edition banner and refreshes both after invalidation", async () => {
    let checkedIn = 12;
    const requests = vi.fn();
    server.use(
      http.get("/api/registrations/stats", ({ request }) => {
        requests(new URL(request.url).searchParams.get("edition_id"));
        return jsonResponse<RegistrationDashboardStats>({
          ...stats,
          events: stats.events.map((event) =>
            event.event_id === "event-1" ? { ...event, checked_in: checkedIn } : event,
          ),
        });
      }),
    );

    const queryClient = renderRegistrationList([buildRegistration()], true);
    const summary = await screen.findByRole("button", { name: /admin_active_edition_checkins/ });
    expect(summary).toHaveTextContent('"checkedIn":"12","total":"30"');
    expect(
      screen
        .getAllByRole("status")
        .some((status) => status.textContent?.includes('"checkedIn":"12","total":"30"')),
    ).toBe(true);
    expect(screen.getByTestId("edition-counter")).toHaveTextContent("12/30");
    expect(requests).toHaveBeenCalledExactlyOnceWith("edition-1");
    expect(screen.queryByText("Capsule Exchange")).not.toBeInTheDocument();

    checkedIn = 15;
    await act(() =>
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.registrationCounts }),
    );
    await waitFor(() => {
      expect(summary).toHaveTextContent('"checkedIn":"15","total":"30"');
      expect(screen.getByTestId("edition-counter")).toHaveTextContent("15/30");
    });
    expect(requests).toHaveBeenCalledTimes(2);
  });

  it("labels the all-events scope and includes historical events without local rows", async () => {
    server.use(
      http.get("/api/registrations/stats", () => jsonResponse<RegistrationDashboardStats>(stats)),
    );
    renderRegistrationList([buildRegistration()]);

    const summary = await screen.findByRole("button", { name: /admin_event_checkin_summary/ });
    expect(summary).toHaveTextContent('"checkedIn":"20","total":"38"');
    expect(summary).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(summary);
    expect(screen.getByText("Capsule Exchange")).toBeVisible();
    expect(screen.getByText(/admin_checked_in: 8\/8/)).toHaveTextContent("Capsule Exchange");
  });

  it("leaves attendance unavailable when the counts request fails", async () => {
    const requested = vi.fn();
    server.use(
      http.get("/api/registrations/stats", () => {
        requested();
        return HttpResponse.json(
          /* Fixture exception: error response; intentionally outside the success schema. */ null,
          { status: 500 },
        );
      }),
    );
    renderRegistrationList([buildRegistration({ checked_in: true })]);
    await waitFor(() => expect(requested).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("button", { name: /admin_event_checkin_summary/ }),
    ).not.toBeInTheDocument();
  });
});
