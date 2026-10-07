import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { useAdminQueries } from "@/hooks/useAdminQueries";
import { useAdminVenueActions } from "@/hooks/useAdminVenueActions";
import { seedTables } from "@/mocks/data/venue";
import { server } from "@/mocks/server";
import { patchAdminRegistrationLiveEvent } from "@/state/adminRegistrationsCollection";
import type { LiveEnvelope } from "@/utils/liveStream";
import { createTestQueryClientHarness } from "../utils/queryClient";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: "Bearer ".concat("mock-access-token"),
});

function useAdminTables() {
  const queries = useAdminQueries({
    editionId: "march-2026",
    visible: true,
    isAuthenticated: true,
    canManageAdminSections: true,
    authHeaders,
  });
  const actions = useAdminVenueActions({
    authHeaders,
    tablesCollection: queries.tablesCollection,
    venueCollections: queries.venueCollections,
  });
  return { queries, actions };
}

let eventTime = Date.parse("2026-10-05T10:00:00Z");

function registrationEvent(registrationId: string): LiveEnvelope {
  eventTime += 1000;
  return {
    topic: "seating",
    action: "updated",
    scope: { edition_id: null, event_id: null, registration_id: registrationId, table_id: null },
    keys: [
      ["admin", "registrations"],
      ["admin", "tables"],
    ],
    ts: new Date(eventTime).toISOString(),
    id: "evt-seating",
  };
}

async function renderLoaded() {
  const { Wrapper } = createTestQueryClientHarness();
  const view = renderHook(
    () => {
      return useAdminTables();
    },
    { wrapper: Wrapper },
  );
  await waitFor(() => {
    expect(view.result.current.queries.tablesQuery.data).toHaveLength(seedTables.length);
    expect(view.result.current.queries.registrationsQuery.data?.length).toBeGreaterThan(0);
  });
  return view;
}

function occupancy(
  tables: { id: string; registrationIds: string[] }[] | undefined,
  tableId: string,
): string[] {
  return tables?.find((t) => t.id === tableId)?.registrationIds ?? [];
}

describe("admin tables collection in the admin hooks", () => {
  it("drops every table when the session ends", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const view = renderHook(
      ({ isAuthenticated }: { isAuthenticated: boolean }) =>
        useAdminQueries({
          editionId: "march-2026",
          visible: true,
          isAuthenticated,
          canManageAdminSections: true,
          authHeaders,
        }),
      { wrapper: Wrapper, initialProps: { isAuthenticated: true } },
    );
    await waitFor(() =>
      expect(view.result.current.tablesQuery.data).toHaveLength(seedTables.length),
    );

    view.rerender({ isAuthenticated: false });

    await waitFor(() => expect(view.result.current.tablesQuery.data).toHaveLength(0));
    expect(queryClient.getQueryData(["admin", "tables"])).toBeUndefined();
  });

  it("derives occupancy from the registrations collection", async () => {
    const { result } = await renderLoaded();

    expect(occupancy(result.current.queries.tablesQuery.data, "table-01")).toEqual([
      "reg-01",
      "reg-02",
    ]);
    expect(occupancy(result.current.queries.tablesQuery.data, "table-02")).toEqual(["reg-04"]);
  });

  it("moves and removes a registration's table from one registration write", async () => {
    const { result } = await renderLoaded();
    const put = (allocations: unknown[]) =>
      fetch("/api/registrations/reg-01", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ allocations }),
      });

    // Move reg-01 to table-02: only the registrations collection is written.
    await put([{ table_id: "table-02", guest_count: 1, exclusive: false }]);
    await act(() => patchAdminRegistrationLiveEvent(registrationEvent("reg-01"), authHeaders));
    await waitFor(() =>
      expect(occupancy(result.current.queries.tablesQuery.data, "table-02")).toEqual([
        "reg-01",
        "reg-04",
      ]),
    );
    expect(occupancy(result.current.queries.tablesQuery.data, "table-01")).toEqual(["reg-02"]);

    // Remove the assignment altogether.
    await put([]);
    await act(() => patchAdminRegistrationLiveEvent(registrationEvent("reg-01"), authHeaders));
    await waitFor(() =>
      expect(occupancy(result.current.queries.tablesQuery.data, "table-02")).toEqual(["reg-04"]),
    );
    expect(occupancy(result.current.queries.tablesQuery.data, "table-01")).toEqual(["reg-02"]);
  });

  it("creates, renames, moves, rotates, retypes and deletes a table", async () => {
    const { result } = await renderLoaded();
    const rows = () => result.current.queries.tablesQuery.data ?? [];

    await act(() => result.current.actions.handleAddTable("T9", "layout-01", "tt-01"));
    await waitFor(() => expect(rows()).toHaveLength(seedTables.length + 1));
    const created = rows().find((t) => t.name === "T9")!;
    expect(created.registrationIds).toEqual([]);

    await act(() => result.current.actions.handleUpdateTable(created.id, "T9b"));
    await waitFor(() => expect(rows().find((t) => t.id === created.id)?.name).toBe("T9b"));

    await act(() => result.current.actions.handleChangeTableType(created.id, "tt-02"));
    await waitFor(() => expect(rows().find((t) => t.id === created.id)?.tableTypeId).toBe("tt-02"));

    act(() => result.current.actions.handleMoveTable(created.id, 33, 44));
    await waitFor(() =>
      expect(rows().find((t) => t.id === created.id)).toMatchObject({ x: 33, y: 44 }),
    );

    act(() => result.current.actions.handleRotateTable(created.id, -90));
    await waitFor(() => expect(rows().find((t) => t.id === created.id)?.rotation).toBe(270));

    await act(() => result.current.actions.handleDeleteTable(created.id));
    await waitFor(() => expect(rows()).toHaveLength(seedTables.length));
    expect(rows().some((t) => t.id === created.id)).toBe(false);
  });

  it("keeps a table when the server rejects its deletion", async () => {
    const { result } = await renderLoaded();
    server.use(
      http.delete("/api/tables/:id", () =>
        HttpResponse.json({ detail: "allocated" }, { status: 409 }),
      ),
    );

    await expect(act(() => result.current.actions.handleDeleteTable("table-01"))).rejects.toThrow();

    expect(result.current.queries.tablesQuery.data?.some((t) => t.id === "table-01")).toBe(true);
  });

  it("refreshes the tables through loadData", async () => {
    const { result } = await renderLoaded();
    server.use(http.get("/api/tables", () => HttpResponse.json(seedTables.slice(0, 1))));

    await act(() => result.current.queries.loadData());

    await waitFor(() => expect(result.current.queries.tablesQuery.data).toHaveLength(1));
  });
});
