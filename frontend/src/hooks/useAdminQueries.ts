import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import { queryKeys } from "@/utils/queryKeys";
import {
  fetchRegistrations,
  fetchTables,
  fetchVenues,
  fetchRooms,
  fetchTableTypes,
  fetchLayouts,
  fetchExhibitors,
  fetchAreas,
  fetchPeople,
  fetchMembers,
} from "@/utils/adminFetch";

interface UseAdminQueriesOptions {
  visible: boolean;
  isAuthenticated: boolean;
  authHeaders: () => Record<string, string>;
  storedToken: string;
  activeEdition: ActiveEdition;
}

export function useAdminQueries({
  visible,
  isAuthenticated,
  authHeaders,
  storedToken,
  activeEdition,
}: UseAdminQueriesOptions) {
  const queryClient = useQueryClient();

  // Per-resource query keys, scoped to the stored token so cache is cleared on logout
  const registrationsQueryKey = queryKeys.admin.registrations(storedToken);
  const tablesQueryKey = queryKeys.admin.tables(storedToken);
  const venuesQueryKey = queryKeys.admin.venues(storedToken);
  const roomsQueryKey = queryKeys.admin.rooms(storedToken);
  const tableTypesQueryKey = queryKeys.admin.tableTypes(storedToken);
  const layoutsQueryKey = queryKeys.admin.layouts(storedToken);
  const exhibitorsQueryKey = queryKeys.admin.exhibitors(storedToken);
  const areasQueryKey = queryKeys.admin.areas(storedToken);
  const peopleQueryKey = queryKeys.admin.people(storedToken);
  const membersQueryKey = queryKeys.admin.members(storedToken);

  const adminQueryOptions = {
    enabled: visible && isAuthenticated,
    staleTime: 60 * 1000,
    retry: false as const,
  };

  const registrationsQuery = useQuery({
    queryKey: registrationsQueryKey,
    queryFn: () => fetchRegistrations(authHeaders),
    ...adminQueryOptions,
  });
  const tablesQuery = useQuery({
    queryKey: tablesQueryKey,
    queryFn: () => fetchTables(authHeaders),
    ...adminQueryOptions,
  });
  const venuesQuery = useQuery({
    queryKey: venuesQueryKey,
    queryFn: () => fetchVenues(authHeaders),
    ...adminQueryOptions,
  });
  const roomsQuery = useQuery({
    queryKey: roomsQueryKey,
    queryFn: () => fetchRooms(authHeaders),
    ...adminQueryOptions,
  });
  const tableTypesQuery = useQuery({
    queryKey: tableTypesQueryKey,
    queryFn: () => fetchTableTypes(authHeaders),
    ...adminQueryOptions,
  });
  const layoutsQuery = useQuery({
    queryKey: layoutsQueryKey,
    queryFn: () => fetchLayouts(authHeaders),
    ...adminQueryOptions,
  });
  const exhibitorsQuery = useQuery({
    queryKey: exhibitorsQueryKey,
    queryFn: () => fetchExhibitors(authHeaders),
    ...adminQueryOptions,
  });
  const areasQuery = useQuery({
    queryKey: areasQueryKey,
    queryFn: () => fetchAreas(authHeaders),
    ...adminQueryOptions,
  });
  const peopleQuery = useQuery({
    queryKey: peopleQueryKey,
    queryFn: () => fetchPeople(authHeaders),
    ...adminQueryOptions,
  });
  const membersQuery = useQuery({
    queryKey: membersQueryKey,
    queryFn: () => fetchMembers(authHeaders),
    ...adminQueryOptions,
  });

  const allQueries = [
    registrationsQuery,
    tablesQuery,
    venuesQuery,
    roomsQuery,
    tableTypesQuery,
    layoutsQuery,
    exhibitorsQuery,
    areasQuery,
    peopleQuery,
    membersQuery,
  ];

  const layoutDayOptions = useMemo(() => {
    const uniqueDates = [...new Set(activeEdition.events.map((event) => event.date))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return uniqueDates.map((date) => ({
      date,
      label: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    }));
  }, [activeEdition.events]);

  const loadData = useCallback(async () => {
    const adminResourcesToRefetch = new Set([
      "registrations",
      "tables",
      "venues",
      "rooms",
      "table-types",
      "layouts",
      "exhibitors",
      "areas",
      "people",
      "members",
    ]);
    await queryClient.refetchQueries({
      predicate: (query) => {
        const queryKey = query.queryKey as unknown[];
        return (
          queryKey[0] === "admin" &&
          typeof queryKey[1] === "string" &&
          adminResourcesToRefetch.has(queryKey[1])
        );
      },
    });
  }, [queryClient]);

  return {
    // Query objects (for error/loading state access)
    registrationsQuery,
    tablesQuery,
    venuesQuery,
    roomsQuery,
    tableTypesQuery,
    layoutsQuery,
    exhibitorsQuery,
    areasQuery,
    peopleQuery,
    membersQuery,
    // Derived booleans
    isAnyPending: allQueries.some((q) => q.isPending),
    isAnyFetching: allQueries.some((q) => q.isFetching),
    // Stable query keys (needed by mutations in the parent)
    registrationsQueryKey,
    tablesQueryKey,
    venuesQueryKey,
    roomsQueryKey,
    tableTypesQueryKey,
    layoutsQueryKey,
    exhibitorsQueryKey,
    areasQueryKey,
    peopleQueryKey,
    membersQueryKey,
    // Layout helper
    layoutDayOptions,
    // Refetch all
    loadData,
  };
}
