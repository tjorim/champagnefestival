import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAdminQueries } from "@/hooks/useAdminQueries";
import { useAdminVenueActions } from "@/hooks/useAdminVenueActions";
import { createTestQueryClientHarness } from "../utils/queryClient";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: "Bearer ".concat("mock-access-token"),
});

const VENUE_GROUP_QUERY_KEYS = [
  ["admin", "venues"],
  ["admin", "rooms"],
  ["admin", "table-types"],
  ["admin", "layouts"],
  ["admin", "areas"],
] as const;

describe("venue group collections, exhibitors and sign-out", () => {
  it("empties the venue group and removes the exhibitors entry on sign-out", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const view = renderHook(
      ({ isAuthenticated }) =>
        useAdminQueries({
          visible: true,
          isAuthenticated,
          canManageAdminSections: true,
          authHeaders,
        }),
      { wrapper: Wrapper, initialProps: { isAuthenticated: true } },
    );
    await waitFor(() => {
      expect(view.result.current.venuesQuery.data?.length).toBeGreaterThan(0);
      expect(view.result.current.roomsQuery.data?.length).toBeGreaterThan(0);
      expect(view.result.current.tableTypesQuery.data?.length).toBeGreaterThan(0);
      expect(view.result.current.layoutsQuery.data?.length).toBeGreaterThan(0);
      expect(view.result.current.areasQuery.data?.length).toBeGreaterThan(0);
      expect(view.result.current.exhibitorsQuery.data).toBeDefined();
    });

    view.rerender({ isAuthenticated: false });

    await waitFor(() => {
      expect(view.result.current.venuesQuery.data).toHaveLength(0);
      expect(view.result.current.roomsQuery.data).toHaveLength(0);
      expect(view.result.current.tableTypesQuery.data).toHaveLength(0);
      expect(view.result.current.layoutsQuery.data).toHaveLength(0);
      expect(view.result.current.areasQuery.data).toHaveLength(0);
      for (const queryKey of VENUE_GROUP_QUERY_KEYS) {
        expect(queryClient.getQueryData(queryKey)).toBeUndefined();
      }
      expect(queryClient.getQueryData(["admin", "exhibitors"])).toBeUndefined();
    });
  });

  it("does not recreate a venue row for a create that resolves after sign-out", async () => {
    const { queryClient, Wrapper } = createTestQueryClientHarness();
    const view = renderHook(
      ({ isAuthenticated }) => {
        const queries = useAdminQueries({
          visible: true,
          isAuthenticated,
          canManageAdminSections: true,
          authHeaders,
        });
        const actions = useAdminVenueActions({
          authHeaders,
          tablesCollection: queries.tablesCollection,
          venueCollections: queries.venueCollections,
        });
        return { queries, actions };
      },
      { wrapper: Wrapper, initialProps: { isAuthenticated: true } },
    );
    await waitFor(() =>
      expect(view.result.current.queries.venuesQuery.data?.length).toBeGreaterThan(0),
    );
    // The action closes over the collection of the session that started it.
    const writeUpsert = vi.spyOn(
      view.result.current.queries.venueCollections.venues.utils,
      "writeUpsert",
    );

    const pending = view.result.current.actions.handleAddVenue(
      "New venue",
      "1 Main St",
      "Town",
      "1000",
      "BE",
      50.85,
      4.35,
    );
    view.rerender({ isAuthenticated: false });
    await act(async () => {
      await pending.catch(() => undefined);
    });

    expect(view.result.current.queries.venuesQuery.data).toHaveLength(0);
    expect(writeUpsert).not.toHaveBeenCalled();
    expect(view.result.current.queries.venuesQuery.data?.map((venue) => venue.name)).not.toContain(
      "New venue",
    );
    expect(queryClient.getQueryData(["admin", "venues"])).toBeUndefined();
  });
});
