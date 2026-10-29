import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { AdminTableSortMenu } from "./AdminTableSortMenu";
import { useIsMobile } from "@/components/ui/use-mobile";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { QRCodeSVG } from "qrcode.react";
import { orderAnswerText, questionText } from "@/utils/orderQuestions";
import { AdminEmptyState } from "./AdminEmptyState";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toggle } from "@/components/ui/toggle";
import { AdminTablePagination } from "./AdminTablePagination";
import { AdminSelect, AdminOption, AdminInput } from "@/components/admin/AdminFields";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  ContactRoundIcon,
  DownloadIcon,
  EllipsisIcon,
  EuroIcon,
  FileSpreadsheetIcon,
  LogInIcon,
  PencilIcon,
  QrCodeIcon,
  ShoppingCartIcon,
  XIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminDataTable } from "./AdminDataTable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useRegistrationListQuery,
  useRegistrationCountsQuery,
} from "@/hooks/useRegistrationListQuery";
import { useQuery } from "@tanstack/react-query";
import { type SortingState, type ColumnVisibilityState } from "@tanstack/react-table";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/utils/apiErrors";
import type { FloorTable } from "@/types/admin";
import type { PaymentStatus, Registration, RegistrationStatus } from "@/types/registration";
import { useAppTable, createAppColumnHelper } from "@/hooks/useAdminTable";
import { exportToCsv } from "@/utils/csvExport";
import RegistrationCreateModal from "./RegistrationCreateModal";
import { ColumnVisibilityDropdown } from "./ColumnVisibilityDropdown";
import { hideColumnUntilUsed, loadColVis, saveColVis } from "@/utils/columnVisibility";
import {
  downloadRegistrationsCsv,
  fetchEventCheckInStats,
  fetchRegistration,
  fetchAllRegistrationPages,
  type RegistrationSortKey,
} from "@/utils/adminFetch";
import { queryKeys } from "@/utils/queryKeys";
import { toLocalDateKey } from "@/utils/dateUtils";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import { useTodayKey } from "@/hooks/useTodayKey";
import { devError } from "@/utils/devLog";
import { editionDisplayNameWithType } from "@/utils/editionName";
import { AdminAddButton } from "./RowActions";

const COL_VIS_KEY = "admin-col-vis-registrations";
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 50;
// Bulk mutations are one REST call per registration (see executeBulkAction) —
// batching keeps a large "select all matching" action from firing hundreds
// of simultaneous requests at once.
const BULK_ACTION_BATCH_SIZE = 20;

// Maps a sortable table column's id to the backend `sort` query param it
// corresponds to (see backend/app/routers/registrations.py's _SORT_COLUMNS).
// Sorting is server-side — the table only ever holds one page of rows — so
// every sortable column here must have a backend counterpart.
const SORT_KEY_BY_COLUMN: Record<string, RegistrationSortKey> = {
  name: "name",
  event: "event",
  guestCount: "guest_count",
  status: "status",
  paymentStatus: "payment_status",
  checkedIn: "checked_in",
};

interface AllocationRef {
  id: number;
  name: string;
  contactPersonId: string | null;
}

type EditionFilter = "all" | "festival" | "standalone";

type DateFilter = "all" | "today";

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
  authHeaders: () => Record<string, string>;
  activeEdition: ActiveEdition;
  countedPendingQueue?: boolean;
  applyActiveEditionFilterRequest: number;
  sectionError?: string;
  onClearSectionError?: () => void;
}

function statusBadgeVariant(status: RegistrationStatus): BadgeVariant {
  switch (status) {
    case "confirmed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "warning";
  }
}

function paymentBadgeVariant(payment: PaymentStatus): BadgeVariant {
  switch (payment) {
    case "paid":
      return "success";
    case "partial":
      return "warning";
    default:
      return "secondary";
  }
}

function statusLabel(status: RegistrationStatus): string {
  switch (status) {
    case "confirmed":
      return m.admin_status_confirmed();
    case "cancelled":
      return m.admin_status_cancelled();
    default:
      return m.admin_status_pending();
  }
}

function paymentLabel(payment: PaymentStatus): string {
  switch (payment) {
    case "paid":
      return m.admin_payment_paid();
    case "partial":
      return m.admin_payment_partial();
    default:
      return m.admin_payment_unpaid();
  }
}

function isStandaloneRegistration(registration: Registration) {
  if (!registration.event || !registration.event.edition) return false;
  return registration.event.edition.editionType !== "festival";
}

