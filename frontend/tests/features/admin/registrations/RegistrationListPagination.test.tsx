import { jsonResponse } from "@/mocks/response";
import { editionOut, venueOut } from "@/mocks/data/builders";
import type { ComponentProps } from "react";
import type { RegistrationsPage } from "@/lib/api/adminFetch";
/**
 * GET /api/registrations is now server-paginated (see backend/app/routers/
 * registrations.py and frontend/src/lib/api/adminFetch.ts's fetchRegistrationsPage).
 * These tests cover RegistrationList's pager: page-size selection, Previous/Next
 * navigation, and button disabled states — the part that regresses silently if
 * someone reverts to rendering the full local `registrations` array again.
 */

import { axe } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import RegistrationList from "@/features/admin/registrations/RegistrationList";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import type { RegistrationListOut } from "@/api-types";
import { eventOut, registrationOut } from "../../../utils/registrationFixtures";
import { server } from "@/mocks/server";
import { createTestQueryClient } from "../../../utils/queryClient";

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
  edition_type: "festival",
  month: "march",
  dates: [],
  venue: venueOut(),
  events: [],
  producers: [],
  sponsors: [],
};

const TOTAL_REGISTRATIONS = 30;

function buildRawRegistration(index: number): RegistrationListOut {
  const n = String(index).padStart(2, "0");
  return {
    ...registrationOut({
      id: `reg-page-${n}`,
      person_id: `person-page-${n}`,
      person: {
        id: `person-page-${n}`,
        name: `Guest ${n}`,
        email: `guest${n}@example.com`,
        phone: "",
        preferred_language: null,
      },
      event_id: "event-page-test",
      event: eventOut({
        id: "event-page-test",
        title: "Pagination Test Event",
        end_time: "22:00",
        edition: {
          id: "edition-1",
          year: 2026,
          month: "march",
          edition_type: "festival",
          active: true,
        },
      }),
      status: "confirmed",
      created_at: `2024-01-${n}T00:00:00Z`,
      updated_at: `2024-01-${n}T00:00:00Z`,
    }),
    table_names: [],
  };
}

const rawRegistrations = Array.from({ length: TOTAL_REGISTRATIONS }, (_, i) =>
  buildRawRegistration(i + 1),
);
const registrations = rawRegistrations.map((row) => row);

function installPaginatedHandler(seen: URL[] = [], rows = rawRegistrations) {
  server.use(
    http.get("/api/registrations", ({ request }) => {
      const url = new URL(request.url);
      seen.push(url);
      const limit = Number(url.searchParams.get("limit") ?? rows.length);
      const page = Number(url.searchParams.get("page") ?? 1);
      const start = (page - 1) * limit;
      const items = rows.slice(start, start + limit);
      return jsonResponse<import("@/api-types").RegistrationListEnvelope>({
        items,
        total: rows.length,
        limit,
        page,
      });
    }),
  );
}

function renderRegistrationList(
  collectionRows = registrations,
  onCheckIn: ComponentProps<typeof RegistrationList>["onCheckIn"] = vi.fn(),
) {
  const queryClient = createTestQueryClient();
  render(
    <main>
      <QueryClientProvider client={queryClient}>
        <RegistrationList
          registrations={collectionRows}
          tables={[]}
          organizations={[]}
          filter="all"
          onFilterChange={vi.fn()}
          onUpdateStatus={vi.fn()}
          onRecordPayment={vi.fn()}
          onAssignTable={vi.fn()}
          onViewDetail={vi.fn()}
          onCheckIn={onCheckIn}
          onIssueStrap={vi.fn()}
          onAddRegistration={vi.fn()}

          activeEdition={activeEdition}
          applyActiveEditionFilterRequest={0}
        />
      </QueryClientProvider>
    </main>,
  );
  return queryClient;
}

