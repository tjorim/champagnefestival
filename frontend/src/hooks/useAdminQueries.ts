import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminRegistrationsCollection,
  registerAdminRegistrationsCollection,
  resetAdminRegistrationsCollection,
} from "@/state/adminRegistrationsCollection";
import { queryKeys } from "@/utils/queryKeys";
import {
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
}

export const ADMIN_RESOURCE_KEYS = [
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
] as const;

export function shouldRefetchAdminResourceQuery(queryKey: readonly unknown[]): boolean {
  return (
    queryKey.length === 2 &&
    queryKey[0] === "admin" &&
    typeof queryKey[1] === "string" &&
    (ADMIN_RESOURCE_KEYS as readonly string[]).includes(queryKey[1])
  );
}

export function useAdminQueries({
  visible,
  isAuthenticated,
  authHeaders,
}: UseAdminQueriesOptions) {
  const queryClient = useQueryClient();

  // Per-resource query keys (no longer scoped to a token; OIDC manages the session)
  const registrationsQueryKey = queryKeys.admin.registrations;
  const tablesQueryKey = queryKeys.admin.tables;
  const venuesQueryKey = queryKeys.admin.venues;
  const roomsQueryKey = queryKeys.admin.rooms;
  const tableTypesQueryKey = queryKeys.admin.tableTypes;
  const layoutsQueryKey = queryKeys.admin.layouts;
  const exhibitorsQueryKey = queryKeys.admin.exhibitors;
  const areasQueryKey = queryKeys.admin.areas;
  const peopleQueryKey = queryKeys.admin.people;
  const membersQueryKey = queryKeys.admin.members;

  const adminQueryOptions = {
    enabled: visible && isAuthenticated,
    staleTime: 60 * 1000,
    retry: false as const,
  };

  const registrationsCollection = useMemo(
    () =>
      createAdminRegistrationsCollection({
        queryClient,
        authHeaders,
        enabled: adminQueryOptions.enabled,
      }),
    [adminQueryOptions.enabled, authHeaders, queryClient],
  );
  const registrationsLiveQuery = useLiveQuery(
    () => registrationsCollection,
    [registrationsCollection],
  );
  const registrationsCollectionRef = useRef(registrationsCollection);
  useEffect(() => {
    registrationsCollectionRef.current = registrationsCollection;
  }, [registrationsCollection]);
  useEffect(
    () => registerAdminRegistrationsCollection(registrationsCollection),
    [registrationsCollection],
  );
  const registrationsQuery = {
    data: registrationsLiveQuery.data,
    error: registrationsCollection.utils.lastError ?? null,
    isPending: registrationsLiveQuery.isLoading,
    isFetching: registrationsCollection.utils.isFetching,
  };

  useEffect(() => {
    if (isAuthenticated) return;
    resetAdminRegistrationsCollection(registrationsCollectionRef.current);
    void queryClient.removeQueries({ queryKey: registrationsQueryKey });
  }, [isAuthenticated, queryClient, registrationsQueryKey]);
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

  const loadData = useCallback(async () => {
    await queryClient.refetchQueries({
      predicate: (query) => shouldRefetchAdminResourceQuery(query.queryKey),
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
    // Refetch all
    loadData,
  };
}