const columnHelper = createAppColumnHelper<Registration>();

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
  authHeaders,
  activeEdition,
  countedPendingQueue = false,
  applyActiveEditionFilterRequest,
  sectionError,
  onClearSectionError,
}: RegistrationListProps) {
  const isMobile = useIsMobile();
  const isOnline = useOnlineStatus();
  const [attendanceFeedback, setAttendanceFeedback] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [qrTargetId, setQrTargetId] = useState<string | null>(null);
  const [allocationFilter, setAllocationFilter] = useState("");
  const [editionFilter, setEditionFilter] = useState<EditionFilter>("all");
  const [activeEditionOnly, setActiveEditionOnly] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(() =>
    loadColVis(COL_VIS_KEY),
  );
  const [selectionRecords, setSelectionRecords] = useState<Map<string, Registration>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // True only once the user has explicitly expanded a full-page selection to
  // "every registration matching these filters" (the Gmail-style banner
  // below) — purely a label/UX flag; `selectedIds` itself always holds the
  // real set being acted on.
  const [selectAllMatchingActive, setSelectAllMatchingActive] = useState(false);
  const [isSelectingAllMatching, setIsSelectingAllMatching] = useState(false);
  const [selectAllMatchingError, setSelectAllMatchingError] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<"confirm" | "cancel" | "paid" | null>(null);
  const [bulkInProgress, setBulkInProgress] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [exportingEventId, setExportingEventId] = useState<string | null>(null);
  const [eventExportError, setEventExportError] = useState<string | null>(null);
  const [exportingAllCsv, setExportingAllCsv] = useState(false);
  const [csvExportError, setCsvExportError] = useState<string | null>(null);
  const todayKey = useTodayKey();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const filterDefaultsAppliedRef = useRef<string | null>(null);

  // The set of matching registrations changes under any filter change, so a
  // held-over selection (page-scoped or "all matching") no longer means what
  // it did — clear it rather than silently acting on a stale set later.
  const clearSelection = useCallback(() => {
    setAttendanceFeedback("");
    setSelectionRecords(new Map());
    setSelectedIds(new Set());
    setSelectAllMatchingActive(false);
    setSelectAllMatchingError(null);
  }, []);

  // Guards against resetting `page` on the vacuous debounce firing 300ms after
  // every mount (q hasn't actually changed then) — only an actual change to
  // the debounced search term should knock the user back to page 1.
  const debouncedQRef = useRef(debouncedQ);
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = q.trim();
      setDebouncedQ(next);
      if (next !== debouncedQRef.current) {
        debouncedQRef.current = next;
        setPage(1);
        clearSelection();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, clearSelection]);

  const checkInStatsQuery = useQuery({
    queryKey: queryKeys.admin.eventCheckInStats,
    queryFn: () => fetchEventCheckInStats(authHeaders),
    staleTime: 30 * 1000,
    retry: false,
  });

  const allContactPersonIds = useMemo(
    () =>
      new Set(
        organizations.map((e) => e.contactPersonId).filter((id): id is string => id !== null),
      ),
    [organizations],
  );

  const allocationOptions: { key: string; label: string; personId: string }[] = useMemo(
    () =>
      organizations
        .filter((e) => e.contactPersonId)
        .map((e) => ({
          key: `e:${e.id}`,
          label: `${m.admin_allocation_organization_label()}: ${e.name}`,
          personId: e.contactPersonId!,
        })),
    [organizations],
  );

  const filterPersonId = allocationFilter
    ? (allocationOptions.find((o) => o.key === allocationFilter)?.personId ?? null)
    : null;

  const activeEditionDateKeys = useMemo(
    () => activeEdition.dates.map((date) => toLocalDateKey(date)),
    [activeEdition.dates],
  );
  const activeDayIndex = activeEditionDateKeys.indexOf(todayKey);
  const isActiveEditionDay = activeDayIndex >= 0;

  useEffect(() => {
    if (!isActiveEditionDay || countedPendingQueue) return;
    if (filterDefaultsAppliedRef.current === activeEdition.id) return;
    filterDefaultsAppliedRef.current = activeEdition.id;
    setActiveEditionOnly(true);
    setPage(1);
    clearSelection();
  }, [activeEdition.id, isActiveEditionDay, clearSelection, countedPendingQueue]);

  // The parent bumps this counter to imperatively request the filter. Adjust
  // during render (comparing against the previous value) rather than in an
  // effect, since this only needs to react to that one transition.
  const [appliedEditionFilterRequest, setAppliedEditionFilterRequest] = useState(
    applyActiveEditionFilterRequest,
  );
  if (applyActiveEditionFilterRequest !== appliedEditionFilterRequest) {
    setAppliedEditionFilterRequest(applyActiveEditionFilterRequest);
    if (applyActiveEditionFilterRequest !== 0) {
      setActiveEditionOnly(true);
      setPage(1);
      clearSelection();
    }
  }

  const changeStatusFilter = useCallback(
    (next: "all" | RegistrationStatus) => {
      onFilterChange(next);
      setPage(1);
      clearSelection();
    },
    [onFilterChange, clearSelection],
  );

  const changeAllocationFilter = useCallback(
    (value: string) => {
      setAllocationFilter(value);
      setPage(1);
      clearSelection();
    },
    [clearSelection],
  );

  const changeEditionFilter = useCallback(
    (value: EditionFilter) => {
      setEditionFilter(value);
      setActiveEditionOnly(false);
      setPage(1);
      clearSelection();
    },
    [clearSelection],
  );

  const toggleActiveEditionOnly = useCallback(() => {
    setActiveEditionOnly((current) => !current);
    setEditionFilter("all");
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const toggleDateFilter = useCallback(() => {
    setDateFilter((current) => (current === "today" ? "all" : "today"));
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const changePageSize = useCallback((value: number) => {
    setPageSize(value);
    setPage(1);
  }, []);

  const activeSort = sorting[0];
  const backendSort: RegistrationSortKey | undefined = activeSort
    ? SORT_KEY_BY_COLUMN[activeSort.id]
    : undefined;
  const backendSortDir: "asc" | "desc" = activeSort?.desc ? "desc" : "asc";
  const backendStatus = filter === "all" ? "" : filter;
  const backendEditionId = activeEditionOnly ? activeEdition.id : "";
  const backendEventDate = dateFilter === "today" ? todayKey : "";
  const backendEditionCategory = editionFilter === "all" ? "" : editionFilter;

  // Shared with the "select all matching" bulk-selection fetch and the CSV
  // export below, so both act on exactly the same filter set the table is
  // currently showing — everything except page/limit, which each caller
  // supplies for itself.
  const currentFilterParams = useMemo(
    () => ({
      query: debouncedQ || undefined,
      status: backendStatus || undefined,
      personId: filterPersonId ?? undefined,
      editionId: backendEditionId || undefined,
      eventDate: backendEventDate || undefined,
      editionCategory: backendEditionCategory || undefined,
      sort: backendSort,
      sortDir: backendSort ? backendSortDir : undefined,
    }),
    [
      debouncedQ,
      backendStatus,
      filterPersonId,
      backendEditionId,
      backendEventDate,
      backendEditionCategory,
      backendSort,
      backendSortDir,
    ],
  );

  const pageQuery = useRegistrationListQuery(
    { ...currentFilterParams, page, limit: pageSize },
    authHeaders,
  );

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
          allocation.tableId,
          (occupied.get(allocation.tableId) ?? 0) + allocation.guestCount,
        );
      }
    }
    return occupied;
  }, [registrations]);
  const pageRegistrations = useMemo(
    () => (pageQuery.data?.registrations ?? []).map((r) => registrationsById.get(r.id) ?? r),
    [pageQuery.data, registrationsById],
  );

  const total = pageQuery.data?.total ?? 0;
  const effectivePageSize = pageQuery.data?.limit ?? pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  const qrDetailQuery = useQuery({
    queryKey: [...queryKeys.admin.registrations, "qr", qrTargetId],
    queryFn: () => fetchRegistration(qrTargetId!, authHeaders),
    enabled: qrTargetId !== null,
    staleTime: 0,
  });
  const qrRegistration = qrTargetId
    ? (pageRegistrations.find((record) => record.id === qrTargetId) ??
      registrationsById.get(qrTargetId) ??
      null)
    : null;

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
    const matched = await fetchAllRegistrationPages(authHeaders, currentFilterParams);
    return matched.map((r) => registrationsById.get(r.id) ?? r);
  }, [authHeaders, currentFilterParams, registrationsById]);

  const handleAssignTable = useCallback(
    (registrationId: string, tableId: string) => {
      onAssignTable(registrationId, tableId || undefined);
    },
    [onAssignTable],
  );

  const countsQuery = useRegistrationCountsQuery(activeEdition.id, todayKey, authHeaders);
  const statusCounts = countsQuery.data ?? { all: 0, pending: 0, confirmed: 0 };
  const editionCounts = countsQuery.data ?? { all: 0, festival: 0, standalone: 0, active: 0 };
  const todayCount = countsQuery.data?.today ?? 0;

  // Isolated memo so that selectedIds changes only rebuild the select column, not all columns
  const selectColumn = useMemo(
    () =>
      columnHelper.display({
        id: "select",
        header: () => {
          const allIds = pageRegistrations.map((r) => r.id);
          const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
          return (
            <Checkbox
              checked={allSelected}
              indeterminate={!allSelected && allIds.some((id) => selectedIds.has(id))}
              onCheckedChange={() => {
                setSelectionRecords(
                  (previous) =>
                    new Map([
                      ...previous,
                      ...pageRegistrations.map((record) => [record.id, record] as const),
                    ]),
                );
                setSelectAllMatchingActive(false);
                setSelectAllMatchingError(null);
                if (allSelected) {
                  setSelectedIds((prev) => {
                    const next = new Set<string>(prev);
                    allIds.forEach((id) => next.delete(id));
                    return next;
                  });
                } else {
                  setSelectedIds((prev) => new Set<string>([...prev, ...allIds]));
                }
              }}
              aria-label={m.admin_select_all()}
            />
          );
        },
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.id)}
            onCheckedChange={() => {
              setSelectionRecords((previous) => new Map(previous).set(row.id, row.original));
              setSelectAllMatchingActive(false);
              setSelectAllMatchingError(null);
              setSelectedIds((prev) => {
                const next = new Set<string>(prev);
                if (next.has(row.id)) next.delete(row.id);
                else next.add(row.id);
                return next;
              });
            }}
            aria-label={m.admin_select_registration({ name: row.original.person.name })}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        meta: { tdClassName: "align-middle" },
      }),
    [selectedIds, pageRegistrations],
  );

  const handleCheckIn = useCallback(
    async (id: string, checkedIn = true) => {
      if (!isOnline || processingIds.has(id)) return;
      setProcessingIds((prev) => new Set(prev).add(id));
      setAttendanceFeedback("");
      try {
        const succeeded = checkedIn ? await onCheckIn(id) : await onCheckIn(id, false);
        if (succeeded === true) {
          const guest = pageRegistrations.find((record) => record.id === id);
          setAttendanceFeedback(
            `${guest?.person.name ? `${guest.person.name}: ` : ""}${checkedIn ? m.admin_checked_in() : m.admin_not_checked_in()}`,
          );
        }
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [isOnline, onCheckIn, pageRegistrations, processingIds],
  );

  const handleIssueStrap = useCallback(
    async (id: string) => {
      if (!isOnline || processingIds.has(id)) return;
      setProcessingIds((prev) => new Set(prev).add(id));
      try {
        await onIssueStrap(id);
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [isOnline, onIssueStrap, processingIds],
  );

  const handleRecordPayment = useCallback(
    async (id: string) => {
      if (processingIds.has(id)) return;
      setProcessingIds((prev) => new Set(prev).add(id));
      try {
        await onRecordPayment(id);
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [onRecordPayment, processingIds],
  );

  const dataColumns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor((row) => row.person.name, {
          id: "name",
          header: m.registration_name(),
          cell: ({ row }) => {
            const reg = row.original;
            const isLinked = allContactPersonIds.has(reg.person.id);
            const isStandalone = isStandaloneRegistration(reg);
            return (
              <>
                <div className="font-semibold flex items-center gap-1">
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-left whitespace-normal"
                    onClick={() => onViewDetail(reg)}
                  >
                    {reg.person.name}
                  </Button>
                  {isLinked && (
                    <span
                      role="img"
                      title={m.admin_linked_organization_title()}
                      aria-label={m.admin_allocation_contact_aria()}
                    >
                      <Icon icon={ContactRoundIcon} className="text-primary" />
                    </span>
                  )}
                  <Badge variant={isStandalone ? "info" : "warning"}>
                    {(() => {
                      const et = reg.event?.edition?.editionType;
                      if (et === "bourse") return m.admin_edition_type_bourse();
                      if (et === "capsule_exchange") return m.admin_edition_type_capsule_exchange();
                      return m.admin_edition_type_festival();
                    })()}
                  </Badge>
                </div>
                <div className="text-subtle text-sm">{reg.person.email}</div>
                {!isStandalone && reg.orderItems.length > 0 && (
                  <div className="text-highlight text-sm">
                    <Icon icon={ShoppingCartIcon} className="me-1" />
                    {reg.orderItems.filter((o) => o.delivered).length}/{reg.orderItems.length}{" "}
                    {m.admin_order_items()}
                  </div>
                )}
              </>
            );
          },
        }),
        columnHelper.accessor((row) => row.event?.title ?? row.eventId, {
          id: "event",
          header: m.admin_event_label(),
          cell: ({ getValue }) => <span className="text-sm">{String(getValue())}</span>,
          meta: { tdClassName: "hidden md:table-cell" },
        }),
        columnHelper.accessor("guestCount", {
          header: m.admin_guests_count(),
        }),
        columnHelper.accessor("status", {
          header: m.admin_status_label(),
          cell: ({ getValue }) => (
            <Badge variant={statusBadgeVariant(getValue())}>{statusLabel(getValue())}</Badge>
          ),
        }),
        columnHelper.accessor("paymentStatus", {
          header: m.admin_payment_label(),
          cell: ({ getValue }) => (
            <Badge variant={paymentBadgeVariant(getValue())}>{paymentLabel(getValue())}</Badge>
          ),
          meta: { tdClassName: "hidden lg:table-cell" },
        }),
        columnHelper.accessor("checkedIn", {
          header: m.admin_check_in_title(),
          cell: ({ row }) => {
            const reg = row.original;
            const isStandalone = isStandaloneRegistration(reg);
            return (
              <>
                {reg.checkedIn ? (
                  <Badge variant="success">
                    <Icon icon={CircleCheckIcon} className="me-1" />
                    {m.admin_checked_in()}
                  </Badge>
                ) : (
                  <Badge variant="secondary">{m.admin_not_checked_in()}</Badge>
                )}
                {!isStandalone && reg.strapIssued && (
                  <Badge variant="info" className="ms-1" title={m.admin_strap_issued()}>
                    <Icon icon={ContactRoundIcon} />
                    <span className="sr-only">{m.admin_strap_issued()}</span>
                  </Badge>
                )}
              </>
            );
          },
          meta: { tdClassName: "hidden md:table-cell" },
        }),
        columnHelper.display({
          id: "table",
          header: m.admin_tables_tab(),
          enableSorting: false,
          cell: ({ row }) => {
            const reg = row.original;
            const isStandalone = isStandaloneRegistration(reg);
            return (reg.allocations?.length ?? 0) > 1 ? (
              <span>
                {reg.allocations?.length} {m.admin_tables_tab()}
              </span>
            ) : isStandalone && !(reg.bookedTableQuantity ?? 0) ? (
              <span className="text-subtle text-sm">—</span>
            ) : (
              <AdminSelect
                size="sm"
                className="bg-muted text-content border-input"
                value={reg.tableId ?? ""}
                onValueChange={(e) => handleAssignTable(reg.id, e)}
                aria-label={m.admin_action_assign_table()}
              >
                <AdminOption value="">{m.admin_unassigned()}</AdminOption>
                {tables
                  .filter((t) => t.eventId === reg.eventId)
                  .map((t) => {
                    const ownAtTable =
                      reg.allocations?.find((a) => a.tableId === t.id)?.guestCount ?? 0;
                    const remaining = Math.max(
                      0,
                      t.capacity - (tableOccupancy.get(t.id) ?? 0) + ownAtTable,
                    );
                    return (
                      <AdminOption key={t.id} value={t.id}>
                        {t.name} ({m.admin_table_capacity_remaining({ count: remaining })})
                      </AdminOption>
                    );
                  })}
              </AdminSelect>
            );
          },
          meta: { tdClassName: "hidden lg:table-cell" },
        }),
        columnHelper.display({
          id: "actions",
          header: m.admin_actions_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const reg = row.original;
            return (
              <div className="flex flex-wrap items-center gap-1 md:flex-nowrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onViewDetail(reg)}
                  title={m.admin_view_edit_booking()}
                  aria-label={`${m.admin_view_edit_booking()}: ${reg.person.name}`}
                >
                  <Icon icon={PencilIcon} />
                </Button>
                {reg.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={() => onUpdateStatus(reg.id, "confirmed")}
                    title={m.admin_action_confirm()}
                    aria-label={m.admin_action_confirm()}
                  >
                    <Icon icon={CheckIcon} />
                  </Button>
                )}
                {!reg.checkedIn && reg.status !== "cancelled" && (
                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={() => handleCheckIn(reg.id)}
                    disabled={!isOnline || processingIds.has(reg.id)}
                    title={m.admin_mark_checked_in()}
                    aria-label={m.admin_mark_checked_in()}
                  >
                    <Icon icon={LogInIcon} />
                    <span>{m.admin_mark_checked_in()}</span>
                  </Button>
                )}
                {reg.checkedIn && !reg.strapIssued && !isStandaloneRegistration(reg) && (
                  <Button
                    size="sm"
                    variant="outline-info"
                    onClick={() => handleIssueStrap(reg.id)}
                    disabled={!isOnline || processingIds.has(reg.id)}
                    title={m.admin_issue_strap()}
                    aria-label={m.admin_issue_strap()}
                  >
                    <Icon icon={ContactRoundIcon} />
                    <span>{m.admin_issue_strap()}</span>
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline" size="sm" />}
                    id={`reg-more-${reg.id}`}
                    aria-label={m.admin_more_actions_for({ name: reg.person.name })}
                  >
                    <EllipsisIcon className="size-4" aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    finalFocus={() => document.getElementById(`reg-more-${reg.id}`) ?? false}
                  >
                    {reg.checkedIn && (
                      <DropdownMenuItem
                        disabled={!isOnline || processingIds.has(reg.id)}
                        onClick={() => void handleCheckIn(reg.id, false)}
                      >
                        {m.admin_undo_check_in()}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onViewDetail(reg)}>
                      {m.admin_view_edit_booking()}
                    </DropdownMenuItem>
                    {reg.status !== "cancelled" && (
                      <DropdownMenuItem onClick={() => setQrTargetId(reg.id)}>
                        <QrCodeIcon className="size-4" aria-hidden="true" />
                        {m.admin_qr_code()}
                      </DropdownMenuItem>
                    )}
                    {reg.status !== "cancelled" && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onUpdateStatus(reg.id, "cancelled")}
                      >
                        <XIcon className="size-4" aria-hidden="true" />
                        {m.admin_action_cancel()}
                      </DropdownMenuItem>
                    )}
                    {reg.paymentStatus !== "paid" && (
                      <DropdownMenuItem
                        disabled={processingIds.has(reg.id)}
                        onClick={() => void handleRecordPayment(reg.id)}
                      >
                        <EuroIcon className="size-4" aria-hidden="true" />
                        {m.admin_action_mark_paid()}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          },
        }),
      ]),
    [
      allContactPersonIds,
      tables,
      tableOccupancy,
      handleAssignTable,
      onViewDetail,
      onUpdateStatus,
      handleCheckIn,
      handleIssueStrap,
      handleRecordPayment,
      isOnline,
      processingIds,
    ],
  );

  const columns = useMemo(
    () => columnHelper.columns([selectColumn, ...dataColumns]),
    [selectColumn, dataColumns],
  );

  const hasActiveRegistrationFilters =
    q.trim().length > 0 ||
    filter !== "all" ||
    allocationFilter !== "" ||
    activeEditionOnly ||
    dateFilter !== "all" ||
    editionFilter !== "all";

  const handleClearRegistrationFilters = useCallback(() => {
    setQ("");
    setDebouncedQ("");
    debouncedQRef.current = "";
    onFilterChange("all");
    setAllocationFilter("");
    setActiveEditionOnly(false);
    setDateFilter("all");
    setEditionFilter("all");
    setPage(1);
    clearSelection();
  }, [onFilterChange, clearSelection]);

  // The hall-layout column only has something to choose while a floor plan has tables, so it
  // starts hidden until then. It also frees the width the actions column needs on a laptop or
  // tablet; an explicit choice in the Columns menu always wins.
  const effectiveColumnVisibility = useMemo<ColumnVisibilityState>(
    () => hideColumnUntilUsed(columnVisibility, "table", tables.length > 0),
    [columnVisibility, tables.length],
  );
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

  // Built from every registration, not the current page: these counts are a
  // property of the event, so they must not shift when someone searches,
  // filters, or pages.
  //
  // The counts themselves come from GET /api/events/checkin-stats — the endpoint
  // built for exactly this, and the one the Android entrance display reads — so
  // both surfaces report the same numbers, counted server-side over every
  // registration rather than over whatever this client happens to hold. The
  // local tally supplies active-edition counts until the query settles; the
  // server also carries titles so historical events need no registration load.
  const eventCapacityStats = useMemo(() => {
    const statsByEvent = new Map<string, { checkedIn: number; total: number; title: string }>();

    for (const registration of registrations) {
      if (registration.status === "cancelled") continue;
      if (!registration.eventId) continue;
      const existing = statsByEvent.get(registration.eventId);
      const guestCount = Math.max(0, registration.guestCount ?? 0);
      const checkedInGuests = registration.checkedIn ? guestCount : 0;
      if (existing) {
        existing.checkedIn += checkedInGuests;
        existing.total += guestCount;
        if (existing.title === registration.eventId && registration.event?.title) {
          existing.title = registration.event.title;
        }
      } else {
        statsByEvent.set(registration.eventId, {
          checkedIn: checkedInGuests,
          total: guestCount,
          title: registration.event?.title ?? registration.eventId,
        });
      }
    }

    for (const serverStats of checkInStatsQuery.data ?? []) {
      const existing = statsByEvent.get(serverStats.eventId);
      statsByEvent.set(serverStats.eventId, {
        checkedIn: serverStats.checkedIn,
        total: serverStats.total,
        title: serverStats.eventTitle ?? existing?.title ?? serverStats.eventId,
      });
    }

    return [...statsByEvent.entries()]
      .map(([eventId, stats]) => ({ eventId, ...stats }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [registrations, checkInStatsQuery.data]);

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
        [m.admin_event_label()]: reg.event?.title ?? reg.eventId,
        [m.admin_guests_count()]: reg.guestCount,
        [m.admin_status_label()]: reg.status,
        [m.admin_payment_label()]: reg.paymentStatus,
        [m.admin_check_in_title()]: reg.checkedIn ? m.admin_value_yes() : m.admin_value_no(),
        [m.admin_created_at()]: reg.createdAt,
        [m.order_questions_heading()]: (reg.orderAnswers ?? [])
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
  }, [fetchAllMatchingRegistrations]);

  const handleExportEventCsv = useCallback(
    async (eventId: string) => {
      setEventExportError(null);
      setExportingEventId(eventId);
      try {
        await downloadRegistrationsCsv(authHeaders, eventId);
      } catch (err) {
        devError("Failed to export guest list", err);
        setEventExportError(apiErrorMessage(err, m.admin_registrations_export_event_csv_error()));
      } finally {
        setExportingEventId(null);
      }
    },
    [authHeaders],
  );

  // Selecting a whole page whose filters match more than fits on it offers a
  // Gmail-style "select all N matching" expansion. `selectedIds` becomes the
  // real, materialized set of every matching id (bounded the same way as any
  // other full-set fetch) rather than a lazily-resolved scope, so everything
  // downstream (the confirm dialog's count, execution) works unchanged.
  const handleSelectAllMatching = useCallback(async () => {
    setIsSelectingAllMatching(true);
    setSelectAllMatchingError(null);
    try {
      const matching = await fetchAllMatchingRegistrations();
      setSelectionRecords(new Map(matching.map((record) => [record.id, record])));
      setSelectedIds(new Set(matching.map((r) => r.id)));
      setSelectAllMatchingActive(true);
    } catch (err) {
      devError("Failed to select all matching registrations", err);
      setSelectAllMatchingError(apiErrorMessage(err, m.admin_error_load_data()));
    } finally {
      setIsSelectingAllMatching(false);
    }
  }, [fetchAllMatchingRegistrations]);

  const executeBulkAction = useCallback(async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setBulkInProgress(true);
    setBulkError(null);
    const ids = [...selectedIds];
    setBulkProgress({ done: 0, total: ids.length });
    let failedCount = 0;
    // Bounded concurrency: a "select all matching" batch can be a few hundred
    // ids, and firing them all as simultaneous requests is unkind to both the
    // browser and the server compared to the handful a single page ever had.
    for (let start = 0; start < ids.length; start += BULK_ACTION_BATCH_SIZE) {
      const batch = ids.slice(start, start + BULK_ACTION_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((id) => {
          if (bulkAction === "confirm") return Promise.resolve(onUpdateStatus(id, "confirmed"));
          if (bulkAction === "cancel") return Promise.resolve(onUpdateStatus(id, "cancelled"));
          if (bulkAction === "paid") return Promise.resolve(onRecordPayment(id));
          return Promise.resolve();
        }),
      );
      failedCount += results.filter((r) => r.status === "rejected").length;
      setBulkProgress({ done: Math.min(start + batch.length, ids.length), total: ids.length });
    }
    setBulkInProgress(false);
    setBulkProgress(null);
    setBulkAction(null);
    if (failedCount > 0) {
      setBulkError(m.admin_bulk_operations_failed({ failed: failedCount, total: ids.length }));
    } else {
      clearSelection();
    }
  }, [bulkAction, onRecordPayment, onUpdateStatus, selectedIds, clearSelection]);

  const selectedRecords = [...selectedIds]
    .map(
      (id) =>
        registrationsById.get(id) ??
        pageRegistrations.find((record) => record.id === id) ??
        selectionRecords.get(id),
    )
    .filter((record): record is Registration => record !== undefined);
  const selectedEvents = new Map<string, { title: string; count: number }>();
  for (const record of selectedRecords) {
    const previous = selectedEvents.get(record.eventId);
    selectedEvents.set(record.eventId, {
      title: `${record.event?.title ?? record.eventId}${record.event?.date ? ` · ${record.event.date}` : ""}`,
      count: (previous?.count ?? 0) + 1,
    });
  }

  return (
    <>
      <p
        role="status"
        className={attendanceFeedback ? "mb-2 text-sm text-success-text" : "sr-only"}
      >
        {attendanceFeedback ||
          `${pageRegistrations.filter((registration) => registration.checkedIn).length} ${m.admin_checked_in()}`}
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
              <span className="text-subtle text-sm">({statusCounts.all})</span>
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
          <AdminInput
            size="sm"
            type="search"
            placeholder={m.admin_search_person_placeholder()}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-muted text-content border-input max-w-72"
          />
          <Collapsible>
            <div className="flex flex-wrap items-center gap-2">
              <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
                {m.admin_registration_filters()}
              </CollapsibleTrigger>
              <span className="text-sm" role="status">
                {[
                  activeEditionOnly
                    ? m.admin_filter_active_edition()
                    : m.admin_filter_edition_all(),
                  editionFilter !== "all"
                    ? editionFilter === "festival"
                      ? m.admin_filter_edition_festivals()
                      : m.admin_filter_edition_standalone()
                    : null,
                  filter !== "all" ? statusLabel(filter) : null,
                  dateFilter === "today" ? m.admin_filter_today() : null,
                  allocationOptions.find((option) => option.key === allocationFilter)?.label,
                  q || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {hasActiveRegistrationFilters && (
                <Button variant="ghost" size="sm" onClick={handleClearRegistrationFilters}>
                  {m.admin_content_clear_filters()}
                </Button>
              )}
            </div>
            <CollapsibleContent>
              {/* Row 2: filters + search */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-subtle text-xs uppercase tracking-wide" aria-hidden="true">
                    {m.admin_filter_edition_caption()}
                  </span>
                  <div className="flex flex-wrap items-center gap-1 md:flex-nowrap">
                    <ToggleGroup
                      aria-label={m.admin_filter_edition_aria()}
                      variant="outline"
                      size="sm"
                      spacing={1}
                      value={[editionFilter]}
                      onValueChange={(values) => {
                        const value = values[0];
                        if (value === "all" || value === "festival" || value === "standalone")
                          changeEditionFilter(value);
                      }}
                    >
                      <ToggleGroupItem value="all">
                        {m.admin_filter_edition_all()} ({editionCounts.all})
                      </ToggleGroupItem>
                      <ToggleGroupItem value="festival">
                        {m.admin_filter_edition_festivals()} ({editionCounts.festival})
                      </ToggleGroupItem>
                      <ToggleGroupItem value="standalone">
                        {m.admin_filter_edition_standalone()} ({editionCounts.standalone})
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <Toggle
                      variant="outline"
                      size="sm"
                      pressed={activeEditionOnly}
                      onPressedChange={toggleActiveEditionOnly}
                    >
                      {m.admin_filter_active_edition()}: {editionDisplayNameWithType(activeEdition)}{" "}
                      ({editionCounts.active})
                    </Toggle>
                  </div>
                  {allocationOptions.length > 0 && (
                    <AdminSelect
                      size="sm"
                      className="bg-muted text-content border-input max-w-50"

                      value={allocationFilter}
                      onValueChange={(e) => changeAllocationFilter(e)}
                      aria-label={m.admin_filter_allocation_aria()}
                    >
                      <AdminOption value="">{m.admin_all_allocations()}</AdminOption>
                      {allocationOptions.map((o) => (
                        <AdminOption key={o.key} value={o.key}>
                          {o.label}
                        </AdminOption>
                      ))}
                    </AdminSelect>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-subtle text-xs uppercase tracking-wide" aria-hidden="true">
                    {m.admin_filter_date_caption()}
                  </span>
                  <ToggleGroup
                    aria-label={m.admin_filter_date_aria()}
                    variant="outline"
                    size="sm"
                    value={dateFilter === "today" ? ["today"] : []}
                    onValueChange={toggleDateFilter}
                  >
                    <ToggleGroupItem value="today">
                      {m.admin_filter_today()} ({todayCount})
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-subtle text-xs uppercase tracking-wide" aria-hidden="true">
                    {m.admin_filter_status_caption()}
                  </span>
                  <ToggleGroup
                    aria-label={m.admin_filter_status_aria()}
                    variant="outline"
                    size="sm"
                    value={[filter]}
                    onValueChange={(values) => {
                      const value = values[0];
                      if (value === "all" || value === "pending" || value === "confirmed")
                        changeStatusFilter(value);
                    }}
                  >
                    <ToggleGroupItem value="all">
                      {m.admin_filter_all()} ({statusCounts.all})
                    </ToggleGroupItem>
                    <ToggleGroupItem value="pending">
                      {m.admin_filter_pending()} ({statusCounts.pending})
                    </ToggleGroupItem>
                    <ToggleGroupItem value="confirmed">
                      {m.admin_filter_confirmed()} ({statusCounts.confirmed})
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          {eventCapacityStats.length > 0 && (
            <Collapsible className="mt-2 pt-2 border-t border-subtle">
              <CollapsibleTrigger
                render={<Button variant="ghost" size="sm" />}
                className="h-auto max-w-full whitespace-normal text-left"
              >
                {m.admin_event_checkin_summary({
                  checkedIn: eventCapacityStats.reduce((sum, event) => sum + event.checkedIn, 0),
                  total: eventCapacityStats.reduce((sum, event) => sum + event.total, 0),
                })}
                <ChevronDownIcon className="size-4 shrink-0" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent keepMounted>
                <div className="flex flex-col gap-2">
                  {eventCapacityStats.map((eventStats) => {
                    const checkInPercent =
                      eventStats.total > 0 ? (eventStats.checkedIn / eventStats.total) * 100 : 0;

                    return (
                      <div key={eventStats.eventId}>
                        <div className="flex justify-between gap-2 text-sm mb-1 flex-wrap">
                          <span className="text-subtle truncate">
                            {eventCapacityStats.length > 1 && (
                              <span className="font-semibold text-content me-2">
                                {eventStats.title}
                              </span>
                            )}
                            {m.admin_checked_in()}: {eventStats.checkedIn}/{eventStats.total}{" "}
                            {m.admin_guests_count()}
                          </span>
                          <span className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="py-0 px-1"
                              disabled={exportingEventId === eventStats.eventId}
                              onClick={() => void handleExportEventCsv(eventStats.eventId)}
                              title={m.admin_registrations_export_event_csv()}
                              aria-label={m.admin_registrations_export_event_csv_for({
                                event: eventStats.title,
                              })}
                            >
                              <Icon icon={FileSpreadsheetIcon} />
                            </Button>
                          </span>
                        </div>
                        <Progress
                          value={checkInPercent}
                          aria-label={`${eventStats.title}: ${eventStats.checkedIn}/${eventStats.total} ${m.admin_checked_in()}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
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
            <div
              id="registration-bulk-actions"
              role="region"
              aria-label={m.admin_bulk_selected({ count: selectedIds.size })}
              tabIndex={-1}
              className="mt-2 pt-2 border-t border-subtle"
            >
              {canExpandSelectionToAllMatching && (
                <div className="flex items-center gap-2 flex-wrap text-sm text-subtle mb-2">
                  <span>
                    {m.admin_bulk_select_page_notice({ count: pageRegistrations.length })}
                  </span>
                  <Button
                    size="sm"
                    variant="link"
                    className="p-0"
                    onClick={() => void handleSelectAllMatching()}
                    disabled={isSelectingAllMatching}
                  >
                    {isSelectingAllMatching && <Spinner size="sm" aria-hidden="true" />}
                    {m.admin_bulk_select_all_matching({ total })}
                  </Button>
                </div>
              )}
              {selectAllMatchingError && (
                <Alert
                  role="alert"
                  aria-live="assertive"
                  variant="danger"
                  className="py-1 mb-2"
                  onClose={() => setSelectAllMatchingError(null)}
                >
                  {selectAllMatchingError}
                </Alert>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span role="status" className="text-subtle text-sm">
                  {selectAllMatchingActive
                    ? m.admin_bulk_all_matching_selected({ total: selectedIds.size })
                    : m.admin_bulk_selected({ count: selectedIds.size })}
                </span>
                <Button
                  size="sm"
                  variant="outline-success"
                  onClick={() => setBulkAction("confirm")}
                >
                  {m.admin_bulk_confirm()}
                </Button>
                <Button size="sm" variant="outline-danger" onClick={() => setBulkAction("cancel")}>
                  {m.admin_bulk_cancel()}
                </Button>
                <Button size="sm" variant="outline-info" onClick={() => setBulkAction("paid")}>
                  {m.admin_bulk_mark_paid()}
                </Button>
                <Button
                  size="sm"
                  variant="link"
                  className="text-subtle ms-auto p-0"
                  onClick={clearSelection}
                >
                  {m.admin_bulk_clear()}
                </Button>
              </div>
            </div>
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
                            "guestCount",
                            "status",
                            "paymentStatus",
                            "checkedIn",
                            "actions",
                          ].includes(cell.column.id),
                        )
                        .map((cell) => (
                          <div key={cell.id}>
                            {["guestCount", "status", "paymentStatus"].includes(cell.column.id) &&
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

      <Dialog
        open={qrTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setQrTargetId(null);
        }}
      >
        <DialogContent admin>
          <DialogHeader>
            <DialogTitle>
              {m.admin_qr_code()} — {qrRegistration?.person.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-4 text-center">
            <p>{qrRegistration?.event?.title ?? qrRegistration?.eventId}</p>
            <p>{m.admin_qr_scan_info()}</p>
            {qrRegistration?.status === "cancelled" && (
              <Alert variant="warning">{m.admin_status_cancelled()}</Alert>
            )}
            {qrDetailQuery.isPending && <Spinner aria-label={m.admin_loading()} />}
            {qrDetailQuery.isError && (
              <Alert variant="danger">
                {apiErrorMessage(qrDetailQuery.error, m.admin_error_load_data())}
              </Alert>
            )}
            {qrDetailQuery.data?.status === "cancelled" &&
              qrRegistration?.status !== "cancelled" && (
                <Alert variant="warning">{m.admin_status_cancelled()}</Alert>
              )}
            {!qrDetailQuery.isError &&
              qrDetailQuery.data?.checkInToken &&
              qrDetailQuery.data.status !== "cancelled" &&
              qrRegistration?.status !== "cancelled" && (
                <div className="inline-block rounded-md bg-white p-4">
                  <QRCodeSVG
                    role="img"
                    aria-label={m.admin_qr_code()}
                    value={`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/check-in?id=${encodeURIComponent(qrDetailQuery.data.id)}#token=${encodeURIComponent(qrDetailQuery.data.checkInToken)}`}
                    size={180}
                    level="M"
                  />
                </div>
              )}
          </div>
        </DialogContent>
      </Dialog>
      <RegistrationCreateModal
        show={showCreateModal}
        authHeaders={authHeaders}
        onSaved={onAddRegistration}
        onOpenBooking={(registration) => {
          setShowCreateModal(false);
          onViewDetail(registration);
        }}
        onHide={() => setShowCreateModal(false)}
      />

      {/* Bulk action confirmation */}
      <Dialog
        open={bulkAction !== null}
        onOpenChange={(open) => {
          if (!open) setBulkAction(null);
        }}
      >
        <DialogContent admin size="default">
          <DialogHeader>
            <DialogTitle>
              {bulkAction === "confirm" && m.admin_bulk_confirm()}
              {bulkAction === "cancel" && m.admin_bulk_cancel()}
              {bulkAction === "paid" && m.admin_bulk_mark_paid()}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {m.admin_bulk_confirm_action({ count: selectedIds.size })}
            <ul className="my-3 space-y-1">
              {[...selectedEvents].map(([id, event]) => (
                <li key={id}>
                  {event.title}: {event.count}
                </li>
              ))}
            </ul>
            <Collapsible>
              <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
                {m.admin_bulk_selected({ count: selectedIds.size })}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul
                  tabIndex={0}
                  aria-label={m.admin_bulk_selected({ count: selectedIds.size })}
                  className="mt-2 max-h-48 overflow-y-auto space-y-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {selectedRecords.map((record) => (
                    <li key={record.id}>
                      {record.person.name} · {record.event?.title ?? record.eventId}
                      {record.event?.date ? ` · ${record.event.date}` : ""} ·{" "}
                      {m.admin_guests_count()}: {record.guestCount}
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
            {bulkProgress && (
              <div className="mt-2 text-subtle text-sm">
                {m.admin_bulk_progress({ done: bulkProgress.done, total: bulkProgress.total })}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setBulkAction(null)}
              disabled={bulkInProgress}
            >
              {m.admin_action_cancel()}
            </Button>
            <Button
              variant={bulkAction === "cancel" ? "danger" : "default"}
              onClick={executeBulkAction}
              disabled={bulkInProgress}
            >
              {bulkInProgress && <Spinner size="sm" aria-hidden="true" />}
              {m.admin_action_confirm()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