describe("RegistrationList — server-side pagination", () => {
  it("renders an older edition page when the active collection does not contain its rows", async () => {
    // The hall-layout column is opt-in; a saved choice shows it.
    localStorage.setItem("admin-col-vis-registrations", JSON.stringify({ table: true }));
    const older = buildRawRegistration(1);
    older.event = { ...older.event, edition_id: "older-edition" };
    older.person = { ...older.person, name: "Historical guest" };
    older.table_id = "old-table-id";
    older.allocations = [{ table_id: older.table_id, guest_count: 1, exclusive: false }];
    older.table_names = ["Window table"];
    server.use(
      http.get("/api/registrations", () =>
        jsonResponse<import("@/api-types").RegistrationListEnvelope>({
          items: [older],
          total: 1,
          limit: 50,
          page: 1,
        }),
      ),
    );
    renderRegistrationList([]);
    await waitFor(() => expect(screen.getByText("Historical guest")).toBeInTheDocument());
    expect(screen.getByText("Window table")).toBeInTheDocument();
    expect(screen.queryByText("old-table-id")).not.toBeInTheDocument();
  });

  it("fits everything on one page at the default page size and disables Previous/Next", async () => {
    installPaginatedHandler();
    renderRegistrationList();

    await waitFor(() => expect(screen.getByText("Guest 01")).toBeInTheDocument());
    expect(screen.getByText("Guest 30")).toBeInTheDocument();
    expect(screen.getByText(/admin_table_page_summary/)).toHaveTextContent(
      `"from":1,"to":${TOTAL_REGISTRATIONS},"total":${TOTAL_REGISTRATIONS}`,
    );
    expect(screen.getByRole("button", { name: "admin_table_page_previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "admin_table_page_next" })).toBeDisabled();
  });

  it("paginates and navigates between pages once the page size is reduced below the total", async () => {
    installPaginatedHandler();
    renderRegistrationList();
    await waitFor(() => expect(screen.getByText("Guest 01")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "admin_table_page_size_aria" }));
    await user.click(await screen.findByRole("option", { name: /^25$/ }));

    await waitFor(() =>
      expect(screen.getByText(/admin_table_page_summary/)).toHaveTextContent(
        `"from":1,"to":25,"total":${TOTAL_REGISTRATIONS}`,
      ),
    );
    await waitFor(() => expect(screen.queryByText("Guest 26")).not.toBeInTheDocument());
    expect(screen.getByText("Guest 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "admin_table_page_previous" })).toBeDisabled();
    const nextButton = screen.getByRole("button", { name: "admin_table_page_next" });
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);

    await waitFor(() => expect(screen.getByText("Guest 30")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Guest 01")).not.toBeInTheDocument());
    expect(screen.getByText(/admin_table_page_summary/)).toHaveTextContent(
      `"from":26,"to":${TOTAL_REGISTRATIONS},"total":${TOTAL_REGISTRATIONS}`,
    );
    expect(screen.getByRole("button", { name: "admin_table_page_next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "admin_table_page_previous" })).not.toBeDisabled();
  });
});

describe("RegistrationList — responsive actions", () => {
  it("uses one mobile card workspace with named entrance actions", async () => {
    const matchMedia = window.matchMedia.bind(window);
    const media = vi.spyOn(window, "matchMedia").mockImplementation((query) => {
      const result = matchMedia(query);
      return query === "(max-width: 991px)"
        ? Object.defineProperty(result, "matches", { value: true })
        : result;
    });
    try {
      const seen: URL[] = [];
      const mobileRows = rawRegistrations.slice(0, 3);
      installPaginatedHandler(seen, mobileRows);
      renderRegistrationList(mobileRows);
      expect(await screen.findByText("Guest 01", {}, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "admin_mark_checked_in" })).toHaveLength(
        mobileRows.length,
      );
      expect(
        screen.getByRole("button", { name: "admin_view_edit_booking: Guest 01" }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("checkbox", { name: "admin_select_all" }));
      expect(
        screen.getByText(`admin_bulk_selected({"count":${mobileRows.length}})`),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("checkbox", { name: "admin_select_all" }));
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "admin_table_sort" }));
      await user.click(
        screen.getByRole("menuitem", {
          name: 'admin_table_sort_descending({"column":"admin_guests_count"})',
        }),
      );
      await waitFor(() =>
        expect(
          seen.some(
            (url) =>
              url.searchParams.get("sort") === "guest_count" &&
              url.searchParams.get("sort_dir") === "desc",
          ),
        ).toBe(true),
      );
      expect(await axe(document.body)).toHaveNoViolations();
    } finally {
      media.mockRestore();
    }
  }, 15_000);
});

it("keeps an open QR dialog in sync with token rotation and cancellation", async () => {
  const raw = buildRawRegistration(1);
  let token = "original-token";
  const detailRequests = vi.fn();
  server.use(
    http.get("/api/registrations", () =>
      jsonResponse<import("@/api-types").RegistrationListEnvelope>({
        items: [raw],
        total: 1,
        limit: 50,
        page: 1,
      }),
    ),
  );
  server.use(
    http.get("/api/registrations/reg-page-01", () => {
      detailRequests();
      return jsonResponse<import("@/api-types").RegistrationOutWithToken>({
        poll_question_id: null,
        stamp_progress: null,
        ...raw,
        check_in_token: token,
      });
    }),
  );
  const queryClient = renderRegistrationList([]);
  await screen.findByRole("button", { name: "Guest 01" });
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: 'admin_more_actions_for({"name":"Guest 01"})' }),
  );
  await user.click(screen.getByRole("menuitem", { name: "admin_qr_code" }));
  const before = (await screen.findByRole("img", { name: "admin_qr_code" })).outerHTML;
  expect(detailRequests).toHaveBeenCalledTimes(1);
  const update = (patch: Record<string, unknown>) => {
    queryClient.setQueriesData<RegistrationsPage>(
      { queryKey: ["admin", "registrations", "page"] },
      (previous) =>
        previous
          ? {
              ...previous,
              registrations: previous.registrations.map((record) => ({ ...record, ...patch })),
            }
          : previous,
    );
  };
  await act(async () => {
    token = "rotated-token";
    await queryClient.invalidateQueries({ queryKey: ["admin", "registrations"] });
  });
  await waitFor(() =>
    expect(screen.getByRole("img", { name: "admin_qr_code" }).outerHTML).not.toBe(before),
  );
  await act(async () => {
    update({ status: "cancelled" });
  });
  await waitFor(() =>
    expect(screen.queryByRole("img", { name: "admin_qr_code" })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("admin_status_cancelled");
});

it.each([true, false])(
  "announces guest-specific attendance only after an acknowledged success: %s",
  async (succeeded) => {
    installPaginatedHandler();
    const onCheckIn = vi.fn().mockResolvedValue(succeeded);
    renderRegistrationList(registrations, onCheckIn);
    await screen.findByRole("button", { name: "Guest 01" });
    fireEvent.click(screen.getAllByRole("button", { name: "admin_mark_checked_in" })[0]!);
    await waitFor(() => expect(onCheckIn).toHaveBeenCalledWith("reg-page-01"));
    if (succeeded)
      await waitFor(() => expect(screen.getByText("Guest 01: admin_checked_in")).toBeVisible());
    else expect(screen.queryByText("Guest 01: admin_checked_in")).not.toBeInTheDocument();
  },
);

it.each(["failed", "cancelled", "missing-token"])(
  "does not render a QR code for a %s detail response",
  async (scenario) => {
    const raw = buildRawRegistration(1);
    server.use(
      http.get("/api/registrations", () =>
        jsonResponse<import("@/api-types").RegistrationListEnvelope>({
          items: [raw],
          total: 1,
          limit: 50,
          page: 1,
        }),
      ),
      http.get("/api/registrations/reg-page-01", () =>
        scenario === "failed"
          ? HttpResponse.json(
              /* Fixture exception: error response; intentionally outside the success schema. */ {
                detail: "Internal diagnostic",
              },
              { status: 500 },
            )
          : HttpResponse.json(
              /* Deliberately malformed token in the missing-token recovery scenario. */ {
                ...raw,
                status: scenario === "cancelled" ? "cancelled" : "confirmed",
                check_in_token: scenario === "missing-token" ? null : "token",
              },
            ),
      ),
    );
    renderRegistrationList([]);
    await screen.findByRole("button", { name: "Guest 01" });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: 'admin_more_actions_for({"name":"Guest 01"})' }),
    );
    await user.click(screen.getByRole("menuitem", { name: "admin_qr_code" }));
    await waitFor(() => expect(screen.queryByLabelText("admin_loading")).not.toBeInTheDocument());
    expect(screen.queryByRole("img", { name: "admin_qr_code" })).not.toBeInTheDocument();
    if (scenario === "failed") {
      expect(screen.getByRole("alert")).toHaveTextContent("admin_error_load_data");
      expect(screen.queryByText("Internal diagnostic")).not.toBeInTheDocument();
    }
    if (scenario === "cancelled")
      expect(screen.getByRole("alert")).toHaveTextContent("admin_status_cancelled");
  },
);
