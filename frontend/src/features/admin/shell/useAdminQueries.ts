import { invalidateAdmin } from "@/lib/query/queryInvalidation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { collectionError } from "@/lib/collections/adminCollectionFactory";
import {
  createAdminRegistrationsCollection,
  registerAdminRegistrationsCollection,
  resetAdminRegistrationsCollection,
} from "@/lib/collections/adminRegistrationsCollection";
import {
  createAdminOrganizationsCollection,
  registerAdminOrganizationsCollection,
  resetAdminOrganizationsCollection,
} from "@/lib/collections/adminOrganizationsCollection";
import { resetAdminPeopleSession } from "../people/adminPeopleSession";
import { useRegistrationCountsQuery } from "../registrations/useRegistrationListQuery";
import { useTodayKey } from "@/hooks/useTodayKey";
import { usePeopleCountsQuery } from "../people/usePeopleListQuery";
import {
  createAdminTablesCollection,
  registerAdminTablesCollection,
  resetAdminTablesCollection,
} from "@/lib/collections/adminTablesCollection";
import {
  createAdminVenueCollections,
  registerAdminVenueCollections,
  resetAdminVenueCollections,
} from "../venue/adminVenueCollections";
import { withTableOccupancy } from "@/lib/collections/tableOccupancy";
import { queryKeys } from "@/lib/query/queryKeys";

interface UseAdminQueriesOptions {
  visible: boolean;
  editionId: string;
  activeEditionLoaded?: boolean;
  isAuthenticated: boolean;
  canManageAdminSections: boolean;
  accountId?: string | null;
}

