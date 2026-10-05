import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAdminQueries } from "@/hooks/useAdminQueries";
import { useAdminVenueActions } from "@/hooks/useAdminVenueActions";
import { createTestQueryClientHarness } from "../utils/queryClient";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: "Bearer ".concat("mock-access-token"),
});

const PLAIN_QUERY_KEYS = [
  ["admin", "venues"],
  ["admin", "rooms"],
  ["admin", "table-types"],
  ["admin", "layouts"],
  ["admin", "exhibitors"],
  ["admin", "areas"],
] as const;

describe("plain admin queries and sign-out", () => {
  it("removes the venue, room, layout, area, table type and exhibitor entries on sign-out", async () => {
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
      expect(view.result.current.exhibitorsQuery.data).toBeDefined();
    });

    view.rerender({ isAuthenticated: false });

    await waitFor(() => {
      for (const queryKey of PLAIN_QUERY_KEYS) {
        expect(queryClient.getQueryData(queryKey)).toBeUndefined();
      }
    });
  });

  it("does not recreate a venue entry for a create that resolves after sign-out", async () => {
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
          queryClient,
          tablesCollection: queries.tablesCollection,
          venuesQueryKey: queries.venuesQueryKey,
          roomsQueryKey: queries.roomsQueryKey,
          layoutsQueryKey: queries.layoutsQueryKey,
          areasQueryKey: queries.areasQueryKey,
          tableTypesQueryKey: queries.tableTypesQueryKey,
        });
        return { queries, actions };
      },
      { wrapper: Wrapper, initialProps: { isAuthenticated: true } },
    );
    await waitFor(() =>
      expect(view.result.current.queries.venuesQuery.data?.length).toBeGreaterThan(0),
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

    expect(queryClient.getQueryData(["admin", "venues"])).toBeUndefined();
  });
});
