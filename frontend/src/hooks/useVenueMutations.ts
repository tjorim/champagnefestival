import { useMutation } from "@tanstack/react-query";
import type { Room, TableType } from "@/types/admin";
import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { refetchAdminTables, type AdminTablesCollection } from "@/state/adminTablesCollection";
import {
  captureAdminVenueFence,
  refetchAdminVenueCollections,
  type AdminVenueCollectionName,
  type AdminVenueCollections,
} from "@/state/adminVenueCollections";
import { saveLayoutRevision, restoreLayoutRevision } from "@/utils/adminFetch";
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
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
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
    mutationFn: ({
      venueId,
      postalCode,
      ...data
    }: {
      venueId: string;
      postalCode?: string;
      name?: string;
      address?: string;
      city?: string;
      country?: string;
      lat?: number;
      lng?: number;
      active?: boolean;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/venues/${venueId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            ...data,
            ...(postalCode === undefined ? {} : { postal_code: postalCode }),
          }),
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
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
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
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<Room, "id" | "dimensionsPlaceholder">>;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/rooms/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            ...(data.venueId !== undefined && { venue_id: data.venueId }),
            ...(data.name !== undefined && { name: data.name }),
            ...(data.widthM !== undefined && { width_m: data.widthM }),
            ...(data.lengthM !== undefined && { length_m: data.lengthM }),
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
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
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
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
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
    mutationFn: ({ areaId, body }: { areaId: string; body: Record<string, unknown> }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) },
        "Failed to assign area.",
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
    mutationFn: (data: Omit<TableType, "id">) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/table-types",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            venue_id: data.venueId,
            shape: data.shape,
            width_m: data.widthM,
            length_m: data.lengthM,
            height_type: data.heightType,
            capacity: data.capacity,
          }),
        },
        m.admin_error_add_table_type(),
      ),
    ...refetchAfter(["tableTypes"]),
    retry: false,
  });

  const updateTableTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<TableType, "id">> }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/table-types/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            ...(data.name !== undefined && { name: data.name }),
            ...(data.venueId !== undefined && { venue_id: data.venueId }),
            ...(data.shape !== undefined && { shape: data.shape }),
            ...(data.widthM !== undefined && { width_m: data.widthM }),
            ...(data.lengthM !== undefined && { length_m: data.lengthM }),
            ...(data.heightType !== undefined && { height_type: data.heightType }),
            ...(data.capacity !== undefined && { capacity: data.capacity }),
            ...(data.active !== undefined && { active: data.active }),
          }),
        },
        m.admin_error_update_table_type(),
      ),
    // A capacity change reaches the capacity of the tables of that type.
    ...refetchAfter<{ id: string; data: Partial<Omit<TableType, "id">> }>(
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
