import { useMutation } from "@tanstack/react-query";
import type {
  AreaOut,
  AreaUpdate,
  LayoutOut,
  RoomOut,
  RoomUpdate,
  TableTypeCreate,
  TableTypeOut,
  TableTypeUpdate,
  VenueOut,
  VenueUpdate,
} from "@/api-types";
import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/lib/api/adminApi";
import {
  refetchAdminTables,
  type AdminTablesCollection,
} from "@/lib/collections/adminTablesCollection";
import {
  captureAdminVenueFence,
  refetchAdminVenueCollections,
  type AdminVenueCollectionName,
  type AdminVenueCollections,
} from "@/features/admin/venue/adminVenueCollections";
import { saveLayoutRevision, restoreLayoutRevision } from "@/lib/api/adminFetch";
import { m } from "@/paraglide/messages";

interface UseVenueMutationsOptions {
  authHeaders: () => Record<string, string>;
  tablesCollection: AdminTablesCollection;
  venueCollections: AdminVenueCollections;
}

export function useVenueMutations({
  authHeaders,
  tablesCollection,
  venueCollections,
}: UseVenueMutationsOptions) {
  // Every write refetches the collections it touched once it settles (the
  // implicit refetch after a write is deprecated). The fence is taken when the
  // request starts, so a write that settles after sign-out or a collection
  // swap does not refetch into the next session. A table-type capacity change
  // reaches the tables, so `alsoTables` refetches that collection too.
  const refetchAfter = <TVariables>(
    names: readonly AdminVenueCollectionName[],
    alsoTables: boolean | ((variables: TVariables) => boolean) = false,
  ) => ({
    onMutate: () => captureAdminVenueFence(),
    onSettled: (
      _data: unknown,
      _error: unknown,
      variables: TVariables,
      isCurrent: (() => boolean) | undefined,
    ) => {
      const stillCurrent = isCurrent ?? (() => true);
      const refetchTables = typeof alsoTables === "function" ? alsoTables(variables) : alsoTables;
      void Promise.all([
        refetchAdminVenueCollections(venueCollections, names, stillCurrent),
        refetchTables && stillCurrent() ? refetchAdminTables(tablesCollection) : undefined,
      ]);
    },
  });

  const createVenueMutation = useMutation({
    mutationFn: ({
      name,
      address,
      city,
      postalCode,
      country,
      lat,
      lng,
    }: {
      name: string;
      address: string;
      city: string;
      postalCode: string;
      country: string;
      lat: number;
      lng: number;
    }) =>
      fetchJsonOrThrowWithUnauthorized<VenueOut>(
        "/api/venues",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ name, address, city, postal_code: postalCode, country, lat, lng }),
        },
        m.admin_error_add_venue(),
      ),
    ...refetchAfter(["venues"]),
    retry: false,
  });

  const updateVenueMutation = useMutation({
    mutationFn: ({ venueId, ...data }: { venueId: string } & VenueUpdate) =>
      fetchJsonOrThrowWithUnauthorized<VenueOut>(
        `/api/venues/${venueId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify(data),
        },
        data.active === true
          ? m.admin_error_restore_venue()
          : data.active === false
            ? m.admin_error_archive_venue()
            : m.admin_content_error_save(),
      ),
    ...refetchAfter(["venues"]),
    retry: false,
  });

  const deleteVenueMutation = useMutation({
    mutationFn: (venueId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/venues/${venueId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_venue(),
      ),
    ...refetchAfter(["venues", "rooms", "layouts", "areas"], true),
    retry: false,
  });

  const createRoomMutation = useMutation({
    mutationFn: ({
      venueId,
      name,
      widthM,
      lengthM,
      color,
    }: {
      venueId: string;
      name: string;
      widthM: number;
      lengthM: number;
      color: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<RoomOut>(
        "/api/rooms",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            venue_id: venueId,
            name,
            width_m: widthM,
            length_m: lengthM,
            color,
          }),
        },
        m.admin_error_add_room(),
      ),
    ...refetchAfter(["rooms"]),
    retry: false,
  });

  const updateRoomMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RoomUpdate }) =>
      fetchJsonOrThrowWithUnauthorized<RoomOut>(
        `/api/rooms/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            ...(data.venue_id !== undefined && { venue_id: data.venue_id }),
            ...(data.name !== undefined && { name: data.name }),
            ...(data.width_m !== undefined && { width_m: data.width_m }),
            ...(data.length_m !== undefined && { length_m: data.length_m }),
            ...(data.color !== undefined && { color: data.color }),
            ...(data.active !== undefined && { active: data.active }),
          }),
        },
        m.admin_error_update_room(),
      ),
    ...refetchAfter(["rooms"]),
    retry: false,
  });

  const deleteRoomMutation = useMutation({
    mutationFn: (roomId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/rooms/${roomId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_room(),
      ),
    ...refetchAfter(["rooms"]),
    retry: false,
  });

  const createLayoutMutation = useMutation({
    mutationFn: ({ roomId, eventId, label }: { roomId: string; eventId: string; label?: string }) =>
      fetchJsonOrThrowWithUnauthorized<LayoutOut>(
        "/api/layouts",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            room_id: roomId,
            event_id: eventId,
            ...(label?.trim() ? { label: label.trim() } : {}),
          }),
        },
        m.admin_error_add_layout(),
      ),
    ...refetchAfter(["layouts"]),
    retry: false,
  });

  const deleteLayoutMutation = useMutation({
    mutationFn: (layoutId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/layouts/${layoutId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_layout(),
      ),
    ...refetchAfter(["layouts", "areas"], true),
    retry: false,
  });

  // Layout revisions (#1021): save is geometry-only and doesn't touch the
  // live tables/areas, so it needs no invalidation. Restore does —
  // it applies the snapshot back onto the layout's tables/areas.
  const saveLayoutRevisionMutation = useMutation({
    mutationFn: ({
      layoutId,
      label,
      changeNote,
    }: {
      layoutId: string;
      label: string;
      changeNote?: string;
    }) => saveLayoutRevision(authHeaders, layoutId, label, changeNote),
    retry: false,
  });

  const restoreLayoutRevisionMutation = useMutation({
    mutationFn: ({
      layoutId,
      revisionNumber,
      resolveAllocations,
    }: {
      layoutId: string;
      revisionNumber: number;
      resolveAllocations?: boolean;
    }) => restoreLayoutRevision(authHeaders, layoutId, revisionNumber, resolveAllocations),
    ...refetchAfter(["layouts", "areas"], true),
    retry: false,
  });

  const createAreaMutation = useMutation({
    mutationFn: ({
      label,
      icon,
      layoutId,
      widthM,
      lengthM,
      organizationId,
      x,
      y,
      rotation,
    }: {
      label: string;
      icon: string;
      layoutId: string;
      widthM: number;
      lengthM: number;
      organizationId?: number;
      x?: number;
      y?: number;
      rotation?: number;
    }) =>
      fetchJsonOrThrowWithUnauthorized<AreaOut>(
        "/api/areas",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            label,
            icon,
            layout_id: layoutId,
            width_m: widthM,
            length_m: lengthM,
            x: x ?? 10,
            y: y ?? 10,
            rotation: rotation ?? 0,
            organization_id: organizationId ?? null,
          }),
        },
        m.admin_error_add_area(),
      ),
    ...refetchAfter(["areas"]),
    retry: false,
  });

  const assignAreaMutation = useMutation({
    mutationFn: ({ areaId, body }: { areaId: string; body: AreaUpdate }) =>
      fetchJsonOrThrowWithUnauthorized<AreaOut>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) },
        m.admin_error_assign_area(),
      ),
    ...refetchAfter(["areas"]),
    retry: false,
  });

  const deleteAreaMutation = useMutation({
    mutationFn: (areaId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/areas/${areaId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_area(),
      ),
    ...refetchAfter(["areas"]),
    retry: false,
  });

  const createTableTypeMutation = useMutation({
    mutationFn: (data: TableTypeCreate) =>
      fetchJsonOrThrowWithUnauthorized<TableTypeOut>(
        "/api/table-types",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            venue_id: data.venue_id,
            shape: data.shape,
            width_m: data.width_m,
            length_m: data.length_m,
            height_type: data.height_type,
            capacity: data.capacity,
          }),
        },
        m.admin_error_add_table_type(),
      ),
    ...refetchAfter(["tableTypes"]),
    retry: false,
  });

  const updateTableTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TableTypeUpdate }) =>
      fetchJsonOrThrowWithUnauthorized<TableTypeOut>(
        `/api/table-types/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            ...(data.name !== undefined && { name: data.name }),
            ...(data.venue_id !== undefined && { venue_id: data.venue_id }),
            ...(data.shape !== undefined && { shape: data.shape }),
            ...(data.width_m !== undefined && { width_m: data.width_m }),
            ...(data.length_m !== undefined && { length_m: data.length_m }),
            ...(data.height_type !== undefined && { height_type: data.height_type }),
            ...(data.capacity !== undefined && { capacity: data.capacity }),
            ...(data.active !== undefined && { active: data.active }),
          }),
        },
        m.admin_error_update_table_type(),
      ),
    // A capacity change reaches the capacity of the tables of that type.
    ...refetchAfter<{ id: string; data: TableTypeUpdate }>(
      ["tableTypes"],
      ({ data }) => data.capacity !== undefined,
    ),
    retry: false,
  });

  const deleteTableTypeMutation = useMutation({
    mutationFn: (typeId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/table-types/${typeId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_table_type(),
      ),
    ...refetchAfter(["tableTypes"]),
    retry: false,
  });

  return {
    createVenueMutation,
    updateVenueMutation,
    deleteVenueMutation,
    createRoomMutation,
    deleteRoomMutation,
    updateRoomMutation,
    createLayoutMutation,
    deleteLayoutMutation,
    saveLayoutRevisionMutation,
    restoreLayoutRevisionMutation,
    createAreaMutation,
    assignAreaMutation,
    deleteAreaMutation,
    createTableTypeMutation,
    updateTableTypeMutation,
    deleteTableTypeMutation,
  };
}
