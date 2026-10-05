import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { useAdminQueries } from "@/hooks/useAdminQueries";
import { useAdminVenueActions } from "@/hooks/useAdminVenueActions";
import { seedAreas, seedLayouts, seedRooms, seedTables, seedVenues } from "@/mocks/data/venue";
import { server } from "@/mocks/server";
import { createTestQueryClientHarness } from "../utils/queryClient";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: "Bearer ".concat("mock-access-token"),
});

function useAdminVenues() {
  const queries = useAdminQueries({
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

async function renderLoaded() {
  const { Wrapper } = createTestQueryClientHarness();
  const view = renderHook(() => useAdminVenues(), { wrapper: Wrapper });
  await waitFor(() => {
    const { queries } = view.result.current;
    expect(queries.venuesQuery.data).toHaveLength(seedVenues.length);
    expect(queries.roomsQuery.data).toHaveLength(seedRooms.length);
    expect(queries.layoutsQuery.data).toHaveLength(seedLayouts.length);
    expect(queries.areasQuery.data).toHaveLength(seedAreas.length);
    expect(queries.tablesQuery.data).toHaveLength(seedTables.length);
  });
  return { view };
}

describe("venue group collections in the admin hooks", () => {
  it("creates, updates, archives, restores and deletes a venue", async () => {
    const { view } = await renderLoaded();
    const rows = () => view.result.current.queries.venuesQuery.data ?? [];

    await act(() =>
      view.result.current.actions.handleAddVenue(
        "Annex",
        "2 Side St",
        "Ghent",
        "9000",
        "BE",
        51,
        3,
      ),
    );
    await waitFor(() => expect(rows()).toHaveLength(seedVenues.length + 1));
    const created = rows().find((venue) => venue.name === "Annex")!;
    expect(created.postalCode).toBe("9000");

    await act(() =>
      view.result.current.actions.handleUpdateVenue(created.id, { name: "Annex II" }),
    );
    await waitFor(() => expect(rows().find((v) => v.id === created.id)?.name).toBe("Annex II"));

    await act(() => view.result.current.actions.handleArchiveVenue(created.id));
    await waitFor(() => expect(rows().find((v) => v.id === created.id)?.active).toBe(false));

    await act(() => view.result.current.actions.handleRestoreVenue(created.id));
    await waitFor(() => expect(rows().find((v) => v.id === created.id)?.active).toBe(true));

    await act(() => view.result.current.actions.handleDeleteVenue(created.id));
    await waitFor(() => expect(rows()).toHaveLength(seedVenues.length));
  });

  it("derives a venue's rooms from the rooms collection and keeps a room delete in step", async () => {
    const { view } = await renderLoaded();
    const rooms = () => view.result.current.queries.roomsQuery.data ?? [];

    await act(() =>
      view.result.current.actions.handleAddRoom("venue-01", "Hall 7", 30, 40, "#112233"),
    );
    await waitFor(() => expect(rooms()).toHaveLength(seedRooms.length + 1));
    const created = rooms().find((room) => room.name === "Hall 7")!;
    expect(rooms().filter((room) => room.venueId === "venue-01")).toHaveLength(
      seedRooms.length + 1,
    );

    await act(() => view.result.current.actions.handleArchiveRoom(created.id));
    await waitFor(() => expect(rooms().find((r) => r.id === created.id)?.active).toBe(false));

    await act(() => view.result.current.actions.handleDeleteRoom(created.id));
    await waitFor(() => expect(rooms()).toHaveLength(seedRooms.length));
  });

  it("removes a layout's areas and tables when the layout is deleted", async () => {
    const { view } = await renderLoaded();
    const { queries, actions } = view.result.current;
    const layoutAreas = seedAreas.filter((area) => area.layout_id === "layout-01");
    const layoutTables = seedTables.filter((table) => table.layout_id === "layout-01");
    expect(layoutAreas.length).toBeGreaterThan(0);
    expect(layoutTables.length).toBeGreaterThan(0);
    expect(queries.layoutsQuery.data).toHaveLength(seedLayouts.length);

    await act(() => actions.handleDeleteLayout("layout-01"));

    await waitFor(() => {
      const current = view.result.current.queries;
      expect(current.layoutsQuery.data?.map((layout) => layout.id)).not.toContain("layout-01");
      expect(current.areasQuery.data).toHaveLength(seedAreas.length - layoutAreas.length);
      expect(current.tablesQuery.data).toHaveLength(seedTables.length - layoutTables.length);
    });
  });

  it("removes a venue's rooms, layouts, areas and tables when the venue is deleted", async () => {
    const { view } = await renderLoaded();

    await act(() => view.result.current.actions.handleDeleteVenue("venue-01"));

    // The collections drop the rows at once; the follow-up refetch then agrees
    // with the server (the mock only removes the venue itself).
    await waitFor(() => {
      expect(view.result.current.queries.venuesQuery.data).toHaveLength(0);
    });
  });

  it("changes an area optimistically and rolls it back when the server refuses", async () => {
    const { view } = await renderLoaded();
    const area = () => view.result.current.queries.areasQuery.data?.find((a) => a.id === "area-01");

    act(() => view.result.current.actions.handleMoveArea("area-01", 33, 44));
    await waitFor(() => expect(area()).toMatchObject({ x: 33, y: 44 }));

    server.use(
      http.put("/api/areas/:id", () => HttpResponse.json({ detail: "no" }, { status: 500 })),
    );
    act(() => view.result.current.actions.handleRotateArea("area-01", 450));
    await waitFor(() => expect(area()?.rotation).toBe(0));
  });

  it("resizes an area, relabels it and reassigns its exhibitor", async () => {
    const { view } = await renderLoaded();
    const area = () => view.result.current.queries.areasQuery.data?.find((a) => a.id === "area-03");

    await act(() => view.result.current.actions.handleResizeArea("area-03", 5, 4));
    await waitFor(() => expect(area()).toMatchObject({ widthM: 5, lengthM: 4 }));

    act(() => view.result.current.actions.handleUpdateAreaLabel("area-03", "Main entrance"));
    await waitFor(() => expect(area()?.label).toBe("Main entrance"));

    await act(() =>
      view.result.current.actions.handleAssignAreaToItem("area-03", 2, "Bollinger", "bi-shop"),
    );
    await waitFor(() => expect(area()).toMatchObject({ exhibitorId: 2, label: "Bollinger" }));
  });

  it("adds and deletes an area and a table type", async () => {
    const { view } = await renderLoaded();
    const areas = () => view.result.current.queries.areasQuery.data ?? [];
    const tableTypes = () => view.result.current.queries.tableTypesQuery.data ?? [];

    await act(() => view.result.current.actions.handleAddArea("Bar", "bi-cup", "layout-02", 2, 2));
    await waitFor(() => expect(areas()).toHaveLength(seedAreas.length + 1));
    const area = areas().find((a) => a.label === "Bar")!;
    await act(() => view.result.current.actions.handleDeleteArea(area.id));
    await waitFor(() => expect(areas()).toHaveLength(seedAreas.length));

    const before = tableTypes().length;
    await act(() =>
      view.result.current.actions.handleAddTableType({
        name: "Bar high",
        venueId: "venue-01",
        shape: "round",
        widthM: 1,
        lengthM: 1,
        heightType: "high",
        capacity: 3,
        active: true,
      }),
    );
    await waitFor(() => expect(tableTypes()).toHaveLength(before + 1));
    const created = tableTypes().find((tt) => tt.name === "Bar high")!;
    await act(() => view.result.current.actions.handleArchiveTableType(created.id));
    await waitFor(() =>
      expect(tableTypes().find((tt) => tt.id === created.id)?.active).toBe(false),
    );
    await act(() => view.result.current.actions.handleDeleteTableType(created.id));
    await waitFor(() => expect(tableTypes()).toHaveLength(before));
  });

  it("refetches the tables when a table type's capacity changes, but not for a rename", async () => {
    const { view } = await renderLoaded();
    const refetchTables = vi.spyOn(view.result.current.queries.tablesCollection.utils, "refetch");

    await act(() =>
      view.result.current.actions.handleUpdateTableType("tt-01", { name: "Renamed" }),
    );
    expect(refetchTables).not.toHaveBeenCalled();

    await act(() => view.result.current.actions.handleUpdateTableType("tt-01", { capacity: 10 }));
    await waitFor(() => expect(refetchTables).toHaveBeenCalled());
  });

  it("refetches every venue resource through loadData", async () => {
    const { view } = await renderLoaded();
    const seen: string[] = [];
    server.use(
      http.get("/api/venues", () => {
        seen.push("venues");
        return HttpResponse.json([]);
      }),
    );

    await act(() => view.result.current.queries.loadData());

    expect(seen).toEqual(["venues"]);
    await waitFor(() => expect(view.result.current.queries.venuesQuery.data).toHaveLength(0));
  });
});
