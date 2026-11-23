import { useCallback } from "react";
import { m } from "@/paraglide/messages";
import type {
  AreaUpdate,
  FloorArea,
  FloorTableRecord,
  Layout,
  RoomUpdate,
  TableTypeCreate,
  TableTypeUpdate,
  VenueUpdate,
} from "@/api-types";
import { useVenueMutations } from "../venue/useVenueMutations";
import {
  addAdminTable,
  captureAdminTablesFence,
  refetchAdminTables,
  removeAdminTablesForLayouts,
  replaceAdminTablesForLayout,
  type AdminTablesCollection,
} from "@/lib/collections/adminTablesCollection";
import {
  applyAdminLayoutDeleted,
  applyAdminVenueDeleted,
  applyAdminVenueRowCreated,
  applyAdminVenueRowDeleted,
  applyAdminVenueRowUpdated,
  captureAdminVenueFence,
  refetchAdminVenueCollections,
  replaceAdminAreasForLayout,
  type AdminVenueCollections,
} from "../venue/adminVenueCollections";
import { fetchJsonOrThrow } from "@/lib/api/adminApi";
import { devError } from "@/lib/devLog";
import { getAreaSizePx, getCanvasSizePx } from "@/lib/venue/layoutUtils";
import { toTableRecord } from "@/lib/collections/tableOccupancy";

interface UseAdminVenueActionsOptions {
  tablesCollection: AdminTablesCollection;
  venueCollections: AdminVenueCollections;
}

/**
 * Venue, room, table type, layout and area actions. A create or update calls
 * the API and then writes the server's row into the matching collection; a
 * delete removes the row and its dependants. The fence is captured before each
 * request and checked before every write that follows it, so a response from an
 * earlier session never lands in the next one (see `adminVenueCollections.ts`).
 */
