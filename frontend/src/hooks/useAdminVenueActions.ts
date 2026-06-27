import { useCallback } from "react";
import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import type { FloorArea, FloorTable, Layout, Room, TableType, Venue } from "@/types/admin";
import { useVenueMutations } from "@/hooks/useVenueMutations";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
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
  activeEditionId: string;
  areasQueryKey: QueryKey;
  authHeaders: () => Record<string, string>;
  layoutsQueryKey: QueryKey;
  queryClient: QueryClient;
  roomsQueryKey: QueryKey;
  tableTypesQueryKey: QueryKey;
  tablesQueryKey: QueryKey;
  venuesQueryKey: QueryKey;
}

export function useAdminVenueActions({
  activeEditionId,
  areasQueryKey,
  authHeaders,
  layoutsQueryKey,
  queryClient,
  roomsQueryKey,
  tableTypesQueryKey,
  tablesQueryKey,
  venuesQueryKey,
}: UseAdminVenueActionsOptions) {
  const {
    assignAreaMutation,
    changeTableTypeMutation,
    createAreaMutation,
    createLayoutMutation,
    createRoomMutation,
    createTableMutation,
    createTableTypeMutation,
    createVenueMutation,
    deleteAreaMutation,
    deleteLayoutMutation,
    deleteTableMutation,
    deleteVenueMutation,
    moveAreaMutation,
    moveTableMutation,
    resizeAreaMutation,
    rotateAreaMutation,
    rotateTableMutation,
    updateAreaLabelMutation,
    updateRoomMutation,
    updateTableNameMutation,
    updateTableTypeMutation,
    updateVenueMutation,
  } = useVenueMutations({
    queryClient,
    authHeaders,
    activeEditionId,
    tablesQueryKey,
    venuesQueryKey,
    roomsQueryKey,
    tableTypesQueryKey,
    layoutsQueryKey,
    areasQueryKey,
  });

  const handleAddTable = useCallback(
    async (name: string, capacity: number, layoutId: string, tableTypeId: string) => {
      const data = await createTableMutation.mutateAsync({ name, capacity, layoutId, tableTypeId });
      const table = (data.table ?? data) as Record<string, unknown>;
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? [...prev, apiTableToTable(table)] : [apiTableToTable(table)],
      );
    },
    [createTableMutation, queryClient, tablesQueryKey],
  );

  const handleMoveTable = useCallback(
    (tableId: string, x: number, y: number) => {
      moveTableMutation.mutate({ tableId, x, y });
    },
    [moveTableMutation],
  );

  const handleRotateTable = useCallback(
    (tableId: string, rotation: number) => {
      rotateTableMutation.mutate({ tableId, rotation: ((rotation % 360) + 360) % 360 });
    },
    [rotateTableMutation],
  );

  const handleDeleteTable = useCallback(
    async (tableId: string) => {
      await deleteTableMutation.mutateAsync(tableId);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? prev.filter((t) => t.id !== tableId) : prev,
      );
    },
    [deleteTableMutation, queryClient, tablesQueryKey],
  );

  const handleChangeTableType = useCallback(
    async (tableId: string, tableTypeId: string) => {
      await changeTableTypeMutation.mutateAsync({ tableId, tableTypeId });
    },
    [changeTableTypeMutation],
  );

  const handleUpdateTable = useCallback(
    async (tableId: string, name: string) => {
      await updateTableNameMutation.mutateAsync({ tableId, name });
    },
    [updateTableNameMutation],
  );

  const handleAddVenue = useCallback(
    async (name: string, address: string, city: string, postalCode: string, country: string) => {
      const d = await createVenueMutation.mutateAsync({ name, address, city, postalCode, country });
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? [...prev, apiVenueToVenue(d)] : [apiVenueToVenue(d)],
      );
    },
    [createVenueMutation, queryClient, venuesQueryKey],
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
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? prev.filter((t) => !venueLayoutIds.includes(t.layoutId)) : prev,
      );
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
      tablesQueryKey,
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

  const handleArchiveRoom = useCallback(
    async (roomId: string) => {
      const data = await updateRoomMutation.mutateAsync({
        roomId,
        active: false,
        fallbackMessage: m.admin_error_delete_room(),
      });
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)) : prev,
      );
    },
    [queryClient, roomsQueryKey, updateRoomMutation],
  );

  const handleRestoreRoom = useCallback(
    async (roomId: string) => {
      const data = await updateRoomMutation.mutateAsync({
        roomId,
        active: true,
        fallbackMessage: m.admin_content_error_save(),
      });
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)) : prev,
      );
    },
    [queryClient, roomsQueryKey, updateRoomMutation],
  );

  const handleAddLayout = useCallback(
    async (
      roomId: string,
      date: string,
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
              edition_id: activeEditionId,
              room_id: roomId,
              date,
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
        await invalidateAdmin(queryClient, [layoutsQueryKey, tablesQueryKey, areasQueryKey]);
        return;
      }

      const d = await createLayoutMutation.mutateAsync({ roomId, date, label });
      queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
        prev ? [...prev, apiLayoutToLayout(d)] : [apiLayoutToLayout(d)],
      );
    },
    [
      activeEditionId,
      areasQueryKey,
      authHeaders,
      createLayoutMutation,
      layoutsQueryKey,
      queryClient,
      tablesQueryKey,
    ],
  );

  const handleDeleteLayout = useCallback(
    async (layoutId: string) => {
      await deleteLayoutMutation.mutateAsync(layoutId);
      queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
        prev ? prev.filter((l) => l.id !== layoutId) : prev,
      );
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? prev.filter((t) => t.layoutId !== layoutId) : prev,
      );
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.filter((a) => a.layoutId !== layoutId) : prev,
      );
    },
    [areasQueryKey, deleteLayoutMutation, layoutsQueryKey, queryClient, tablesQueryKey],
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
      const area = queryClient.getQueryData<FloorArea[]>(areasQueryKey)?.find((a) => a.id === areaId);
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
    handleDeleteTable,
    handleDeleteVenue,
    handleMoveArea,
    handleMoveTable,
    handleResizeArea,
    handleRestoreRoom,
    handleRestoreTableType,
    handleRestoreVenue,
    handleRotateArea,
    handleRotateTable,
    handleUpdateAreaLabel,
    handleUpdateTable,
    handleUpdateTableType,
  };
}
