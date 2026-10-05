import { useCallback } from "react";
import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import type { FloorArea, FloorTableRecord, Layout, Room, TableType, Venue } from "@/types/admin";
import { useVenueMutations } from "@/hooks/useVenueMutations";
import {
  addAdminTable,
  captureAdminTablesFence,
  deleteAdminTable,
  refetchAdminTables,
  removeAdminTablesForLayouts,
  replaceAdminTablesForLayout,
  type AdminTablesCollection,
} from "@/state/adminTablesCollection";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { devError } from "@/utils/devLog";
import { invalidateAdmin } from "@/utils/queryInvalidation";
import { getAreaSizePx, getCanvasSizePx } from "@/utils/layoutUtils";
import {
  apiAreaToArea,
  apiLayoutToLayout,
  apiRoomToRoom,
  apiTableToTable,
  apiTableTypeToTableType,
  apiVenueToVenue,
} from "@/utils/adminApiMappers";

interface UseAdminVenueActionsOptions {
  areasQueryKey: QueryKey;
  authHeaders: () => Record<string, string>;
  layoutsQueryKey: QueryKey;
  queryClient: QueryClient;
  roomsQueryKey: QueryKey;
  tableTypesQueryKey: QueryKey;
  tablesCollection: AdminTablesCollection;
  venuesQueryKey: QueryKey;
}

