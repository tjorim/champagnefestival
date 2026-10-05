import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminRegistrationsCollection,
  registerAdminRegistrationsCollection,
  resetAdminRegistrationsCollection,
} from "@/state/adminRegistrationsCollection";
import {
  createAdminPeopleCollection,
  refetchAdminPeople,
  registerAdminPeopleCollection,
  resetAdminPeopleCollection,
  selectMembers,
  selectVolunteers,
} from "@/state/adminPeopleCollection";
import {
  createAdminTablesCollection,
  refetchAdminTables,
  registerAdminTablesCollection,
  resetAdminTablesCollection,
} from "@/state/adminTablesCollection";
import {
  createAdminVenueCollections,
  refetchAdminVenueCollections,
  registerAdminVenueCollections,
  resetAdminVenueCollections,
} from "@/state/adminVenueCollections";
import { withTableOccupancy } from "@/state/tableOccupancy";
import { queryKeys } from "@/utils/queryKeys";
import { fetchExhibitors } from "@/utils/adminFetch";

interface UseAdminQueriesOptions {
  visible: boolean;
  isAuthenticated: boolean;
  canManageAdminSections: boolean;
  authHeaders: () => Record<string, string>;
}

// "tables", "people", "venues", "rooms", "table-types", "layouts" and "areas"
// are deliberately absent: they are served by collections, which are refetched
// through their own utils (see `loadData`), never by a standalone query.
export const ADMIN_RESOURCE_KEYS = ["registrations", "exhibitors"] as const;

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
  const exhibitorsQueryKey = queryKeys.admin.exhibitors;

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

  const peopleCollection = useMemo(
    () =>
      createAdminPeopleCollection({
        queryClient,
        authHeaders,
        enabled: adminQueryOptions.enabled,
      }),
    [adminQueryOptions.enabled, authHeaders, queryClient],
  );
  const peopleLiveQuery = useLiveQuery(() => peopleCollection, [peopleCollection]);
  const peopleCollectionRef = useRef(peopleCollection);
  useEffect(() => {
    peopleCollectionRef.current = peopleCollection;
  }, [peopleCollection]);
  useEffect(() => registerAdminPeopleCollection(peopleCollection), [peopleCollection]);
  const peopleQuery = {
    data: peopleLiveQuery.data,
    error: peopleCollection.utils.lastError ?? null,
    isPending: peopleLiveQuery.isLoading,
    isFetching: peopleCollection.utils.isFetching,
  };
  // Members and volunteers are views over the people rows, never second copies.
  // They share the people collection's loading and error state.
  const membersData = useMemo(
    () => selectMembers(peopleLiveQuery.data ?? []),
    [peopleLiveQuery.data],
  );
  const volunteersData = useMemo(
    () => selectVolunteers(peopleLiveQuery.data ?? []),
    [peopleLiveQuery.data],
  );
  const membersQuery = { ...peopleQuery, data: membersData };
  const volunteersQuery = { ...peopleQuery, data: volunteersData };

  // The venue group (venues, rooms, table types, layouts, areas) is one set of
  // collections, built, registered and reset together.
  const venueCollections = useMemo(
    () =>
      createAdminVenueCollections({
        queryClient,
        authHeaders,
        enabled: adminQueryOptions.enabled,
      }),
    [adminQueryOptions.enabled, authHeaders, queryClient],
  );
  const venuesLiveQuery = useLiveQuery(() => venueCollections.venues, [venueCollections]);
  const roomsLiveQuery = useLiveQuery(() => venueCollections.rooms, [venueCollections]);
  const tableTypesLiveQuery = useLiveQuery(() => venueCollections.tableTypes, [venueCollections]);
  const layoutsLiveQuery = useLiveQuery(() => venueCollections.layouts, [venueCollections]);
  const areasLiveQuery = useLiveQuery(() => venueCollections.areas, [venueCollections]);
  const venueCollectionsRef = useRef(venueCollections);
  useEffect(() => {
    venueCollectionsRef.current = venueCollections;
  }, [venueCollections]);
  useEffect(() => registerAdminVenueCollections(venueCollections), [venueCollections]);
  const venuesQuery = {
    data: venuesLiveQuery.data,
    error: venueCollections.venues.utils.lastError ?? null,
    isPending: venuesLiveQuery.isLoading,
    isFetching: venueCollections.venues.utils.isFetching,
  };
  const roomsQuery = {
    data: roomsLiveQuery.data,
    error: venueCollections.rooms.utils.lastError ?? null,
    isPending: roomsLiveQuery.isLoading,
    isFetching: venueCollections.rooms.utils.isFetching,
  };
  const tableTypesQuery = {
    data: tableTypesLiveQuery.data,
    error: venueCollections.tableTypes.utils.lastError ?? null,
    isPending: tableTypesLiveQuery.isLoading,
    isFetching: venueCollections.tableTypes.utils.isFetching,
  };
  const layoutsQuery = {
    data: layoutsLiveQuery.data,
    error: venueCollections.layouts.utils.lastError ?? null,
    isPending: layoutsLiveQuery.isLoading,
    isFetching: venueCollections.layouts.utils.isFetching,
  };
  const areasQuery = {
    data: areasLiveQuery.data,
    error: venueCollections.areas.utils.lastError ?? null,
    isPending: areasLiveQuery.isLoading,
    isFetching: venueCollections.areas.utils.isFetching,
  };

  useEffect(() => {
    if (isAuthenticated) return;
    // The cached queries are removed right below, so a failed reset needs no extra handling.
    void resetAdminRegistrationsCollection(registrationsCollectionRef.current).catch(
      () => undefined,
    );
    void resetAdminTablesCollection(tablesCollectionRef.current).catch(() => undefined);
    void resetAdminPeopleCollection(peopleCollectionRef.current).catch(() => undefined);
    void resetAdminVenueCollections(venueCollectionsRef.current).catch(() => undefined);
    void queryClient.removeQueries({ queryKey: registrationsQueryKey });
    void queryClient.removeQueries({ queryKey: queryKeys.admin.tables });
    // Also removes the per-person queries nested under the people key.
    void queryClient.removeQueries({ queryKey: queryKeys.admin.people });
    for (const queryKey of [
      queryKeys.admin.venues,
      queryKeys.admin.rooms,
      queryKeys.admin.tableTypes,
      queryKeys.admin.layouts,
      queryKeys.admin.areas,
    ]) {
      void queryClient.removeQueries({ queryKey });
    }
    // Exhibitors are still a plain query: with the cache entry gone, the
    // `prev ? … : prev` patches in the dashboard have nothing to recreate
    // (see docs/decisions/tanstack-db.md).
    void queryClient.removeQueries({ queryKey: queryKeys.admin.exhibitors });
  }, [isAuthenticated, queryClient, registrationsQueryKey]);
  const exhibitorsQuery = useQuery({
    queryKey: exhibitorsQueryKey,
    queryFn: () => fetchExhibitors(authHeaders),
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
      canManageAdminSections ? refetchAdminPeople(peopleCollection) : undefined,
      canManageAdminSections ? refetchAdminVenueCollections(venueCollections) : undefined,
    ]);
  }, [canManageAdminSections, peopleCollection, queryClient, tablesCollection, venueCollections]);

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
    venueCollections,
    peopleQuery,
    membersQuery,
    volunteersQuery,
    peopleCollection,
    // Derived booleans
    isAnyPending: allQueries.some((q) => q.isPending),
    isAnyFetching: allQueries.some((q) => q.isFetching),
    // Stable query keys (needed by mutations in the parent)
    registrationsQueryKey,
    exhibitorsQueryKey,
    // Refetch all
    loadData,
  };
}