export function useAdminVenueActions({
  tablesCollection,
  venueCollections,
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
    restoreLayoutRevisionMutation,
    saveLayoutRevisionMutation,
    updateRoomMutation,
    updateTableTypeMutation,
    updateVenueMutation,
  } = useVenueMutations({ tablesCollection, venueCollections });
  const { areas, layouts, rooms, tableTypes, venues } = venueCollections;

  const handleAddTable = useCallback(
    async (name: string, layoutId: string, tableTypeId: string) => {
      await addAdminTable(tablesCollection, {
        name,
        layout_id: layoutId,
        table_type_id: tableTypeId,
      });
    },
    [tablesCollection],
  );

  // Optimistic update through the collection's write handler: the row changes
  // at once, rolls back if the PUT fails, and is reconciled by a refetch.
  const updateTableRow = useCallback(
    async (tableId: string, apply: (draft: FloorTableRecord) => void) => {
      await tablesCollection.update(tableId, apply).when("settled");
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
      // Optimistic through the collection's `onDelete` handler; rolls back if
      // the server refuses (for example a table that still holds bookings).
      await tablesCollection.delete(tableId).when("settled");
    },
    [tablesCollection],
  );

  const handleChangeTableType = useCallback(
    (tableId: string, tableTypeId: string) =>
      updateTableRow(tableId, (table) => {
        table.table_type_id = tableTypeId;
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
      lat: number | null,
      lng: number | null,
    ) => {
      const isCurrent = captureAdminVenueFence();
      const d = await createVenueMutation.mutateAsync({
        name,
        address,
        city,
        postalCode,
        country,
        lat,
        lng,
      });
      await applyAdminVenueRowCreated(venues, d, isCurrent);
    },
    [createVenueMutation, venues],
  );

  const handleUpdateVenue = useCallback(
    async (venueId: string, data: VenueUpdate) => {
      const isCurrent = captureAdminVenueFence();
      const d = await updateVenueMutation.mutateAsync({ venueId, ...data });
      await applyAdminVenueRowUpdated(venues, d, isCurrent);
    },
    [updateVenueMutation, venues],
  );

  const handleArchiveVenue = useCallback(
    async (venueId: string) => {
      const isCurrent = captureAdminVenueFence();
      const d = await updateVenueMutation.mutateAsync({ venueId, active: false });
      await applyAdminVenueRowUpdated(venues, d, isCurrent);
    },
    [updateVenueMutation, venues],
  );

  const handleRestoreVenue = useCallback(
    async (venueId: string) => {
      const isCurrent = captureAdminVenueFence();
      const d = await updateVenueMutation.mutateAsync({ venueId, active: true });
      await applyAdminVenueRowUpdated(venues, d, isCurrent);
    },
    [updateVenueMutation, venues],
  );

  const handleDeleteVenue = useCallback(
    async (venueId: string) => {
      const isCurrent = captureAdminVenueFence();
      const tablesFenceIsCurrent = captureAdminTablesFence();
      await deleteVenueMutation.mutateAsync(venueId);
      // Cascade: the venue's rooms, their layouts and the layouts' areas leave
      // the collections, and the layouts' tables leave the tables collection.
      const layoutIds = await applyAdminVenueDeleted(venueCollections, venueId, isCurrent);
      await removeAdminTablesForLayouts(tablesCollection, layoutIds, tablesFenceIsCurrent);
    },
    [deleteVenueMutation, tablesCollection, venueCollections],
  );

  const handleAddRoom = useCallback(
    async (venueId: string, name: string, widthM: number, lengthM: number, color: string) => {
      const isCurrent = captureAdminVenueFence();
      const data = await createRoomMutation.mutateAsync({ venueId, name, widthM, lengthM, color });
      await applyAdminVenueRowCreated(rooms, data, isCurrent);
    },
    [createRoomMutation, rooms],
  );

  const handleUpdateRoom = useCallback(
    async (roomId: string, data: RoomUpdate) => {
      const isCurrent = captureAdminVenueFence();
      const d = await updateRoomMutation.mutateAsync({ id: roomId, data });
      await applyAdminVenueRowUpdated(rooms, d, isCurrent);
    },
    [rooms, updateRoomMutation],
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
      const isCurrent = captureAdminVenueFence();
      await deleteRoomMutation.mutateAsync(roomId);
      await applyAdminVenueRowDeleted(rooms, roomId, isCurrent);
    },
    [deleteRoomMutation, rooms],
  );

  const handleAddLayout = useCallback(
    async (
      roomId: string,
      eventId: string,
      label?: string,
      copyFromLayoutId?: string | null,
      copyOptions?: { tables: boolean; areas: boolean },
    ) => {
      const isCurrent = captureAdminVenueFence();
      if (copyFromLayoutId) {
        const shouldCopyTables = copyOptions?.tables ?? true;
        const shouldCopyAreas = copyOptions?.areas ?? true;
        const copied = await fetchJsonOrThrow<Layout>(
          `/api/layouts/${copyFromLayoutId}/copy`,
          {
            method: "POST",

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
        await applyAdminVenueRowCreated(layouts, copied, isCurrent);
        // The copy also created areas and tables server-side, with fresh ids.
        await Promise.all([
          refetchAdminVenueCollections(venueCollections, ["layouts", "areas"], isCurrent),
          isCurrent() ? refetchAdminTables(tablesCollection) : undefined,
        ]);
        return;
      }

      const d = await createLayoutMutation.mutateAsync({ roomId, eventId, label });
      await applyAdminVenueRowCreated(layouts, d, isCurrent);
    },
    [createLayoutMutation, layouts, tablesCollection, venueCollections],
  );

  const handleDeleteLayout = useCallback(
    async (layoutId: string) => {
      const isCurrent = captureAdminVenueFence();
      const tablesFenceIsCurrent = captureAdminTablesFence();
      await deleteLayoutMutation.mutateAsync(layoutId);
      await applyAdminLayoutDeleted(venueCollections, layoutId, isCurrent);
      await removeAdminTablesForLayouts(tablesCollection, [layoutId], tablesFenceIsCurrent);
    },
    [deleteLayoutMutation, tablesCollection, venueCollections],
  );

  // Layout revisions (#1021): save takes an immutable geometry snapshot;
  // restore applies a saved snapshot back onto the layout's live tables/areas
  // (never touching registrations/organization assignments themselves — see
  // preview_layout_restore/restore_layout_revision on the backend).
  const handleSaveRevision = useCallback(
    (layoutId: string, label: string, changeNote?: string) =>
      saveLayoutRevisionMutation.mutateAsync({ layoutId, label, changeNote }),
    [saveLayoutRevisionMutation],
  );

  const handleRestoreRevision = useCallback(
    async (layoutId: string, revisionNumber: number, resolveAllocations?: boolean) => {
      const isCurrent = captureAdminVenueFence();
      const tablesFenceIsCurrent = captureAdminTablesFence();
      const data = await restoreLayoutRevisionMutation.mutateAsync({
        layoutId,
        revisionNumber,
        resolveAllocations,
      });
      const restoredTables = data.tables;
      const restoredAreas = data.areas;
      if (Array.isArray(restoredTables)) {
        await replaceAdminTablesForLayout(
          tablesCollection,
          layoutId,
          restoredTables.map(toTableRecord),
          tablesFenceIsCurrent,
        );
      }
      if (Array.isArray(restoredAreas)) {
        await replaceAdminAreasForLayout(areas, layoutId, restoredAreas, isCurrent);
      }
    },
    [areas, restoreLayoutRevisionMutation, tablesCollection],
  );

  const handleAddArea = useCallback(
    async (
      label: string,
      icon: string,
      layoutId: string,
      widthM: number,
      lengthM: number,
      organizationId?: number,
    ) => {
      const isCurrent = captureAdminVenueFence();
      const data = await createAreaMutation.mutateAsync({
        label,
        icon,
        layoutId,
        widthM,
        lengthM,
        organizationId,
      });
      await applyAdminVenueRowCreated(areas, data, isCurrent);
    },
    [areas, createAreaMutation],
  );

  // Canvas edits are optimistic through the areas collection's `onUpdate`
  // handler: the area follows the pointer at once, rolls back if the PUT fails
  // and is reconciled by a refetch.
  const updateAreaRow = useCallback(
    async (areaId: string, apply: (draft: FloorArea) => void) => {
      await areas.update(areaId, apply).when("settled");
    },
    [areas],
  );

  const handleMoveArea = useCallback(
    (areaId: string, x: number, y: number) => {
      updateAreaRow(areaId, (area) => {
        area.x = x;
        area.y = y;
      }).catch(() => devError("Failed to persist area position"));
    },
    [updateAreaRow],
  );

  const handleRotateArea = useCallback(
    (areaId: string, rotation: number) => {
      const normalized = ((rotation % 360) + 360) % 360;
      updateAreaRow(areaId, (area) => {
        area.rotation = normalized;
      }).catch(() => devError("Failed to persist area rotation"));
    },
    [updateAreaRow],
  );

  const handleDeleteArea = useCallback(
    async (areaId: string) => {
      const isCurrent = captureAdminVenueFence();
      await deleteAreaMutation.mutateAsync(areaId);
      await applyAdminVenueRowDeleted(areas, areaId, isCurrent);
    },
    [areas, deleteAreaMutation],
  );

  const handleAssignAreaToItem = useCallback(
    async (areaId: string, organizationId: number | null, label?: string, icon?: string) => {
      const body: AreaUpdate = { organization_id: organizationId };
      if (label !== undefined) body.label = label;
      if (icon !== undefined) body.icon = icon;
      const isCurrent = captureAdminVenueFence();
      const d = await assignAreaMutation.mutateAsync({ areaId, body });
      await applyAdminVenueRowUpdated(areas, d, isCurrent);
    },
    [areas, assignAreaMutation],
  );

  const handleUpdateAreaLabel = useCallback(
    (areaId: string, label: string) => {
      updateAreaRow(areaId, (area) => {
        area.label = label;
      }).catch(() => devError("Failed to persist area label"));
    },
    [updateAreaRow],
  );

  const handleResizeArea = useCallback(
    async (areaId: string, widthM: number, lengthM: number) => {
      const area = areas.get(areaId);
      const layout = area ? layouts.get(area.layout_id) : undefined;
      const room = layout ? rooms.get(layout.room_id) : undefined;

      // Clamp the area's position so it stays within the canvas after resize.
      let x = area?.x ?? 0;
      let y = area?.y ?? 0;
      if (area && room) {
        const { width: canvasW, height: canvasH } = getCanvasSizePx(room.width_m, room.length_m);
        const { width: areaW, height: areaH } = getAreaSizePx(widthM, lengthM);
        x = (Math.max(0, Math.min((area.x / 100) * canvasW, canvasW - areaW)) / canvasW) * 100;
        y = (Math.max(0, Math.min((area.y / 100) * canvasH, canvasH - areaH)) / canvasH) * 100;
      }

      await updateAreaRow(areaId, (draft) => {
        draft.width_m = widthM;
        draft.length_m = lengthM;
        draft.x = x;
        draft.y = y;
      });
    },
    [areas, layouts, rooms, updateAreaRow],
  );

  const handleAddTableType = useCallback(
    async (data: TableTypeCreate) => {
      const isCurrent = captureAdminVenueFence();
      const d = await createTableTypeMutation.mutateAsync(data);
      await applyAdminVenueRowCreated(tableTypes, d, isCurrent);
    },
    [createTableTypeMutation, tableTypes],
  );

  const handleUpdateTableType = useCallback(
    async (id: string, data: TableTypeUpdate) => {
      const isCurrent = captureAdminVenueFence();
      const d = await updateTableTypeMutation.mutateAsync({ id, data });
      await applyAdminVenueRowUpdated(tableTypes, d, isCurrent);
    },
    [tableTypes, updateTableTypeMutation],
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
      const isCurrent = captureAdminVenueFence();
      await deleteTableTypeMutation.mutateAsync(id);
      await applyAdminVenueRowDeleted(tableTypes, id, isCurrent);
    },
    [deleteTableTypeMutation, tableTypes],
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
