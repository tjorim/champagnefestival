import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { m } from "@/paraglide/messages";
import "./admin.css";
import RegistrationList from "./RegistrationList";
import RegistrationDetail from "./RegistrationDetail";
import LayoutEditor from "./LayoutEditor";
import TableTypeManagement from "./TableTypeManagement";
import VenueManagement from "./VenueManagement";
import { ContentSection, EditionsSection } from "./ContentManagement";
import type { ItemDraft } from "./itemTypes";
import PeopleManagement from "./PeopleManagement";
import MembersManagement from "./MembersManagement";
import VolunteersManagement from "./VolunteersManagement";
import AdminSidebar from "./AdminSidebar";
import AdminLoginForm from "./AdminLoginForm";
import type {
  Registration,
  RegistrationStatus,
} from "@/types/registration";
import type { Room, FloorTable, FloorArea, TableType, Layout, Venue } from "@/types/admin";
import { activeEditionQueryKey, useActiveEdition } from "@/hooks/useActiveEdition";
import { useAdminDashboardData } from "@/hooks/useAdminDashboardData";
import { useAdminPeopleActions } from "@/hooks/useAdminPeopleActions";
import { useAdminQueries } from "@/hooks/useAdminQueries";
import { useAdminRegistrationActions } from "@/hooks/useAdminRegistrationActions";
import { useVenueMutations } from "@/hooks/useVenueMutations";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import { invalidateAdmin } from "@/utils/queryInvalidation";
import { getAreaSizePx, getCanvasSizePx } from "@/utils/layoutUtils";
import { devError } from "@/utils/devLog";
import {
  apiVenueToVenue,
  apiLayoutToLayout,
  apiTableTypeToTableType,
  apiRoomToRoom,
  apiTableToTable,
  apiAreaToArea,
} from "@/utils/adminApiMappers";
import Card from "react-bootstrap/Card";

function activeEditionLabel(year: number): string {
  return `${m.festival_name()} ${year}`;
}

interface AdminDashboardProps {
  visible: boolean;
}

