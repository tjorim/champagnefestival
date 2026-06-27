import { useMutation, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { FloorArea, FloorTable, TableType } from "@/types/admin";
import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { apiAreaToArea } from "@/utils/adminApiMappers";
import { devError } from "@/utils/devLog";
import { invalidateAdmin } from "@/utils/queryInvalidation";
import { m } from "@/paraglide/messages";

interface UseVenueMutationsOptions {
  queryClient: QueryClient;
  authHeaders: () => Record<string, string>;
  activeEditionId: string;
  tablesQueryKey: QueryKey;
  venuesQueryKey: QueryKey;
  roomsQueryKey: QueryKey;
  tableTypesQueryKey: QueryKey;
  layoutsQueryKey: QueryKey;
  areasQueryKey: QueryKey;
}

export function useVenueMutations({
  queryClient,
  authHeaders,
  activeEditionId,
  tablesQueryKey,
  venuesQueryKey,
  roomsQueryKey,
  tableTypesQueryKey,
  layoutsQueryKey,
  areasQueryKey,
}: UseVenueMutationsOptions) {
  const createTableMutation = useMutation({
    mutationFn: ({
      name,
      capacity,
      layoutId,
      tableTypeId,
      x,
      y,
      rotation,
    }: {
      name: string;
      capacity: number;
      layoutId: string;
      tableTypeId: string;
      x?: number;
      y?: number;
      rotation?: number;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/tables",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name,
            capacity,
            x: x ?? 10,
            y: y ?? 10,
            rotation: rotation ?? 0,
            layout_id: layoutId,
            table_type_id: tableTypeId,
          }),
        },
        m.admin_error_add_table(),
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [tablesQueryKey]);
    },
    retry: false,
  });

  const changeTableTypeMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; tableTypeId: string },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, tableTypeId }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ table_type_id: tableTypeId }),
        },
        m.admin_error_change_table_type_status({ status: 500 }),
      ),
    onMutate: ({ tableId, tableTypeId }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, tableTypeId } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables) queryClient.setQueryData(tablesQueryKey, context.previousTables);
    },
    onSettled: () => {
      void invalidateAdmin(queryClient, [tablesQueryKey]);
    },
    retry: false,
  });

  const updateTableNameMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; name: string },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, name }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ name }) },
        m.admin_error_update_table_name_status({ status: 500 }),
      ),
    onMutate: ({ tableId, name }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, name } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables) queryClient.setQueryData(tablesQueryKey, context.previousTables);
    },
    onSettled: () => {
      void invalidateAdmin(queryClient, [tablesQueryKey]);
    },
    retry: false,
  });

  const moveTableMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; x: number; y: number },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, x, y }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ x, y }) },
        m.admin_error_persist_table_position(),
      ),
    onMutate: ({ tableId, x, y }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, x, y } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables) queryClient.setQueryData(tablesQueryKey, context.previousTables);
      devError("Failed to persist table position");
    },
    onSettled: () => {
      void invalidateAdmin(queryClient, [tablesQueryKey]);
    },
    retry: false,
  });

  const rotateTableMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; rotation: number },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, rotation }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ rotation }) },
        m.admin_error_persist_table_rotation(),
      ),
    onMutate: ({ tableId, rotation }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, rotation } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables) queryClient.setQueryData(tablesQueryKey, context.previousTables);
      devError("Failed to persist table rotation");
    },
    onSettled: () => {
      void invalidateAdmin(queryClient, [tablesQueryKey]);
    },
    retry: false,
  });

  const deleteTableMutation = useMutation({
    mutationFn: (tableId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/tables/${tableId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_table(),
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [tablesQueryKey]);
    },
    retry: false,
  });

  const createVenueMutation = useMutation({
    mutationFn: ({
      name,
      address,
      city,
      postalCode,
      country,
    }: {
      name: string;
      address: string;
      city: string;
      postalCode: string;
      country: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/venues",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ name, address, city, postal_code: postalCode, country }),
        },
        m.admin_error_add_venue(),
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [venuesQueryKey]);
    },
    retry: false,
  });

  const updateVenueMutation = useMutation({
    mutationFn: ({ venueId, active }: { venueId: string; active: boolean }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/venues/${venueId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ active }) },
        active ? m.admin_error_restore_venue() : m.admin_error_archive_venue(),
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [venuesQueryKey]);
    },
    retry: false,
  });

  const deleteVenueMutation = useMutation({
    mutationFn: (venueId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/venues/${venueId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_venue(),
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [
        venuesQueryKey,
        roomsQueryKey,
        layoutsQueryKey,
        tablesQueryKey,
        areasQueryKey,
      ]);
    },
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
    onSettled: () => {
      void invalidateAdmin(queryClient, [roomsQueryKey]);
    },
    retry: false,
  });

  const updateRoomMutation = useMutation({
    mutationFn: ({
      roomId,
      active,
      fallbackMessage,
    }: {
      roomId: string;
      active: boolean;
      fallbackMessage: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/rooms/${roomId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ active }) },
        fallbackMessage,
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [roomsQueryKey]);
    },
    retry: false,
  });

  const createLayoutMutation = useMutation({
    mutationFn: ({ roomId, date, label }: { roomId: string; date: string; label?: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/layouts",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            edition_id: activeEditionId,
            room_id: roomId,
            date,
            ...(label?.trim() ? { label: label.trim() } : {}),
          }),
        },
        m.admin_error_add_layout(),
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [layoutsQueryKey]);
    },
    retry: false,
  });

  const deleteLayoutMutation = useMutation({
    mutationFn: (layoutId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/layouts/${layoutId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_layout(),
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [layoutsQueryKey, tablesQueryKey, areasQueryKey]);
    },
    retry: false,
  });

  const createAreaMutation = useMutation({
    mutationFn: ({
      label,
      icon,
      layoutId,
      widthM,
      lengthM,
      exhibitorId,
      x,
      y,
      rotation,
    }: {
      label: string;
      icon: string;
      layoutId: string;
      widthM: number;
      lengthM: number;
      exhibitorId?: number;
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
            exhibitor_id: exhibitorId ?? null,
          }),
        },
        m.admin_error_add_area(),
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [areasQueryKey]);
    },
    retry: false,
  });

  const updateAreaLabelMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; label: string },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, label }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ label }) },
        "Failed to persist area label.",
      ),
    onMutate: ({ areaId, label }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, label } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      devError("Failed to persist area label");
    },
    onSettled: () => {
      void invalidateAdmin(queryClient, [areasQueryKey]);
    },
    retry: false,
  });

  const resizeAreaMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; widthM: number; lengthM: number; x: number; y: number },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, widthM, lengthM, x, y }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ width_m: widthM, length_m: lengthM, x, y }),
        },
        m.admin_error_resize_area_status({ status: 500 }),
      ),
    onMutate: ({ areaId, widthM, lengthM, x, y }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, widthM, lengthM, x, y } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      devError("Failed to persist area resize");
    },
    onSettled: () => {
      void invalidateAdmin(queryClient, [areasQueryKey]);
    },
    retry: false,
  });

  const assignAreaMutation = useMutation({
    mutationFn: ({ areaId, body }: { areaId: string; body: Record<string, unknown> }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) },
        "Failed to assign area.",
      ),
    onSuccess: (
      d: Record<string, unknown>,
      { areaId }: { areaId: string; body: Record<string, unknown> },
    ) => {
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.map((a) => (a.id === areaId ? apiAreaToArea(d) : a)) : prev,
      );
    },
    onSettled: () => {
      void invalidateAdmin(queryClient, [areasQueryKey]);
    },
    retry: false,
  });

  const moveAreaMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; x: number; y: number },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, x, y }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ x, y }) },
        m.admin_error_persist_area_position(),
      ),
    onMutate: ({ areaId, x, y }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, x, y } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      devError("Failed to persist area position");
    },
    onSettled: () => {
      void invalidateAdmin(queryClient, [areasQueryKey]);
    },
    retry: false,
  });

  const rotateAreaMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; rotation: number },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, rotation }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ rotation }) },
        m.admin_error_persist_area_rotation(),
      ),
    onMutate: ({ areaId, rotation }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, rotation } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      devError("Failed to persist area rotation");
    },
    onSettled: () => {
      void invalidateAdmin(queryClient, [areasQueryKey]);
    },
    retry: false,
  });

  const deleteAreaMutation = useMutation({
    mutationFn: (areaId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/areas/${areaId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_area(),
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [areasQueryKey]);
    },
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
            shape: data.shape,
            width_m: data.widthM,
            length_m: data.lengthM,
            height_type: data.heightType,
            max_capacity: data.maxCapacity,
          }),
        },
        m.admin_error_add_table_type(),
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [tableTypesQueryKey]);
    },
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
            ...(data.shape !== undefined && { shape: data.shape }),
            ...(data.widthM !== undefined && { width_m: data.widthM }),
            ...(data.lengthM !== undefined && { length_m: data.lengthM }),
            ...(data.heightType !== undefined && { height_type: data.heightType }),
            ...(data.maxCapacity !== undefined && { max_capacity: data.maxCapacity }),
            ...(data.active !== undefined && { active: data.active }),
          }),
        },
        m.admin_error_update_table_type(),
      ),
    onSettled: () => {
      void invalidateAdmin(queryClient, [tableTypesQueryKey]);
    },
    retry: false,
  });

  return {
    createTableMutation,
    changeTableTypeMutation,
    updateTableNameMutation,
    moveTableMutation,
    rotateTableMutation,
    deleteTableMutation,
    createVenueMutation,
    updateVenueMutation,
    deleteVenueMutation,
    createRoomMutation,
    updateRoomMutation,
    createLayoutMutation,
    deleteLayoutMutation,
    createAreaMutation,
    updateAreaLabelMutation,
    resizeAreaMutation,
    assignAreaMutation,
    moveAreaMutation,
    rotateAreaMutation,
    deleteAreaMutation,
    createTableTypeMutation,
    updateTableTypeMutation,
  };
}
