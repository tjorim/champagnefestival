import { formatNumber } from "@/lib/format/numberUtils";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { AdminTableSortMenu } from "../shared/AdminTableSortMenu";
import { useIsMobile } from "@/components/ui/use-mobile";
import { orderAnswerText, questionText } from "@/lib/editions/orderQuestions";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { AdminTablePagination } from "../shared/AdminTablePagination";
import { DownloadIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { AdminDataTable } from "../shared/AdminDataTable";
import { useCallback, useMemo, useState } from "react";
import {
  summarizeGuestCheckIns,
  useRegistrationListQuery,
  useRegistrationCountsQuery,
  useVolunteerCheckInStats,
} from "./useRegistrationListQuery";
import { type SortingState, type ColumnVisibilityState } from "@tanstack/react-table";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { FloorTable } from "@/api-types";
import type { Registration, RegistrationStatus } from "@/types/registration";
import { useAppTable } from "../shared/useAdminTable";
import { exportToCsv } from "../shared/csvExport";
import RegistrationCreateModal from "./RegistrationCreateModal";
import { ColumnVisibilityDropdown } from "../shared/ColumnVisibilityDropdown";
import { loadColVis, saveColVis } from "../shared/columnVisibility";
import { downloadRegistrationsCsv, fetchAllRegistrationPages } from "@/lib/api/adminFetch";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import { devError } from "@/lib/devLog";
import { editionDisplayNameWithType } from "@/lib/editions/editionName";
import { AdminAddButton } from "@/components/admin/RowActions";
import { type AllocationRef, COL_VIS_KEY, PAGE_SIZE_OPTIONS } from "./list/registrationListConfig";
import { useRegistrationFilters } from "./list/useRegistrationFilters";
import {
  useRegistrationSelection,
  useRegistrationBulkActions,
} from "./list/useRegistrationSelection";
import { useRegistrationRowActions } from "./list/useRegistrationRowActions";
import { useRegistrationColumns } from "./list/useRegistrationColumns";
import { RegistrationFilters } from "./list/RegistrationFilters";
import { RegistrationCheckInSummary } from "./list/RegistrationCheckInSummary";
import { RegistrationBulkBar } from "./list/RegistrationBulkBar";
import { RegistrationQrDialog } from "./list/RegistrationQrDialog";
import { RegistrationBulkDialog } from "./list/RegistrationBulkDialog";

interface RegistrationListProps {
  registrations: Registration[];
  tables: FloorTable[];
  organizations: AllocationRef[];
  filter: "all" | RegistrationStatus;
  onFilterChange: (filter: "all" | RegistrationStatus) => void;
  onUpdateStatus: (id: string, status: RegistrationStatus) => Promise<void>;
  /** Records a `payment` ledger transaction for the booking's outstanding balance (#1019). */
  onRecordPayment: (id: string) => Promise<void>;
  onAssignTable: (registrationId: string, tableId: string | undefined) => void;
  onViewDetail: (registration: Registration) => void;
  onCheckIn: (registrationId: string, checkedIn?: boolean) => Promise<boolean | void>;
  onIssueStrap: (registrationId: string) => Promise<void>;
  onAddRegistration: (registration: Registration) => void;

  activeEdition: ActiveEdition;
  activeEditionLoaded?: boolean;
  canManageAdminSections?: boolean;
  countedPendingQueue?: boolean;
  applyActiveEditionFilterRequest: number;
  sectionError?: string;
  onClearSectionError?: () => void;
}

const DEFAULT_COLUMN_VISIBILITY: ColumnVisibilityState = { event: false, table: false };

export default function RegistrationList({
  registrations,
  tables,
  organizations,
  filter,
  onFilterChange,
  onUpdateStatus,
  onRecordPayment,
  onAssignTable,
  onViewDetail,
  onCheckIn,
  onIssueStrap,
  onAddRegistration,

  activeEdition,
  activeEditionLoaded = true,
  canManageAdminSections = true,
  countedPendingQueue = false,
  applyActiveEditionFilterRequest,
  sectionError,
  onClearSectionError,
}: RegistrationListProps) {
  const locale = getLocale();
  const isMobile = useIsMobile();
  const isOnline = useOnlineStatus();
  const [attendanceFeedback, setAttendanceFeedback] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [qrTargetId, setQrTargetId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(() =>
    loadColVis(COL_VIS_KEY),
  );
  const [exportingEventId, setExportingEventId] = useState<string | null>(null);
  const [eventExportError, setEventExportError] = useState<string | null>(null);
  const [exportingAllCsv, setExportingAllCsv] = useState(false);
  const [csvExportError, setCsvExportError] = useState<string | null>(null);
  const selection = useRegistrationSelection(setAttendanceFeedback);
  const { selectedIds, selectAllMatchingActive, clearSelection } = selection;
  const filters = useRegistrationFilters({
    activeEdition,
    applyActiveEditionFilterRequest,
    countedPendingQueue,
    filter,
    onFilterChange,
    organizations,
    sorting,
    clearSelection,
  });
  const {
    todayKey,
    page,
    setPage,
    pageSize,
    changePageSize,
    backendEditionId,
    currentFilterParams,
    hasActiveRegistrationFilters,
    handleClearRegistrationFilters,
  } = filters;

  const volunteerStats = useVolunteerCheckInStats(!canManageAdminSections);

  const allContactPersonIds = useMemo(
    () =>
      new Set(
        organizations.map((e) => e.contact_person_id).filter((id): id is string => id !== null),
      ),
    [organizations],
  );

  const pageQuery = useRegistrationListQuery({ ...currentFilterParams, page, limit: pageSize });

  // The paginated fetch decides *which* registrations are on this page (and in
  // what order) — but for the actual row data we prefer whatever the live-synced
  // active-edition collection (the `registrations` prop) already holds, so a check-in or
  // table assignment made elsewhere in the admin UI shows up on this page
  // instantly instead of waiting for the next paginated refetch.
  const registrationsById = useMemo(
    () => new Map(registrations.map((r) => [r.id, r] as const)),
    [registrations],
  );
  const tableOccupancy = useMemo(() => {
    const occupied = new Map<string, number>();
    for (const r of registrations) {
      if (r.status === "cancelled") continue;
      for (const allocation of r.allocations ?? []) {
        occupied.set(
          allocation.table_id,
          (occupied.get(allocation.table_id) ?? 0) + allocation.guest_count,
        );
      }
    }
    return occupied;
  }, [registrations]);
  const pageRegistrations = useMemo(
    () =>
      (pageQuery.data?.registrations ?? []).map((row) => {
        const live = registrationsById.get(row.id);
        if (!live || live.table_names) return live ?? row;
        // Detail and mutation responses omit the list-only names. Preserve names
        // from the page when they still describe the same ordered allocations.
        const sameTables =
          live.allocations.length === row.allocations.length &&
          live.allocations.every(
            (allocation, index) => allocation.table_id === row.allocations[index]?.table_id,
          );
        return sameTables ? { ...live, table_names: row.table_names } : live;
      }),
    [pageQuery.data, registrationsById],
  );

  const total = pageQuery.data?.total ?? 0;
  const effectivePageSize = pageQuery.data?.limit ?? pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  // Gmail-style expansion offer: the whole visible page is selected, but the
  // filters match more than fits on one page, and the user hasn't already
  // expanded to "all matching" (or manually adjusted the selection since).
  const canExpandSelectionToAllMatching =
    !selectAllMatchingActive &&
    pageRegistrations.length > 0 &&
    total > pageRegistrations.length &&
    pageRegistrations.every((r) => selectedIds.has(r.id));

  // Fetches every registration matching the current filters (not just the
  // current page), reading all pages — used by "export all matching" and by the
  // "select all N matching" bulk action.
  const fetchAllMatchingRegistrations = useCallback(async (): Promise<Registration[]> => {
    const matched = await fetchAllRegistrationPages(currentFilterParams);
    return matched.map((r) => registrationsById.get(r.id) ?? r);
  }, [currentFilterParams, registrationsById]);

  const handleAssignTable = useCallback(
    (registrationId: string, tableId: string) => {
      onAssignTable(registrationId, tableId || undefined);
    },
    [onAssignTable],
  );

  const countsQuery = useRegistrationCountsQuery(
    activeEdition.id,
    todayKey,

    canManageAdminSections && activeEditionLoaded,
  );
  const statusCounts = countsQuery.data ?? { all: 0, pending: 0, confirmed: 0 };
  const editionCounts = countsQuery.data ?? { all: 0, festival: 0, standalone: 0, active: 0 };
  const todayCount = countsQuery.data?.today ?? 0;

  const rowActions = useRegistrationRowActions({
    isOnline,
    onCheckIn,
    onIssueStrap,
    onRecordPayment,
    pageRegistrations,
    setAttendanceFeedback,
  });
  const columns = useRegistrationColumns({
    pageRegistrations,
    selection,
    allContactPersonIds,
    tables,
    tableOccupancy,
    handleAssignTable,
    onViewDetail,
    onUpdateStatus,
    handleCheckIn: rowActions.handleCheckIn,
    handleIssueStrap: rowActions.handleIssueStrap,
    handleRecordPayment: rowActions.handleRecordPayment,
    isOnline,
    processingIds: rowActions.processingIds,
    setQrTargetId,
  });

  const effectiveColumnVisibility = { ...DEFAULT_COLUMN_VISIBILITY, ...columnVisibility };
  const table = useAppTable(
    {
      data: pageRegistrations,
      manualSorting: true,
      manualFiltering: true,
      columns,
      state: { sorting, columnVisibility: effectiveColumnVisibility },
      getRowId: (row) => row.id,
      onSortingChange: (updater) => {
        const next = typeof updater === "function" ? updater(sorting) : updater;
        setSorting(next);
        setPage(1);
      },
      onColumnVisibilityChange: (updater) => {
        const next = typeof updater === "function" ? updater(columnVisibility) : updater;
        setColumnVisibility(next);
        saveColVis(COL_VIS_KEY, next);
      },
    },
    (state) => ({
      sorting: state.sorting,
      columnVisibility: state.columnVisibility,
    }),
  );

  // Attendance is scoped to all events or the selected edition, independently of
  // the other table filters and pagination.
  const eventCapacityStats = canManageAdminSections
    ? countsQuery.data?.events.filter(
        (event) => !backendEditionId || event.edition_id === backendEditionId,
      )
    : volunteerStats.data?.filter(
        (event) =>
          !backendEditionId || activeEdition.events.some(({ id }) => id === event.event_id),
      );
  const checkInTotals = eventCapacityStats && summarizeGuestCheckIns(eventCapacityStats);
  const formattedCheckIns = checkInTotals && {
    checkedIn: formatNumber(checkInTotals.checkedIn, locale),
    total: formatNumber(checkInTotals.total, locale),
  };
  const checkInSummary =
    formattedCheckIns &&
    (backendEditionId
      ? `${editionDisplayNameWithType(activeEdition)} · ${m.admin_active_edition_checkins(formattedCheckIns)}`
      : m.admin_event_checkin_summary(formattedCheckIns));

  // Exports every registration matching the current filters, not just the
  // rendered page — see fetchAllMatchingRegistrations.
  const handleExportCsv = useCallback(async () => {
    setCsvExportError(null);
    setExportingAllCsv(true);
    try {
      const matching = await fetchAllMatchingRegistrations();
      const rows = matching.map((reg) => ({
        [m.registration_name()]: reg.person.name,
        [m.registration_email()]: reg.person.email,
        [m.registration_phone()]: reg.person.phone,
        [m.admin_event_label()]: reg.event?.title ?? reg.event_id,
        [m.admin_guests_count()]: reg.guest_count,
        [m.admin_status_label()]: reg.status,
        [m.admin_payment_label()]: reg.payment_status,
        [m.admin_check_in_title()]: reg.checked_in ? m.admin_value_yes() : m.admin_value_no(),
        [m.admin_created_at()]: reg.created_at,
        [m.order_questions_heading()]: (reg.order_answers ?? [])
          .map((a) => `${questionText(a.question ?? {}, "title")}: ${orderAnswerText(a)}`)
          .join("\n"),
      }));
      exportToCsv("registrations.csv", rows);
    } catch (err) {
      devError("Failed to export registrations", err);
      setCsvExportError(apiErrorMessage(err, m.admin_error_load_data()));
    } finally {
      setExportingAllCsv(false);
    }
  }, [fetchAllMatchingRegistrations, setCsvExportError]);

  const handleExportEventCsv = useCallback(
    async (eventId: string) => {
      setEventExportError(null);
      setExportingEventId(eventId);
      try {
        await downloadRegistrationsCsv(eventId);
      } catch (err) {
        devError("Failed to export guest list", err);
        setEventExportError(apiErrorMessage(err, m.admin_registrations_export_event_csv_error()));
      } finally {
        setExportingEventId(null);
      }
    },
    [setEventExportError],
  );

  const bulk = useRegistrationBulkActions({
    selection,
    fetchAllMatchingRegistrations,
    onUpdateStatus,
    onRecordPayment,
  });
  const { bulkError, setBulkError } = bulk;

  return (
    <>
      <p
        role="status"
        className={attendanceFeedback ? "mb-2 text-sm text-success-text" : "sr-only"}
      >
        {attendanceFeedback || checkInSummary}
      </p>
      {!isOnline && (
        <Alert variant="warning" role="status">
          {m.checkin_offline_banner()}
        </Alert>
      )}
      <Card tone="secondary">
        <CardHeader className="pb-2">
          {/* Row 1: title + stats + add */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{m.admin_registrations_tab_header()}</span>
              <span className="text-subtle text-sm">
                ({formatNumber(statusCounts.all, locale)})
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <ColumnVisibilityDropdown table={table} tableId="registrations" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExportCsv()}
                disabled={exportingAllCsv}
                title={m.admin_export_csv_all_title()}
              >
                {exportingAllCsv ? (
                  <Spinner size="sm" aria-hidden="true" />
                ) : (
                  <Icon icon={DownloadIcon} />
                )}
                {m.admin_export_csv()}
              </Button>
              <AdminAddButton onClick={() => setShowCreateModal(true)}>
                {m.admin_add_registration()}
              </AdminAddButton>
            </div>
          </div>
          <RegistrationFilters
            filters={filters}
            filter={filter}
            statusCounts={statusCounts}
            editionCounts={editionCounts}
            todayCount={todayCount}
            activeEdition={activeEdition}
          />
          {eventCapacityStats && (eventCapacityStats.length > 0 || backendEditionId) && (
            <RegistrationCheckInSummary
              eventCapacityStats={eventCapacityStats}
              checkInSummary={checkInSummary}
              exportingEventId={exportingEventId}
              handleExportEventCsv={handleExportEventCsv}
            />
          )}
          {bulkError && (
            <Alert
              role="alert"
              aria-live="assertive"
              variant="danger"
              className="py-1 mt-2 mb-0"
              onClose={() => setBulkError(null)}
            >
              {bulkError}
            </Alert>
          )}
          {eventExportError && (
            <Alert
              role="alert"
              aria-live="assertive"
              variant="danger"
              className="py-1 mt-2 mb-0"
              onClose={() => setEventExportError(null)}
            >
              {eventExportError}
            </Alert>
          )}
          {csvExportError && (
            <Alert
              role="alert"
              aria-live="assertive"
              variant="danger"
              className="py-1 mt-2 mb-0"
              onClose={() => setCsvExportError(null)}
            >
              {csvExportError}
            </Alert>
          )}
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <RegistrationBulkBar
              selection={selection}
              bulk={bulk}
              canExpandSelectionToAllMatching={canExpandSelectionToAllMatching}
              pageRegistrationCount={pageRegistrations.length}
              total={total}
            />
          )}
        </CardHeader>

        <CardContent className="p-0">
          {sectionError && (
            <Alert
              role="alert"
              aria-live="assertive"
              variant="danger"
              className="m-4 mb-0"
              onClose={onClearSectionError}
            >
              {sectionError}
            </Alert>
          )}
          {pageQuery.isLoading ? (
            <p className="text-subtle text-center py-6 mb-0">
              <Spinner size="sm" aria-hidden="true" />
              {m.admin_search_person_placeholder()}…
            </p>
          ) : pageQuery.isError ? (
            <p className="text-destructive text-center py-6 mb-0">{m.admin_error_load_data()}</p>
          ) : table.getRowModel().rows.length === 0 ? (
            hasActiveRegistrationFilters ? (
              <AdminEmptyState
                action={
                  <Button variant="outline" size="sm" onClick={handleClearRegistrationFilters}>
                    {m.admin_content_clear_filters()}
                  </Button>
                }
              >
                {m.admin_no_registration_filter_matches()}
              </AdminEmptyState>
            ) : (
              <AdminEmptyState>{m.admin_no_registrations()}</AdminEmptyState>
            )
          ) : (
            <>
              {!isMobile ? (
                <div className="w-full">
                  <AdminDataTable table={table} />
                </div>
              ) : (
                <ul className="list-none space-y-3 p-3">
                  <li className="flex flex-wrap items-center justify-between gap-2">
                    <AdminTableSortMenu table={table} />
                    {table.getHeaderGroups().flatMap((group) =>
                      group.headers
                        .filter((header) => header.column.id === "select")
                        .map((header) => (
                          <label key={header.id} className="flex items-center gap-2">
                            <table.FlexRender header={header} />
                            {m.admin_select_all()}
                          </label>
                        )),
                    )}
                  </li>
                  {table.getRowModel().rows.map((row) => (
                    <li
                      key={row.id}
                      className="space-y-2 rounded-md border border-border p-3 break-words"
                    >
                      {row
                        .getAllCells()
                        .filter((cell) =>
                          [
                            "select",
                            "name",
                            "event",
                            "guest_count",
                            "status",
                            "payment_status",
                            "checked_in",
                            "actions",
                          ].includes(cell.column.id),
                        )
                        .map((cell) => (
                          <div key={cell.id}>
                            {["guest_count", "status", "payment_status"].includes(cell.column.id) &&
                              typeof cell.column.columnDef.header === "string" && (
                                <span className="me-2 text-subtle">
                                  {cell.column.columnDef.header}:
                                </span>
                              )}
                            <table.FlexRender cell={cell} />
                          </div>
                        ))}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {selectedIds.size > 0 && (
            <div className="p-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const toolbar = document.getElementById("registration-bulk-actions");
                  toolbar?.focus();
                  toolbar?.scrollIntoView({ block: "nearest" });
                }}
              >
                {m.admin_review_selected_bookings({ count: selectedIds.size })}
              </Button>
            </div>
          )}
          {!pageQuery.isLoading && !pageQuery.isError && total > 0 && (
            <AdminTablePagination
              total={total}
              pageIndex={page - 1}
              pageSize={effectivePageSize}
              canPreviousPage={page > 1 && !pageQuery.isFetching}
              canNextPage={page < totalPages && !pageQuery.isFetching}
              onPreviousPage={() => setPage((p) => Math.max(1, p - 1))}
              onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
              onPageSizeChange={changePageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          )}
        </CardContent>
      </Card>

      <RegistrationQrDialog
        targetId={qrTargetId}
        pageRegistrations={pageRegistrations}
        registrationsById={registrationsById}
        onClose={() => setQrTargetId(null)}
      />
      <RegistrationCreateModal
        show={showCreateModal}

        onSaved={onAddRegistration}
        onOpenBooking={(registration) => {
          setShowCreateModal(false);
          onViewDetail(registration);
        }}
        onHide={() => setShowCreateModal(false)}
      />

      <RegistrationBulkDialog
        bulk={bulk}
        selection={selection}
        registrationsById={registrationsById}
        pageRegistrations={pageRegistrations}
      />
    </>
  );
}