export function useAdminVenueActions({
  areasQueryKey,
  authHeaders,
  layoutsQueryKey,
  queryClient,
  roomsQueryKey,
  tableTypesQueryKey,
  tablesCollection,
  venuesQueryKey,
}: UseAdminVenueActionsOptions) {
  const {
    assignAreaMutation,
    createAreaMutation,
    createLayoutMutation,
    createRoomMutation,
    deleteRoomMutation,
    createTableTypeMutation,
    createVenueMutation,
    deleteAreaMutation,
    deleteLayoutMutation,
    deleteTableTypeMutation,
    deleteVenueMutation,
    moveAreaMutation,
    resizeAreaMutation,
    restoreLayoutRevisionMutation,
    rotateAreaMutation,
    saveLayoutRevisionMutation,
    updateAreaLabelMutation,
    updateRoomMutation,
    updateTableTypeMutation,
    updateVenueMutation,
  } = useVenueMutations({
    queryClient,
    authHeaders,
    tablesCollection,
    venuesQueryKey,
    roomsQueryKey,
    tableTypesQueryKey,
    layoutsQueryKey,
    areasQueryKey,
  });

  const handleAddTable = useCallback(
    async (name: string, layoutId: string, tableTypeId: string) => {
      await addAdminTable(tablesCollection, authHeaders, { name, layoutId, tableTypeId });
    },
    [authHeaders, tablesCollection],
  );

  // Optimistic update through the collection's write handler: the row changes
  // at once, rolls back if the PUT fails, and is reconciled by a refetch.
  const updateTableRow = useCallback(
    async (tableId: string, apply: (draft: FloorTableRecord) => void) => {
      await tablesCollection.update(tableId, apply).isPersisted.promise;
    },
    [tablesCollection],
  );

  const handleMoveTable = useCallback(
    (tableId: string, x: number, y: number) => {
      updateTableRow(tableId, (table) => {
        table.x = x;
        table.y = y;
      }).catch(() => devError("Failed to persist table position"));
    },
    [updateTableRow],
  );

  const handleRotateTable = useCallback(
    (tableId: string, rotation: number) => {
      const normalized = ((rotation % 360) + 360) % 360;
      updateTableRow(tableId, (table) => {
        table.rotation = normalized;
      }).catch(() => devError("Failed to persist table rotation"));
    },
    [updateTableRow],
  );

  const handleDeleteTable = useCallback(
    async (tableId: string) => {
      await deleteAdminTable(tablesCollection, authHeaders, tableId);
    },
    [authHeaders, tablesCollection],
  );

  const handleChangeTableType = useCallback(
    (tableId: string, tableTypeId: string) =>
      updateTableRow(tableId, (table) => {
        table.tableTypeId = tableTypeId;
      }),
    [updateTableRow],
  );

  const handleUpdateTable = useCallback(
    (tableId: string, name: string) =>
      updateTableRow(tableId, (table) => {
        table.name = name;
      }),
    [updateTableRow],
  );

  const handleAddVenue = useCallback(
    async (
      name: string,
      address: string,
      city: string,
      postalCode: string,
      country: string,
      lat: number,
      lng: number,
    ) => {
      const d = await createVenueMutation.mutateAsync({
        name,
        address,
        city,
        postalCode,
        country,
        lat,
        lng,
      });
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? [...prev, apiVenueToVenue(d)] : [apiVenueToVenue(d)],
      );
    },
    [createVenueMutation, queryClient, venuesQueryKey],
  );

  const handleUpdateVenue = useCallback(
    async (venueId: string, data: Partial<Omit<Venue, "id" | "active">>) => {
      const d = await updateVenueMutation.mutateAsync({ venueId, ...data });
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? prev.map((venue) => (venue.id === venueId ? apiVenueToVenue(d) : venue)) : prev,
      );
    },
    [queryClient, updateVenueMutation, venuesQueryKey],
  );

  const handleArchiveVenue = useCallback(
    async (venueId: string) => {
      const d = await updateVenueMutation.mutateAsync({ venueId, active: false });
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)) : prev,
      );
    },
    [queryClient, updateVenueMutation, venuesQueryKey],
  );

  const handleRestoreVenue = useCallback(
    async (venueId: string) => {
      const d = await updateVenueMutation.mutateAsync({ venueId, active: true });
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)) : prev,
      );
    },
    [queryClient, updateVenueMutation, venuesQueryKey],
  );

  const handleDeleteVenue = useCallback(
    async (venueId: string) => {
      const tablesFenceIsCurrent = captureAdminTablesFence();
      await deleteVenueMutation.mutateAsync(venueId);
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? prev.filter((v) => v.id !== venueId) : prev,
      );
      // Cascade: remove rooms and their layouts/tables/areas from local state
      const allRooms = queryClient.getQueryData<Room[]>(roomsQueryKey) ?? [];
      const venueRoomIds = allRooms.filter((r) => r.venueId === venueId).map((r) => r.id);
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.filter((r) => r.venueId !== venueId) : prev,
      );
      const allLayouts = queryClient.getQueryData<Layout[]>(layoutsQueryKey) ?? [];
      const venueLayoutIds = allLayouts
        .filter((l) => venueRoomIds.includes(l.roomId ?? ""))
        .map((l) => l.id);
      queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
        prev ? prev.filter((l) => !venueRoomIds.includes(l.roomId ?? "")) : prev,
      );
      await removeAdminTablesForLayouts(tablesCollection, venueLayoutIds, tablesFenceIsCurrent);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.filter((a) => !venueLayoutIds.includes(a.layoutId)) : prev,
      );
    },
    [
      areasQueryKey,
      deleteVenueMutation,
      layoutsQueryKey,
      queryClient,
      roomsQueryKey,
      tablesCollection,
      venuesQueryKey,
    ],
  );

  const handleAddRoom = useCallback(
    async (venueId: string, name: string, widthM: number, lengthM: number, color: string) => {
      const data = await createRoomMutation.mutateAsync({ venueId, name, widthM, lengthM, color });
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? [...prev, apiRoomToRoom(data)] : [apiRoomToRoom(data)],
      );
    },
    [createRoomMutation, queryClient, roomsQueryKey],
  );

  const handleUpdateRoom = useCallback(
    async (roomId: string, data: Partial<Omit<Room, "id" | "dimensionsPlaceholder">>) => {
      const d = await updateRoomMutation.mutateAsync({ id: roomId, data });
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.map((r) => (r.id === roomId ? apiRoomToRoom(d) : r)) : prev,
      );
    },
    [queryClient, roomsQueryKey, updateRoomMutation],
  );

  const handleArchiveRoom = useCallback(
    (roomId: string) => handleUpdateRoom(roomId, { active: false }),
    [handleUpdateRoom],
  );

  const handleRestoreRoom = useCallback(
    (roomId: string) => handleUpdateRoom(roomId, { active: true }),
    [handleUpdateRoom],
  );

  const handleDeleteRoom = useCallback(
    async (roomId: string) => {
      await deleteRoomMutation.mutateAsync(roomId);
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.filter((room) => room.id !== roomId) : prev,
      );
    },
    [deleteRoomMutation, queryClient, roomsQueryKey],
  );

  const handleAddLayout = useCallback(
    async (
      roomId: string,
      eventId: string,
      label?: string,
      copyFromLayoutId?: string | null,
      copyOptions?: { tables: boolean; areas: boolean },
    ) => {
      if (copyFromLayoutId) {
        const shouldCopyTables = copyOptions?.tables ?? true;
        const shouldCopyAreas = copyOptions?.areas ?? true;
        const copied = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
          `/api/layouts/${copyFromLayoutId}/copy`,
          {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              room_id: roomId,
              event_id: eventId,
              ...(label?.trim() ? { label: label.trim() } : {}),
              copy_tables: shouldCopyTables,
              copy_areas: shouldCopyAreas,
            }),
          },
          m.admin_error_add_layout(),
        );
        const createdLayout = apiLayoutToLayout(copied);
        queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
          prev ? [...prev, createdLayout] : [createdLayout],
        );
        await Promise.all([
          invalidateAdmin(queryClient, [layoutsQueryKey, areasQueryKey]),
          refetchAdminTables(tablesCollection),
        ]);
        return;
      }

      const d = await createLayoutMutation.mutateAsync({ roomId, eventId, label });
      queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
        prev ? [...prev, apiLayoutToLayout(d)] : [apiLayoutToLayout(d)],
      );
    },
    [
      areasQueryKey,
      authHeaders,
      createLayoutMutation,
      layoutsQueryKey,
      queryClient,
      tablesCollection,
    ],
  );

  const handleDeleteLayout = useCallback(
    async (layoutId: string) => {
      const tablesFenceIsCurrent = captureAdminTablesFence();
      await deleteLayoutMutation.mutateAsync(layoutId);
      queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
        prev ? prev.filter((l) => l.id !== layoutId) : prev,
      );
      await removeAdminTablesForLayouts(tablesCollection, [layoutId], tablesFenceIsCurrent);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.filter((a) => a.layoutId !== layoutId) : prev,
      );
    },
    [areasQueryKey, deleteLayoutMutation, layoutsQueryKey, queryClient, tablesCollection],
  );

  // Layout revisions (#1021): save takes an immutable geometry snapshot;
  // restore applies a saved snapshot back onto the layout's live tables/areas
  // (never touching registrations/exhibitor assignments themselves — see
  // preview_layout_restore/restore_layout_revision on the backend).
  const handleSaveRevision = useCallback(
    (layoutId: string, label: string, changeNote?: string) =>
      saveLayoutRevisionMutation.mutateAsync({ layoutId, label, changeNote }),
    [saveLayoutRevisionMutation],
  );

  const handleRestoreRevision = useCallback(
    async (layoutId: string, revisionNumber: number, resolveAllocations?: boolean) => {
      const tablesFenceIsCurrent = captureAdminTablesFence();
      const data = await restoreLayoutRevisionMutation.mutateAsync({
        layoutId,
        revisionNumber,
        resolveAllocations,
      });
      const restoredTables = data.tables as Record<string, unknown>[] | undefined;
      const restoredAreas = data.areas as Record<string, unknown>[] | undefined;
      if (Array.isArray(restoredTables)) {
        await replaceAdminTablesForLayout(
          tablesCollection,
          layoutId,
          restoredTables.map(apiTableToTable),
          tablesFenceIsCurrent,
        );
      }
      if (Array.isArray(restoredAreas)) {
        const mapped = restoredAreas.map(apiAreaToArea);
        queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) => [
          ...(prev ?? []).filter((a) => a.layoutId !== layoutId),
          ...mapped,
        ]);
      }
    },
    [areasQueryKey, queryClient, restoreLayoutRevisionMutation, tablesCollection],
  );

  const handleAddArea = useCallback(
    async (
      label: string,
      icon: string,
      layoutId: string,
      widthM: number,
      lengthM: number,
      exhibitorId?: number,
    ) => {
      const data = await createAreaMutation.mutateAsync({
        label,
        icon,
        layoutId,
        widthM,
        lengthM,
        exhibitorId,
      });
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? [...prev, apiAreaToArea(data)] : [apiAreaToArea(data)],
      );
    },
    [areasQueryKey, createAreaMutation, queryClient],
  );

  const handleMoveArea = useCallback(
    (areaId: string, x: number, y: number) => {
      moveAreaMutation.mutate({ areaId, x, y });
    },
    [moveAreaMutation],
  );

  const handleRotateArea = useCallback(
    (areaId: string, rotation: number) => {
      rotateAreaMutation.mutate({ areaId, rotation: ((rotation % 360) + 360) % 360 });
    },
    [rotateAreaMutation],
  );

  const handleDeleteArea = useCallback(
    async (areaId: string) => {
      await deleteAreaMutation.mutateAsync(areaId);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.filter((a) => a.id !== areaId) : prev,
      );
    },
    [areasQueryKey, deleteAreaMutation, queryClient],
  );

  const handleAssignAreaToItem = useCallback(
    async (areaId: string, exhibitorId: number | null, label?: string, icon?: string) => {
      const body: Record<string, unknown> = { exhibitor_id: exhibitorId };
      if (label !== undefined) body.label = label;
      if (icon !== undefined) body.icon = icon;
      await assignAreaMutation.mutateAsync({ areaId, body });
    },
    [assignAreaMutation],
  );

  const handleUpdateAreaLabel = useCallback(
    (areaId: string, label: string) => {
      updateAreaLabelMutation.mutate({ areaId, label });
    },
    [updateAreaLabelMutation],
  );

  const handleResizeArea = useCallback(
    async (areaId: string, widthM: number, lengthM: number) => {
      const area = queryClient
        .getQueryData<FloorArea[]>(areasQueryKey)
        ?.find((a) => a.id === areaId);
      const layout = queryClient
        .getQueryData<Layout[]>(layoutsQueryKey)
        ?.find((l) => l.id === area?.layoutId);
      const room = queryClient
        .getQueryData<Room[]>(roomsQueryKey)
        ?.find((r) => r.id === layout?.roomId);

      // Clamp the area's position so it stays within the canvas after resize.
      let x = area?.x ?? 0;
      let y = area?.y ?? 0;
      if (area && room) {
        const { width: canvasW, height: canvasH } = getCanvasSizePx(room.widthM, room.lengthM);
        const { width: areaW, height: areaH } = getAreaSizePx(widthM, lengthM);
        x = (Math.max(0, Math.min((area.x / 100) * canvasW, canvasW - areaW)) / canvasW) * 100;
        y = (Math.max(0, Math.min((area.y / 100) * canvasH, canvasH - areaH)) / canvasH) * 100;
      }

      await resizeAreaMutation.mutateAsync({ areaId, widthM, lengthM, x, y });
    },
    [areasQueryKey, layoutsQueryKey, queryClient, resizeAreaMutation, roomsQueryKey],
  );

  const handleAddTableType = useCallback(
    async (data: Omit<TableType, "id">) => {
      const d = await createTableTypeMutation.mutateAsync(data);
      queryClient.setQueryData<TableType[]>(tableTypesQueryKey, (prev) =>
        prev ? [...prev, apiTableTypeToTableType(d)] : [apiTableTypeToTableType(d)],
      );
    },
    [createTableTypeMutation, queryClient, tableTypesQueryKey],
  );

  const handleUpdateTableType = useCallback(
    async (id: string, data: Partial<Omit<TableType, "id">>) => {
      const d = await updateTableTypeMutation.mutateAsync({ id, data });
      queryClient.setQueryData<TableType[]>(tableTypesQueryKey, (prev) =>
        prev ? prev.map((tt) => (tt.id === id ? apiTableTypeToTableType(d) : tt)) : prev,
      );
    },
    [queryClient, tableTypesQueryKey, updateTableTypeMutation],
  );

  const handleArchiveTableType = useCallback(
    (id: string) => handleUpdateTableType(id, { active: false }),
    [handleUpdateTableType],
  );

  const handleRestoreTableType = useCallback(
    (id: string) => handleUpdateTableType(id, { active: true }),
    [handleUpdateTableType],
  );

  const handleDeleteTableType = useCallback(
    async (id: string) => {
      await deleteTableTypeMutation.mutateAsync(id);
      queryClient.setQueryData<TableType[]>(tableTypesQueryKey, (prev) =>
        prev ? prev.filter((tt) => tt.id !== id) : prev,
      );
    },
    [deleteTableTypeMutation, queryClient, tableTypesQueryKey],
  );

  return {
    handleAddArea,
    handleAddLayout,
    handleAddRoom,
    handleAddTable,
    handleAddTableType,
    handleAddVenue,
    handleArchiveRoom,
    handleArchiveTableType,
    handleArchiveVenue,
    handleAssignAreaToItem,
    handleChangeTableType,
    handleDeleteArea,
    handleDeleteLayout,
    handleDeleteRoom,
    handleDeleteTable,
    handleDeleteTableType,
    handleDeleteVenue,
    handleMoveArea,
    handleMoveTable,
    handleResizeArea,
    handleRestoreRevision,
    handleRestoreRoom,
    handleRestoreTableType,
    handleRestoreVenue,
    handleRotateArea,
    handleRotateTable,
    handleSaveRevision,
    handleUpdateAreaLabel,
    handleUpdateRoom,
    handleUpdateTable,
    handleUpdateTableType,
    handleUpdateVenue,
  };
}
