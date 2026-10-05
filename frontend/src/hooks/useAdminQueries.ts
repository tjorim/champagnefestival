import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminRegistrationsCollection,
  registerAdminRegistrationsCollection,
  resetAdminRegistrationsCollection,
} from "@/state/adminRegistrationsCollection";
import {
  createAdminTablesCollection,
  refetchAdminTables,
  registerAdminTablesCollection,
  resetAdminTablesCollection,
} from "@/state/adminTablesCollection";
import { withTableOccupancy } from "@/state/tableOccupancy";
import { queryKeys } from "@/utils/queryKeys";
import {
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
  canManageAdminSections: boolean;
  authHeaders: () => Record<string, string>;
}

// "tables" is deliberately absent: it is served by the admin tables collection,
// which is refetched through its own utils (see `loadData`), never by a
// standalone query.
export const ADMIN_RESOURCE_KEYS = [
  "registrations",
  "venues",
  "rooms",
  "table-types",
  "layouts",
  "exhibitors",
  "areas",
  "people",
  "members",
] as const;

export const ADMIN_ONLY_RESOURCE_KEYS = ADMIN_RESOURCE_KEYS.filter(
  (resource) => resource !== "registrations",
);

interface ShouldRefetchAdminResourceQueryOptions {
  includeAdminOnly?: boolean;
}

export function shouldRefetchAdminResourceQuery(
  queryKey: readonly unknown[],
  { includeAdminOnly = true }: ShouldRefetchAdminResourceQueryOptions = {},
): boolean {
  if (
    !(
      queryKey.length === 2 &&
      queryKey[0] === "admin" &&
      typeof queryKey[1] === "string" &&
      (ADMIN_RESOURCE_KEYS as readonly string[]).includes(queryKey[1])
    )
  ) {
    return false;
  }

  if (includeAdminOnly) return true;
  return !(ADMIN_ONLY_RESOURCE_KEYS as readonly string[]).includes(queryKey[1]);
}

export function shouldRefetchAdminOnlyResourceQuery(queryKey: readonly unknown[]): boolean {
  return (
    queryKey.length === 2 &&
    queryKey[0] === "admin" &&
    typeof queryKey[1] === "string" &&
    (ADMIN_ONLY_RESOURCE_KEYS as readonly string[]).includes(queryKey[1])
  );
}

export function useAdminQueries({
  visible,
  isAuthenticated,
  canManageAdminSections,
  authHeaders,
}: UseAdminQueriesOptions) {
  const queryClient = useQueryClient();

  // Per-resource query keys (no longer scoped to a token; OIDC manages the session)
  const registrationsQueryKey = queryKeys.admin.registrations;
  const venuesQueryKey = queryKeys.admin.venues;
  const roomsQueryKey = queryKeys.admin.rooms;
  const tableTypesQueryKey = queryKeys.admin.tableTypes;
  const layoutsQueryKey = queryKeys.admin.layouts;
  const exhibitorsQueryKey = queryKeys.admin.exhibitors;
  const areasQueryKey = queryKeys.admin.areas;
  const peopleQueryKey = queryKeys.admin.people;
  const membersQueryKey = queryKeys.admin.members;

  const registrationsQueryOptions = {
    enabled: visible && isAuthenticated,
    staleTime: 60 * 1000,
    retry: false as const,
  };
  const adminQueryOptions = {
    ...registrationsQueryOptions,
    enabled: visible && isAuthenticated && canManageAdminSections,
  };

  const registrationsCollection = useMemo(
    () =>
      createAdminRegistrationsCollection({
        queryClient,
        authHeaders,
        enabled: registrationsQueryOptions.enabled,
      }),
    [registrationsQueryOptions.enabled, authHeaders, queryClient],
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

  const tablesCollection = useMemo(
    () =>
      createAdminTablesCollection({
        queryClient,
        authHeaders,
        enabled: adminQueryOptions.enabled,
      }),
    [adminQueryOptions.enabled, authHeaders, queryClient],
  );
  const tablesLiveQuery = useLiveQuery(() => tablesCollection, [tablesCollection]);
  const tablesCollectionRef = useRef(tablesCollection);
  useEffect(() => {
    tablesCollectionRef.current = tablesCollection;
  }, [tablesCollection]);
  useEffect(() => registerAdminTablesCollection(tablesCollection), [tablesCollection]);
  // Occupancy is derived from the registrations collection on every change, so
  // one registration write updates the registrations and the seating views.
  const tablesData = useMemo(
    () => withTableOccupancy(tablesLiveQuery.data ?? [], registrationsLiveQuery.data ?? []),
    [tablesLiveQuery.data, registrationsLiveQuery.data],
  );
  const tablesQuery = {
    data: tablesData,
    error: tablesCollection.utils.lastError ?? null,
    isPending: tablesLiveQuery.isLoading,
    isFetching: tablesCollection.utils.isFetching,
  };

  useEffect(() => {
    if (isAuthenticated) return;
    // The cached queries are removed right below, so a failed reset needs no extra handling.
    void resetAdminRegistrationsCollection(registrationsCollectionRef.current).catch(
      () => undefined,
    );
    void resetAdminTablesCollection(tablesCollectionRef.current).catch(() => undefined);
    void queryClient.removeQueries({ queryKey: registrationsQueryKey });
    void queryClient.removeQueries({ queryKey: queryKeys.admin.tables });
  }, [isAuthenticated, queryClient, registrationsQueryKey]);
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
    ...(canManageAdminSections
      ? [
          tablesQuery,
          venuesQuery,
          roomsQuery,
          tableTypesQuery,
          layoutsQuery,
          exhibitorsQuery,
          areasQuery,
          peopleQuery,
          membersQuery,
        ]
      : []),
  ];

  const loadData = useCallback(async () => {
    await Promise.all([
      queryClient.refetchQueries({
        predicate: (query) =>
          shouldRefetchAdminResourceQuery(query.queryKey, {
            includeAdminOnly: canManageAdminSections,
          }),
      }),
      canManageAdminSections ? refetchAdminTables(tablesCollection) : undefined,
    ]);
  }, [canManageAdminSections, queryClient, tablesCollection]);

  return {
    // Query objects (for error/loading state access)
    registrationsQuery,
    tablesQuery,
    tablesCollection,
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
