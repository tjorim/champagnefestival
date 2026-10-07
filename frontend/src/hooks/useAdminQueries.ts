import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import {
  createAdminRegistrationsCollection,
  refetchAdminRegistrations,
  registerAdminRegistrationsCollection,
  resetAdminRegistrationsCollection,
} from "@/state/adminRegistrationsCollection";
import {
  createAdminExhibitorsCollection,
  refetchAdminExhibitors,
  registerAdminExhibitorsCollection,
  resetAdminExhibitorsCollection,
} from "@/state/adminExhibitorsCollection";
import { resetAdminPeopleSession } from "@/state/adminPeopleSession";
import { usePeopleCountsQuery } from "@/hooks/usePeopleListQuery";
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

interface UseAdminQueriesOptions {
  visible: boolean;
  isAuthenticated: boolean;
  canManageAdminSections: boolean;
  authHeaders: () => Record<string, string>;
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

  const peopleCountsQuery = usePeopleCountsQuery({}, authHeaders, adminQueryOptions.enabled);
  useEffect(() => {
    resetAdminPeopleSession();
    return resetAdminPeopleSession;
  }, [authHeaders, adminQueryOptions.enabled]);

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

  const exhibitorsCollection = useMemo(
    () =>
      createAdminExhibitorsCollection({
        queryClient,
        authHeaders,
        enabled: adminQueryOptions.enabled,
      }),
    [adminQueryOptions.enabled, authHeaders, queryClient],
  );
  const exhibitorsLiveQuery = useLiveQuery(() => exhibitorsCollection, [exhibitorsCollection]);
  const exhibitorsCollectionRef = useRef(exhibitorsCollection);
  useEffect(() => {
    exhibitorsCollectionRef.current = exhibitorsCollection;
  }, [exhibitorsCollection]);
  useEffect(() => registerAdminExhibitorsCollection(exhibitorsCollection), [exhibitorsCollection]);
  const exhibitorsQuery = {
    data: exhibitorsLiveQuery.data,
    error: exhibitorsCollection.utils.lastError ?? null,
    isPending: exhibitorsLiveQuery.isLoading,
    isFetching: exhibitorsCollection.utils.isFetching,
  };

  useEffect(() => {
    if (isAuthenticated) return;
    // The cached queries are removed right below, so a failed reset needs no extra handling.
    void resetAdminRegistrationsCollection(registrationsCollectionRef.current).catch(
      () => undefined,
    );
    void resetAdminTablesCollection(tablesCollectionRef.current).catch(() => undefined);
    void resetAdminVenueCollections(venueCollectionsRef.current).catch(() => undefined);
    void resetAdminExhibitorsCollection(exhibitorsCollectionRef.current).catch(() => undefined);
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
    void queryClient.removeQueries({ queryKey: queryKeys.admin.exhibitors });
  }, [isAuthenticated, queryClient, registrationsQueryKey]);
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
          peopleCountsQuery,
        ]
      : []),
  ];

  const loadData = useCallback(async () => {
    await Promise.all([
      // A refetch ignores `enabled`, so a hidden or signed-out dashboard must not start one.
      registrationsQueryOptions.enabled
        ? refetchAdminRegistrations(registrationsCollection)
        : undefined,
      canManageAdminSections ? refetchAdminTables(tablesCollection) : undefined,
      adminQueryOptions.enabled
        ? queryClient.invalidateQueries({ queryKey: queryKeys.admin.people })
        : undefined,
      canManageAdminSections ? refetchAdminVenueCollections(venueCollections) : undefined,
      canManageAdminSections ? refetchAdminExhibitors(exhibitorsCollection) : undefined,
    ]);
  }, [
    canManageAdminSections,
    adminQueryOptions.enabled,
    queryClient,
    exhibitorsCollection,
    registrationsCollection,
    registrationsQueryOptions.enabled,
    tablesCollection,
    venueCollections,
  ]);

  return {
    registrationsCollection,
    // Query objects (for error/loading state access)
    registrationsQuery,
    tablesQuery,
    tablesCollection,
    venuesQuery,
    roomsQuery,
    tableTypesQuery,
    layoutsQuery,
    exhibitorsQuery,
    exhibitorsCollection,
    areasQuery,
    venueCollections,
    peopleCountsQuery,
    // Derived booleans
    isAnyPending: allQueries.some((q) => q.isPending),
    isAnyFetching: allQueries.some((q) => q.isFetching),
    // Stable query keys (needed by mutations in the parent)
    registrationsQueryKey,
    // Refetch all
    loadData,
  };
}
