/**
 * GET /api/registrations is now server-paginated (see backend/app/routers/
 * registrations.py and frontend/src/utils/adminFetch.ts's fetchRegistrationsPage).
 * These tests cover RegistrationList's pager: page-size selection, Previous/Next
 * navigation, and button disabled states — the part that regresses silently if
 * someone reverts to rendering the full local `registrations` array again.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import RegistrationList from "@/components/admin/RegistrationList";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import { apiToRegistration } from "@/types/registrationMapper";
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
  editionType: "festival",
  month: "march",
  dates: [],
  venue: {
    venueName: "Test Venue",
    address: "123 Main St",
    city: "Ghent",
    postalCode: "9000",
    country: "BE",
    coordinates: { lat: 0, lng: 0 },
  },
  events: [],
  producers: [],
  sponsors: [],
};

const TOTAL_REGISTRATIONS = 30;

function buildRawRegistration(index: number): Record<string, unknown> {
  const n = String(index).padStart(2, "0");
  return {
    id: `reg-page-${n}`,
    person_id: `person-page-${n}`,
    person: {
      id: `person-page-${n}`,
      name: `Guest ${n}`,
      email: `guest${n}@example.com`,
      phone: "",
    },
    event_id: "event-page-test",
    event: {
      id: "event-page-test",
      edition_id: "edition-1",
      title: "Pagination Test Event",
      description: "",
      date: "2026-03-06",
      start_time: "18:00",
      end_time: "22:00",
      category: "festival",
      registration_required: true,
      max_capacity: null,
      active: true,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      edition: {
        id: "edition-1",
        year: 2026,
        month: "march",
        edition_type: "festival",
        active: true,
      },
    },
    guest_count: 1,
    order_items: [],
    notes: "",
    accessibility_note: "",
    table_id: null,
    status: "confirmed",
    payment_status: "unpaid",
    checked_in: false,
    checked_in_at: null,
    strap_issued: false,
    created_at: `2024-01-${n}T00:00:00Z`,
    updated_at: `2024-01-${n}T00:00:00Z`,
  };
}

const rawRegistrations = Array.from({ length: TOTAL_REGISTRATIONS }, (_, i) =>
  buildRawRegistration(i + 1),
);
const registrations = rawRegistrations.map(apiToRegistration);

function installPaginatedHandler() {
  server.use(
    http.get("/api/registrations", ({ request }) => {
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get("limit") ?? rawRegistrations.length);
      const page = Number(url.searchParams.get("page") ?? 1);
      const start = (page - 1) * limit;
      const items = rawRegistrations.slice(start, start + limit);
      return HttpResponse.json({ items, total: rawRegistrations.length, limit, page });
    }),
  );
}

function renderRegistrationList() {
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

describe("RegistrationList — server-side pagination", () => {
  it("fits everything on one page at the default page size and disables Previous/Next", async () => {
    installPaginatedHandler();
    renderRegistrationList();

    await waitFor(() => expect(screen.getByText("Guest 01")).toBeInTheDocument());
    expect(screen.getByText("Guest 30")).toBeInTheDocument();
    expect(screen.getByText(/admin_registrations_page_summary/)).toHaveTextContent(
      `"from":1,"to":${TOTAL_REGISTRATIONS},"total":${TOTAL_REGISTRATIONS}`,
    );
    expect(screen.getByText("admin_registrations_page_previous")).toBeDisabled();
    expect(screen.getByText("admin_registrations_page_next")).toBeDisabled();
  });

  it("paginates and navigates between pages once the page size is reduced below the total", async () => {
    installPaginatedHandler();
    renderRegistrationList();
    await waitFor(() => expect(screen.getByText("Guest 01")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("admin_registrations_page_size_aria"), {
      target: { value: "25" },
    });

    await waitFor(() =>
      expect(screen.getByText(/admin_registrations_page_summary/)).toHaveTextContent(
        `"from":1,"to":25,"total":${TOTAL_REGISTRATIONS}`,
      ),
    );
    await waitFor(() => expect(screen.queryByText("Guest 26")).not.toBeInTheDocument());
    expect(screen.getByText("Guest 25")).toBeInTheDocument();
    expect(screen.getByText("admin_registrations_page_previous")).toBeDisabled();
    const nextButton = screen.getByText("admin_registrations_page_next");
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);

    await waitFor(() => expect(screen.getByText("Guest 30")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Guest 01")).not.toBeInTheDocument());
    expect(screen.getByText(/admin_registrations_page_summary/)).toHaveTextContent(
      `"from":26,"to":${TOTAL_REGISTRATIONS},"total":${TOTAL_REGISTRATIONS}`,
    );
    expect(screen.getByText("admin_registrations_page_next")).toBeDisabled();
    expect(screen.getByText("admin_registrations_page_previous")).not.toBeDisabled();
  });
});
