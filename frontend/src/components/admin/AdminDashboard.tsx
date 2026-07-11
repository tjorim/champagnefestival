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
import AnalyticsDashboard from "./AnalyticsDashboard";
import AuditLogViewer from "./AuditLogViewer";
import AdminSidebar from "./AdminSidebar";
import AdminLoginForm from "./AdminLoginForm";
import type { Registration, RegistrationStatus } from "@/types/registration";
import { activeEditionQueryKey, useActiveEdition } from "@/hooks/useActiveEdition";
import { useAdminDashboardData } from "@/hooks/useAdminDashboardData";
import { useAdminPeopleActions } from "@/hooks/useAdminPeopleActions";
import { useAdminQueries } from "@/hooks/useAdminQueries";
import { useAdminRegistrationActions } from "@/hooks/useAdminRegistrationActions";
import { useAdminVenueActions } from "@/hooks/useAdminVenueActions";
import { queryKeys } from "@/utils/queryKeys";
import { invalidateAdmin } from "@/utils/queryInvalidation";
import { devError } from "@/utils/devLog";
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
  const canManageAdminSections = auth.hasRole("admin");
  const [globalError, setGlobalError] = useState("");
  const [registrationError, setRegistrationError] = useState("");
  const [filter, setFilter] = useState<"all" | RegistrationStatus>("all");
  const [applyActiveEditionFilterRequest, setApplyActiveEditionFilterRequest] = useState(0);
  /** Full registration (with checkInToken) shown in the detail modal */
  const [detailRegistration, setDetailRegistration] = useState<Registration | null>(null);

  // Sidebar navigation state
  const [activeKey, setActiveKey] = useState("registrations");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(["events", "content", "venue", "people", "insights"]),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (canManageAdminSections || activeKey === "registrations") return;
    setActiveKey("registrations");
  }, [activeKey, canManageAdminSections, setActiveKey]);

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
    canManageAdminSections,
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
  } = useAdminVenueActions({
    activeEditionId: activeEdition.id,
    areasQueryKey,
    authHeaders,
    layoutsQueryKey,
    queryClient,
    roomsQueryKey,
    tableTypesQueryKey,
    tablesQueryKey,
    venuesQueryKey,
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
            canManageAdminSections={canManageAdminSections}
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
              <Alert
                variant="danger"
                className="mb-4"
                dismissible
                onClose={() => setGlobalError("")}
              >
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
                {canManageAdminSections && activeKey === "exhibitors" && (
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
                {canManageAdminSections && activeKey === "editions" && (
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
                {canManageAdminSections && activeKey === "floor-plans" && (
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
                {canManageAdminSections && activeKey === "venues" && (
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
                {canManageAdminSections && activeKey === "table-types" && (
                  <TableTypeManagement
                    tableTypes={tableTypes}
                    onAdd={handleAddTableType}
                    onUpdate={handleUpdateTableType}
                    onArchive={handleArchiveTableType}
                    onRestore={handleRestoreTableType}
                  />
                )}
                {canManageAdminSections && activeKey === "directory" && (
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
                {canManageAdminSections && activeKey === "members" && (
                  <MembersManagement
                    members={members}
                    registrationCountByPersonId={registrationCountByPersonId}
                    isLoading={isAnyFetching}
                    onCreate={handleCreateMember}
                    onUpdate={handleUpdateMember}
                    onDelete={handleDeleteMember}
                  />
                )}
                {canManageAdminSections && activeKey === "volunteers" && (
                  <VolunteersManagement
                    volunteers={volunteers}
                    isLoading={isAnyFetching}
                    authHeaders={authHeaders}
                    onCreate={handleCreateVolunteer}
                    onUpdate={handleUpdateVolunteer}
                    onDelete={handleDeleteVolunteer}
                  />
                )}
                {canManageAdminSections && activeKey === "analytics" && (
                  <AnalyticsDashboard authHeaders={authHeaders} />
                )}
                {canManageAdminSections && activeKey === "audit-log" && (
                  <AuditLogViewer authHeaders={authHeaders} />
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
          tables={tables}
          onClose={() => setDetailRegistration(null)}
          onToggleDelivered={handleToggleDelivered}
          onCheckIn={handleCheckIn}
          onIssueStrap={handleIssueStrap}
          onAssignTable={handleAssignTable}
          onMergeDuplicate={async (canonicalId, duplicateId) => {
            try {
              await handleMergePeople(canonicalId, duplicateId);
              setDetailRegistration(null);
            } catch (err) {
              devError("Failed to merge people", err);
              setRegistrationError(
                err instanceof Error ? err.message : m.admin_people_merge_error(),
              );
            }
          }}
        />
      )}
    </section>
  );
}