export function useAdminQueries({
  visible,
  editionId,
  activeEditionLoaded = true,
  isAuthenticated,
  canManageAdminSections,
  accountId,
}: UseAdminQueriesOptions) {
  const queryClient = useQueryClient();
  const session = useMemo(() => ({ queryClient, accountId }), [queryClient, accountId]);
  const today = useTodayKey();
  const registrationCountsQuery = useRegistrationCountsQuery(
    editionId,
    today,

    visible && isAuthenticated && canManageAdminSections && activeEditionLoaded,
  );

  // Per-resource query keys (no longer scoped to a token; OIDC manages the session)
  const registrationsQueryKey = useMemo(
    () => queryKeys.admin.registrationsEdition(editionId),
    [editionId],
  );

  const enabled = visible && isAuthenticated;
  const adminEnabled = enabled && canManageAdminSections;

  const registrationsCollection = useMemo(
    () =>
      createAdminRegistrationsCollection({
        queryClient: session.queryClient,

        editionId,
        enabled,
      }),
    [enabled, session, editionId],
  );
  const registrationsLiveQuery = useLiveQuery(registrationsCollection);
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
    error: collectionError(registrationsCollection),
    isPending: registrationsLiveQuery.isLoading,
    isFetching: registrationsCollection.utils.isFetching,
  };

  const tablesCollection = useMemo(
    () =>
      createAdminTablesCollection({
        queryClient: session.queryClient,

        enabled: adminEnabled,
      }),
    [adminEnabled, session],
  );
  const tablesLiveQuery = useLiveQuery(tablesCollection);
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
    error: collectionError(tablesCollection),
    isPending: tablesLiveQuery.isLoading,
    isFetching: tablesCollection.utils.isFetching,
  };

  const peopleCountsQuery = usePeopleCountsQuery({}, adminEnabled);
  useEffect(() => {
    resetAdminPeopleSession();
    return resetAdminPeopleSession;
  }, [session, adminEnabled]);

  // The venue group (venues, rooms, table types, layouts, areas) is one set of
  // collections, built, registered and reset together.
  const venueCollections = useMemo(
    () =>
      createAdminVenueCollections({
        queryClient: session.queryClient,

        enabled: adminEnabled,
      }),
    [adminEnabled, session],
  );
  const venuesLiveQuery = useLiveQuery(venueCollections.venues);
  const roomsLiveQuery = useLiveQuery(venueCollections.rooms);
  const tableTypesLiveQuery = useLiveQuery(venueCollections.tableTypes);
  const layoutsLiveQuery = useLiveQuery(venueCollections.layouts);
  const areasLiveQuery = useLiveQuery(venueCollections.areas);
  const venueCollectionsRef = useRef(venueCollections);
  useEffect(() => {
    venueCollectionsRef.current = venueCollections;
  }, [venueCollections]);
  useEffect(() => registerAdminVenueCollections(venueCollections), [venueCollections]);
  const venuesQuery = {
    data: venuesLiveQuery.data,
    error: collectionError(venueCollections.venues),
    isPending: venuesLiveQuery.isLoading,
    isFetching: venueCollections.venues.utils.isFetching,
  };
  const roomsQuery = {
    data: roomsLiveQuery.data,
    error: collectionError(venueCollections.rooms),
    isPending: roomsLiveQuery.isLoading,
    isFetching: venueCollections.rooms.utils.isFetching,
  };
  const tableTypesQuery = {
    data: tableTypesLiveQuery.data,
    error: collectionError(venueCollections.tableTypes),
    isPending: tableTypesLiveQuery.isLoading,
    isFetching: venueCollections.tableTypes.utils.isFetching,
  };
  const layoutsQuery = {
    data: layoutsLiveQuery.data,
    error: collectionError(venueCollections.layouts),
    isPending: layoutsLiveQuery.isLoading,
    isFetching: venueCollections.layouts.utils.isFetching,
  };
  const areasQuery = {
    data: areasLiveQuery.data,
    error: collectionError(venueCollections.areas),
    isPending: areasLiveQuery.isLoading,
    isFetching: venueCollections.areas.utils.isFetching,
  };

  const organizationsCollection = useMemo(
    () =>
      createAdminOrganizationsCollection({
        queryClient: session.queryClient,

        enabled: adminEnabled,
      }),
    [adminEnabled, session],
  );
  const organizationsLiveQuery = useLiveQuery(organizationsCollection);
  const organizationsCollectionRef = useRef(organizationsCollection);
  useEffect(() => {
    organizationsCollectionRef.current = organizationsCollection;
  }, [organizationsCollection]);
  useEffect(
    () => registerAdminOrganizationsCollection(organizationsCollection),
    [organizationsCollection],
  );
  const organizationsQuery = {
    data: organizationsLiveQuery.data,
    error: collectionError(organizationsCollection),
    isPending: organizationsLiveQuery.isLoading,
    isFetching: organizationsCollection.utils.isFetching,
  };

  useEffect(() => {
    if (isAuthenticated) return;
    // The cached queries are removed right below, so a failed reset needs no extra handling.
    void resetAdminRegistrationsCollection(registrationsCollectionRef.current).catch(
      () => undefined,
    );
    void resetAdminTablesCollection(tablesCollectionRef.current).catch(() => undefined);
    void resetAdminVenueCollections(venueCollectionsRef.current).catch(() => undefined);
    void resetAdminOrganizationsCollection(organizationsCollectionRef.current).catch(
      () => undefined,
    );
    void queryClient.removeQueries({ queryKey: queryKeys.admin.registrations });
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
    void queryClient.removeQueries({ queryKey: queryKeys.admin.organizations });
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
          organizationsQuery,
          areasQuery,
          peopleCountsQuery,
          registrationCountsQuery,
        ]
      : []),
  ];

  const refreshDashboard = useCallback(async () => {
    if (!enabled) return;
    // The sidebar's Refresh action and session recovery invalidate the active
    // reads. Collections observe their own backing Query keys as usual.
    await invalidateAdmin(queryClient, [
      queryKeys.admin.registrations,
      ...(adminEnabled
        ? [
            queryKeys.admin.editionStats,
            queryKeys.admin.people,
            queryKeys.admin.tables,
            queryKeys.admin.venues,
            queryKeys.admin.rooms,
            queryKeys.admin.tableTypes,
            queryKeys.admin.layouts,
            queryKeys.admin.areas,
            queryKeys.admin.organizations,
          ]
        : []),
    ]);
  }, [enabled, adminEnabled, queryClient]);

  return {
    registrationsCollection,
    registrationCountsQuery,
    // Query objects (for error/loading state access)
    registrationsQuery,
    tablesQuery,
    tablesCollection,
    venuesQuery,
    roomsQuery,
    tableTypesQuery,
    layoutsQuery,
    organizationsQuery,
    organizationsCollection,
    areasQuery,
    venueCollections,
    peopleCountsQuery,
    // Derived booleans
    isAnyPending: allQueries.some((q) => q.isPending),
    isAnyFetching: allQueries.some((q) => q.isFetching),
    // Stable query key for section mutations
    registrationsQueryKey,
    refreshDashboard,
  };
}