export default function AdminDashboard({ visible }: AdminDashboardProps) {
  const { edition: activeEdition } = useActiveEdition();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const navRef = useRef<HTMLElement>(null);

  const isAuthenticated = auth.isAuthenticated;
  const [globalError, setGlobalError] = useState("");
  const [registrationError, setRegistrationError] = useState("");
  const [filter, setFilter] = useState<"all" | RegistrationStatus>("all");
  const [applyActiveEditionFilterRequest, setApplyActiveEditionFilterRequest] = useState(0);
  /** Full registration (with checkInToken) shown in the detail modal */
  const [detailRegistration, setDetailRegistration] = useState<Registration | null>(null);

  // Sidebar navigation state
  const [activeKey, setActiveKey] = useState("registrations");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(["events", "content", "venue", "people"]),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleGroup = useCallback((group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const authHeaders = useCallback(
    (): Record<string, string> => ({
      "Content-Type": "application/json",
      ...(auth.getAccessToken() ? { Authorization: `Bearer ${auth.getAccessToken()}` } : {}),
    }),
    [auth],
  );

  const {
    registrationsQuery,
    tablesQuery,
    venuesQuery,
    roomsQuery,
    tableTypesQuery,
    layoutsQuery,
    exhibitorsQuery,
    areasQuery,
    peopleQuery,
    membersQuery,
    isAnyPending,
    isAnyFetching,
    registrationsQueryKey,
    tablesQueryKey,
    venuesQueryKey,
    roomsQueryKey,
    tableTypesQueryKey,
    layoutsQueryKey,
    exhibitorsQueryKey,
    areasQueryKey,
    peopleQueryKey,
    membersQueryKey,
    loadData: loadDataBase,
  } = useAdminQueries({
    visible,
    isAuthenticated,
    authHeaders,
  });

  const loadData = useCallback(async () => {
    setGlobalError("");
    await loadDataBase();
  }, [loadDataBase]);

  const registrations = useMemo(() => registrationsQuery.data ?? [], [registrationsQuery.data]);
  const tables = tablesQuery.data ?? [];
  const venues = venuesQuery.data ?? [];
  const rooms = roomsQuery.data ?? [];
  const tableTypes = tableTypesQuery.data ?? [];
  const layouts = layoutsQuery.data ?? [];
  const exhibitors = exhibitorsQuery.data ?? [];
  const areas = areasQuery.data ?? [];
  const people = peopleQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const {
    activeDayIndex,
    activeEditionDateKeys,
    activeEditionStats,
    emailDuplicates,
    isActiveEditionDay,
    layoutDayOptions,
    registrationCountByPersonId,
    volunteers,
  } = useAdminDashboardData({
    activeEdition,
    detailRegistration,
    people,
    registrations,
  });

  const {
    handleCreateMember,
    handleCreatePerson,
    handleCreateVolunteer,
    handleDeleteMember,
    handleDeletePerson,
    handleDeleteVolunteer,
    handleMergePeople,
    handleUpdateMember,
    handleUpdatePerson,
    handleUpdateVolunteer,
  } = useAdminPeopleActions({
    authHeaders,
    exhibitorsQueryKey,
    membersQueryKey,
    people,
    peopleQueryKey,
    queryClient,
    registrationsQueryKey,
    setDetailRegistration,
  });

  const {
    handleAddRegistration,
    handleAssignTable,
    handleCheckIn,
    handleIssueStrap,
    handleToggleDelivered,
    handleUpdatePayment,
    handleUpdateStatus,
    handleViewDetail,
  } = useAdminRegistrationActions({
    authHeaders,
    queryClient,
    registrationsQueryKey,
    tablesQueryKey,
    setDetailRegistration,
    setRegistrationError,
  });

  const {
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
  } = useVenueMutations({
    queryClient,
    authHeaders,
    activeEditionId: activeEdition.id,
    tablesQueryKey,
    venuesQueryKey,
    roomsQueryKey,
    tableTypesQueryKey,
    layoutsQueryKey,
    areasQueryKey,
  });

  const handleLogout = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] === "admin",
    });
    setDetailRegistration(null);
    auth.logout();
  }, [auth, queryClient]);

  const handleExhibitorSaved = useCallback(
    (item: ItemDraft) => {
      queryClient.setQueryData<
        { id: number; name: string; active: boolean; contactPersonId: string | null }[]
      >(exhibitorsQueryKey, (prev) => {
        const entry = {
          id: item.id,
          name: item.name,
          active: item.active ?? true,
          contactPersonId: item.contactPersonId ?? null,
        };
        if (!prev) return prev;
        const idx = prev.findIndex((e) => e.id === item.id);
        if (idx >= 0) {
          return prev.map((e) => (e.id === item.id ? entry : e));
        }
        return [...prev, entry];
      });
    },
    [exhibitorsQueryKey, queryClient],
  );

  const handleExhibitorDeleted = useCallback(
    (id: number) => {
      queryClient.setQueryData<
        { id: number; name: string; active: boolean; contactPersonId: string | null }[]
      >(exhibitorsQueryKey, (prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
    },
    [exhibitorsQueryKey, queryClient],
  );

  useEffect(() => {
    const errors = [
      registrationsQuery.error,
      tablesQuery.error,
      venuesQuery.error,
      roomsQuery.error,
      tableTypesQuery.error,
      layoutsQuery.error,
      exhibitorsQuery.error,
      areasQuery.error,
      peopleQuery.error,
      membersQuery.error,
    ];

    const unauthorizedError = errors.find(
      (e) => e instanceof Error && e.message === "unauthorized",
    );
    if (unauthorizedError) {
      handleLogout();
      return;
    }

    const firstError = errors.find((e) => e !== null);
    if (firstError) {
      devError("Failed to load dashboard data", firstError);
      setGlobalError(m.admin_error_load_data());
    } else {
      // All queries succeeded or are still loading — clear any previous error.
      setGlobalError("");
    }
  }, [
    registrationsQuery.error,
    tablesQuery.error,
    venuesQuery.error,
    roomsQuery.error,
    tableTypesQuery.error,
    layoutsQuery.error,
    exhibitorsQuery.error,
    areasQuery.error,
    peopleQuery.error,
    membersQuery.error,
    handleLogout,
  ]);

  const handleNavKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (!navRef.current) return;
    const buttons = Array.from(
      navRef.current.querySelectorAll<HTMLButtonElement>(
        "button.admin-nav-item, button.admin-nav-group-header",
      ),
    );
    const focused = document.activeElement;
    const idx = buttons.indexOf(focused as HTMLButtonElement);
    if (idx === -1) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      buttons[(idx + 1) % buttons.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  }, []);

  // Close mobile sidebar on Escape key
  useEffect(() => {
    if (!sidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

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
      // Cascade: remove rooms and their layouts/tables from local state
      const venueRoomIds = (roomsQuery.data ?? [])
        .filter((r) => r.venueId === venueId)
        .map((r) => r.id);
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.filter((r) => r.venueId !== venueId) : prev,
      );
      const venueLayoutIds = (layoutsQuery.data ?? [])
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
      layoutsQuery.data,
      layoutsQueryKey,
      queryClient,
      roomsQuery.data,
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
              edition_id: activeEdition.id,
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
      activeEdition.id,
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

  const handleResizeArea = useCallback(
    async (areaId: string, widthM: number, lengthM: number) => {
      const area = (areasQuery.data ?? []).find((a) => a.id === areaId);
      const layout = (layoutsQuery.data ?? []).find((l) => l.id === area?.layoutId);
      const room = (roomsQuery.data ?? []).find((r) => r.id === layout?.roomId);

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
    [areasQuery.data, layoutsQuery.data, roomsQuery.data, resizeAreaMutation],
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

  if (!visible) return null;

  if (auth.isLoading) {
    return (
      <div className="py-5 text-center">
        <Spinner animation="border" variant="warning" role="status">
          <span className="visually-hidden">{m.admin_loading()}</span>
        </Spinner>
      </div>
    );
  }

  return (
    <section
      id="admin"
      aria-labelledby="admin-title"
      className={isAuthenticated ? "admin-authenticated" : "py-5"}
    >
      {!isAuthenticated ? (
        /* ---- Login (OIDC redirect) ---- */
        <AdminLoginForm />
      ) : (
        /* ---- Authenticated: sidebar layout ---- */
        <div className="admin-layout">
          {/* Mobile overlay */}
          {sidebarOpen && (
            <div
              className="admin-sidebar-overlay"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}

          <AdminSidebar
            activeKey={activeKey}
            setActiveKey={setActiveKey}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            navRef={navRef}
            handleNavKeyDown={handleNavKeyDown}
            registrationCount={registrations.length}
            peopleCount={people.length}
            membersCount={members.length}
            volunteerCount={volunteers.length}
            isAnyFetching={isAnyFetching}
            onLoadData={loadData}
            onLogout={handleLogout}
          />

          {/* Main content */}
          <div className="admin-main" id="admin-content">
            {activeEdition.id !== "" && (
              <button
                type="button"
                className="admin-active-edition-strip text-start mb-3"
                onClick={() => {
                  setActiveKey("registrations");
                  setApplyActiveEditionFilterRequest((current) => current + 1);
                }}
                aria-label={m.admin_active_edition_apply_filter()}
              >
                <span className="fw-semibold">{activeEditionLabel(activeEdition.year)}</span>
                {isActiveEditionDay && (
                  <span className="text-warning">
                    {m.admin_active_edition_day_progress({
                      current: activeDayIndex + 1,
                      total: activeEditionDateKeys.length,
                    })}
                  </span>
                )}
                <span>
                  {m.admin_active_edition_checkins({
                    checkedIn: activeEditionStats.checkedIn,
                    total: activeEditionStats.total,
                  })}
                </span>
                {isActiveEditionDay && (
                  <span>
                    {m.admin_active_edition_events_today({ count: activeEditionStats.eventsToday })}
                  </span>
                )}
              </button>
            )}
            {globalError && (
              <Alert variant="danger" className="mb-4" dismissible onClose={() => setGlobalError("")}>
                {globalError}
              </Alert>
            )}

            {isAnyPending ? (
              <div className="text-center py-5">
                <Spinner animation="border" variant="primary" role="status">
                  <span className="visually-hidden">{m.admin_loading()}</span>
                </Spinner>
              </div>
            ) : (
              <div className="admin-content-pane" key={activeKey}>
                {activeKey === "registrations" && (
                  <RegistrationList
                    registrations={registrations}
                    tables={tables}
                    exhibitors={exhibitors}
                    filter={filter}
                    onFilterChange={setFilter}
                    onUpdateStatus={handleUpdateStatus}
                    onUpdatePayment={handleUpdatePayment}
                    onAssignTable={handleAssignTable}
                    onViewDetail={handleViewDetail}
                    onCheckIn={handleCheckIn}
                    onIssueStrap={handleIssueStrap}
                    onAddRegistration={handleAddRegistration}
                    authHeaders={authHeaders}
                    activeEdition={activeEdition}
                    applyActiveEditionFilterRequest={applyActiveEditionFilterRequest}
                    sectionError={registrationError}
                    onClearSectionError={() => setRegistrationError("")}
                  />
                )}
                {activeKey === "exhibitors" && (
                  <Card bg="dark" text="white" border="secondary" className="mb-3">
                    <Card.Body>
                      <ContentSection
                        sectionKey="exhibitors"
                        title={m.admin_content_exhibitors_section()}
                        authHeaders={authHeaders}
                        onItemSaved={handleExhibitorSaved}
                        onItemDeleted={handleExhibitorDeleted}
                      />
                    </Card.Body>
                  </Card>
                )}
                {activeKey === "editions" && (
                  <Card bg="dark" text="white" border="secondary" className="mb-3">
                    <Card.Body>
                      <EditionsSection
                        authHeaders={authHeaders}
                        venues={venues}
                        onEditionMutated={() => {
                          void loadData();
                          void invalidateAdmin(queryClient, [
                            activeEditionQueryKey,
                            queryKeys.admin.activeEditionEvents,
                          ]);
                        }}
                      />
                    </Card.Body>
                  </Card>
                )}
                {activeKey === "floor-plans" && (
                  <LayoutEditor
                    dayOptions={layoutDayOptions}
                    tables={tables}
                    tableTypes={tableTypes}
                    layouts={layouts}
                    registrations={registrations}
                    rooms={rooms}
                    exhibitors={exhibitors}
                    areas={areas}
                    onAddTable={handleAddTable}
                    onMoveTable={handleMoveTable}
                    onDeleteTable={handleDeleteTable}
                    onRotateTable={handleRotateTable}
                    onAddLayout={handleAddLayout}
                    onDeleteLayout={handleDeleteLayout}
                    onAddArea={handleAddArea}
                    onMoveArea={handleMoveArea}
                    onDeleteArea={handleDeleteArea}
                    onRotateArea={handleRotateArea}
                    onAssignAreaToItem={handleAssignAreaToItem}
                    onUpdateAreaLabel={handleUpdateAreaLabel}
                    onChangeTableType={handleChangeTableType}
                    onUpdateTable={handleUpdateTable}
                    onResizeArea={handleResizeArea}
                  />
                )}
                {activeKey === "venues" && (
                  <VenueManagement
                    venues={venues}
                    rooms={rooms}
                    onAdd={handleAddVenue}
                    onArchive={handleArchiveVenue}
                    onRestore={handleRestoreVenue}
                    onDelete={handleDeleteVenue}
                    onAddRoom={handleAddRoom}
                    onArchiveRoom={handleArchiveRoom}
                    onRestoreRoom={handleRestoreRoom}
                  />
                )}
                {activeKey === "table-types" && (
                  <TableTypeManagement
                    tableTypes={tableTypes}
                    onAdd={handleAddTableType}
                    onUpdate={handleUpdateTableType}
                    onArchive={handleArchiveTableType}
                    onRestore={handleRestoreTableType}
                  />
                )}
                {activeKey === "directory" && (
                  <PeopleManagement
                    people={people}
                    registrationCountByPersonId={registrationCountByPersonId}
                    isLoading={isAnyFetching}
                    authHeaders={authHeaders}
                    onMerge={handleMergePeople}
                    onCreate={handleCreatePerson}
                    onUpdate={handleUpdatePerson}
                    onDelete={handleDeletePerson}
                  />
                )}
                {activeKey === "members" && (
                  <MembersManagement
                    members={members}
                    registrationCountByPersonId={registrationCountByPersonId}
                    isLoading={isAnyFetching}
                    onCreate={handleCreateMember}
                    onUpdate={handleUpdateMember}
                    onDelete={handleDeleteMember}
                  />
                )}
                {activeKey === "volunteers" && (
                  <VolunteersManagement
                    volunteers={volunteers}
                    isLoading={isAnyFetching}
                    onCreate={handleCreateVolunteer}
                    onUpdate={handleUpdateVolunteer}
                    onDelete={handleDeleteVolunteer}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Registration detail modal */}
      {detailRegistration && (
        <RegistrationDetail
          registration={detailRegistration}
          baseUrl={window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "")}
          emailDuplicates={emailDuplicates}
          onClose={() => setDetailRegistration(null)}
          onToggleDelivered={handleToggleDelivered}
          onCheckIn={handleCheckIn}
          onIssueStrap={handleIssueStrap}
          onMergeDuplicate={async (canonicalId, duplicateId) => {
            try {
              await handleMergePeople(canonicalId, duplicateId);
              setDetailRegistration(null);
            } catch (err) {
              devError("Failed to merge people", err);
              setRegistrationError(err instanceof Error ? err.message : m.admin_people_merge_error());
            }
          }}
        />
      )}
    </section>
  );
}
