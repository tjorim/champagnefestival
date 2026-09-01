/**
 * Bulk actions and CSV export used to operate only on whatever page happened
 * to be loaded client-side. Now that GET /api/registrations is genuinely
 * paginated (see admin.RegistrationListPagination.test.tsx), both features
 * were extended Gmail-style: CSV export always covers every registration
 * matching the current filters, and selecting a full page offers to expand
 * the selection to everything matching instead of silently capping bulk
 * actions at one page's worth of rows.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import RegistrationList from "@/components/admin/RegistrationList";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import type { RegistrationStatus } from "@/types/registration";
import { apiToRegistration } from "@/types/registrationMapper";
import { server } from "@/mocks/server";
import { createTestQueryClient } from "../utils/queryClient";

const exportToCsvMock = vi.fn();
vi.mock("@/utils/csvExport", () => ({
  exportToCsv: (...args: unknown[]) => exportToCsvMock(...args),
}));

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

// More than DEFAULT_PAGE_SIZE (50) so the default page never happens to
// contain the whole matching set.
const TOTAL_REGISTRATIONS = 60;

function buildRawRegistration(index: number): Record<string, unknown> {
  const n = String(index).padStart(2, "0");
  return {
    id: `reg-bulk-${n}`,
    person_id: `person-bulk-${n}`,
    person: {
      id: `person-bulk-${n}`,
      name: `Bulk Guest ${n}`,
      email: `bulk${n}@example.com`,
      phone: "",
    },
    event_id: "event-bulk-test",
    event: {
      id: "event-bulk-test",
      edition_id: "edition-1",
      title: "Bulk Selection Test Event",
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
    status: "pending",
    payment_status: "unpaid",
    checked_in: false,
    checked_in_at: null,
    strap_issued: false,
    created_at: `2024-01-01T00:00:${n}Z`,
    updated_at: `2024-01-01T00:00:${n}Z`,
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
  const onUpdateStatus = vi.fn(async (_id: string, _status: RegistrationStatus) => {});
  render(
    <QueryClientProvider client={queryClient}>
      <RegistrationList
        registrations={registrations}
        tables={[]}
        exhibitors={[]}
        filter="all"
        onFilterChange={vi.fn()}
        onUpdateStatus={onUpdateStatus}
        onUpdatePayment={vi.fn().mockResolvedValue(undefined)}
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
  return { onUpdateStatus };
}

describe("RegistrationList — CSV export covers every matching registration", () => {
  it("exports all matching registrations, not just the rendered page", async () => {
    installPaginatedHandler();
    renderRegistrationList();
    await waitFor(() => expect(screen.getByText("Bulk Guest 01")).toBeInTheDocument());

    fireEvent.click(screen.getByText("admin_export_csv"));

    await waitFor(() => expect(exportToCsvMock).toHaveBeenCalledTimes(1));
    const [, rows] = exportToCsvMock.mock.calls[0] as [string, unknown[]];
    expect(rows).toHaveLength(TOTAL_REGISTRATIONS);
  });
});

describe("RegistrationList — Gmail-style select-all-matching", () => {
  it("offers to expand a full-page selection and applies bulk actions to every matching id", async () => {
    installPaginatedHandler();
    const { onUpdateStatus } = renderRegistrationList();
    await waitFor(() => expect(screen.getByText("Bulk Guest 01")).toBeInTheDocument());

    // Select every row on the (default 50-row) page via the header checkbox.
    fireEvent.click(screen.getByLabelText("admin_select_all"));

    await waitFor(() =>
      expect(screen.getByText(/admin_bulk_select_page_notice/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/admin_bulk_selected\(\{"count":50\}\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/admin_bulk_select_all_matching/));

    await waitFor(() =>
      expect(
        screen.getByText(`admin_bulk_all_matching_selected({"total":${TOTAL_REGISTRATIONS}})`),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("admin_bulk_confirm"));
    await waitFor(() =>
      expect(
        screen.getByText(`admin_bulk_confirm_action({"count":${TOTAL_REGISTRATIONS}})`),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("admin_action_confirm"));

    await waitFor(() => expect(onUpdateStatus).toHaveBeenCalledTimes(TOTAL_REGISTRATIONS));
    for (const registration of rawRegistrations) {
      expect(onUpdateStatus).toHaveBeenCalledWith(registration.id, "confirmed");
    }
  });
});
