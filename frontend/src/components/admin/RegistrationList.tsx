import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type SortingState, type ColumnVisibilityState } from "@tanstack/react-table";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import ProgressBar from "react-bootstrap/ProgressBar";
import Table from "react-bootstrap/Table";
import { m } from "@/paraglide/messages";
import type { FloorTable } from "@/types/admin";
import type { PaymentStatus, Registration, RegistrationStatus } from "@/types/registration";
import { useAppTable, createAppColumnHelper } from "@/hooks/useAdminTable";
import { exportToCsv } from "@/utils/csvExport";
import RegistrationCreateModal from "./RegistrationCreateModal";
import { ColumnVisibilityDropdown } from "./ColumnVisibilityDropdown";
import { loadColVis, saveColVis } from "@/utils/columnVisibility";
import {
  downloadRegistrationsCsv,
  fetchEventCheckInStats,
  fetchRegistrationsPage,
  type RegistrationSortKey,
} from "@/utils/adminFetch";
import { queryKeys } from "@/utils/queryKeys";
import { toLocalDateKey } from "@/utils/dateUtils";
import { isRegistrationInEdition } from "@/utils/adminUtils";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import { useTodayKey } from "@/hooks/useTodayKey";
import { devError } from "@/utils/devLog";

const COL_VIS_KEY = "admin-col-vis-registrations";
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 50;

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
  exhibitors: AllocationRef[];
  filter: "all" | RegistrationStatus;
  onFilterChange: (filter: "all" | RegistrationStatus) => void;
  onUpdateStatus: (id: string, status: RegistrationStatus) => Promise<void>;
  onUpdatePayment: (id: string, paymentStatus: PaymentStatus) => Promise<void>;
  onAssignTable: (registrationId: string, tableId: string | undefined) => void;
  onViewDetail: (registration: Registration) => void;
  onCheckIn: (registrationId: string) => Promise<void>;
  onIssueStrap: (registrationId: string) => Promise<void>;
  onAddRegistration: (registration: Registration) => void;
  authHeaders: () => Record<string, string>;
  activeEdition: ActiveEdition;
  applyActiveEditionFilterRequest: number;
  sectionError?: string;
  onClearSectionError?: () => void;
}

function statusBadgeVariant(status: RegistrationStatus): string {
  switch (status) {
    case "confirmed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "warning";
  }
}

function paymentBadgeVariant(payment: PaymentStatus): string {
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
  exhibitors,
  filter,
  onFilterChange,
  onUpdateStatus,
  onUpdatePayment,
  onAssignTable,
  onViewDetail,
  onCheckIn,
  onIssueStrap,
  onAddRegistration,
  authHeaders,
  activeEdition,
  applyActiveEditionFilterRequest,
  sectionError,
  onClearSectionError,
}: RegistrationListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"confirm" | "cancel" | "paid" | null>(null);
  const [bulkInProgress, setBulkInProgress] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [exportingEventId, setExportingEventId] = useState<string | null>(null);
  const [eventExportError, setEventExportError] = useState<string | null>(null);
  const todayKey = useTodayKey();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const filterDefaultsAppliedRef = useRef<string | null>(null);
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
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const checkInStatsQuery = useQuery({
    queryKey: queryKeys.admin.eventCheckInStats,
    queryFn: () => fetchEventCheckInStats(authHeaders),
    staleTime: 30 * 1000,
    retry: false,
  });

  // Refs so column header/cell can read latest selection state without being in deps
  const selectedIdsRef = useRef<Set<string>>(selectedIds);
  selectedIdsRef.current = selectedIds;
  const pageRegistrationsRef = useRef<Registration[]>([]);

  const registrationPersonIds = useMemo(
    () => new Set(registrations.map((r) => r.personId)),
    [registrations],
  );

  const allContactPersonIds = useMemo(
    () =>
      new Set(exhibitors.map((e) => e.contactPersonId).filter((id): id is string => id !== null)),
    [exhibitors],
  );

  const allocationOptions: { key: string; label: string; personId: string }[] = useMemo(
    () =>
      exhibitors
        .filter((e) => e.contactPersonId && registrationPersonIds.has(e.contactPersonId))
        .map((e) => ({
          key: `e:${e.id}`,
          label: `${m.admin_allocation_exhibitor_label()}: ${e.name}`,
          personId: e.contactPersonId!,
        })),
    [exhibitors, registrationPersonIds],
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
    if (!isActiveEditionDay) return;
    if (filterDefaultsAppliedRef.current === activeEdition.id) return;
    filterDefaultsAppliedRef.current = activeEdition.id;
    setActiveEditionOnly(true);
    setPage(1);
  }, [activeEdition.id, isActiveEditionDay]);

  useEffect(() => {
    if (applyActiveEditionFilterRequest === 0) return;
    setActiveEditionOnly(true);
    setPage(1);
  }, [applyActiveEditionFilterRequest]);

  const changeStatusFilter = useCallback(
    (next: "all" | RegistrationStatus) => {
      onFilterChange(next);
      setPage(1);
    },
    [onFilterChange],
  );

  const changeAllocationFilter = useCallback((value: string) => {
    setAllocationFilter(value);
    setPage(1);
  }, []);

  const changeEditionFilter = useCallback((value: EditionFilter) => {
    setEditionFilter(value);
    setPage(1);
  }, []);

  const toggleActiveEditionOnly = useCallback(() => {
    setActiveEditionOnly((current) => !current);
    setPage(1);
  }, []);

  const toggleDateFilter = useCallback(() => {
    setDateFilter((current) => (current === "today" ? "all" : "today"));
    setPage(1);
  }, []);

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

  const pageQuery = useQuery({
    queryKey: queryKeys.admin.registrationsPage({
      q: debouncedQ,
      status: backendStatus,
      personId: filterPersonId ?? "",
      editionId: backendEditionId,
      eventDate: backendEventDate,
      editionCategory: backendEditionCategory,
      sort: backendSort ?? "",
      sortDir: backendSortDir,
      page,
      pageSize,
    }),
    queryFn: () =>
      fetchRegistrationsPage(authHeaders, {
        query: debouncedQ || undefined,
        status: backendStatus || undefined,
        personId: filterPersonId ?? undefined,
        editionId: backendEditionId || undefined,
        eventDate: backendEventDate || undefined,
        editionCategory: backendEditionCategory || undefined,
        sort: backendSort,
        sortDir: backendSort ? backendSortDir : undefined,
        page,
        limit: pageSize,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
    retry: false,
  });

  // The paginated fetch decides *which* registrations are on this page (and in
  // what order) — but for the actual row data we prefer whatever the live-synced
  // full collection (the `registrations` prop) already holds, so a check-in or
  // table assignment made elsewhere in the admin UI shows up on this page
  // instantly instead of waiting for the next paginated refetch.
  const registrationsById = useMemo(
    () => new Map(registrations.map((r) => [r.id, r] as const)),
    [registrations],
  );
  const pageRegistrations = useMemo(
    () => (pageQuery.data?.registrations ?? []).map((r) => registrationsById.get(r.id) ?? r),
    [pageQuery.data, registrationsById],
  );

  const handleAssignTable = useCallback(
    (registrationId: string, tableId: string) => {
      onAssignTable(registrationId, tableId || undefined);
    },
    [onAssignTable],
  );

  const statusCounts = useMemo(
    () => ({
      all: registrations.length,
      pending: registrations.filter((r) => r.status === "pending").length,
      confirmed: registrations.filter((r) => r.status === "confirmed").length,
    }),
    [registrations],
  );

  const editionCounts = useMemo(
    () => ({
      all: registrations.length,
      festival: registrations.filter((registration) => !isStandaloneRegistration(registration))
        .length,
      standalone: registrations.filter((registration) => isStandaloneRegistration(registration))
        .length,
      active: registrations.filter((registration) =>
        isRegistrationInEdition(registration, activeEdition.id),
      ).length,
    }),
    [activeEdition.id, registrations],
  );

  const todayCount = useMemo(
    () => registrations.filter((registration) => registration.event?.date === todayKey).length,
    [registrations, todayKey],
  );

  // Isolated memo so that selectedIds changes only rebuild the select column, not all columns
  const selectColumn = useMemo(
    () =>
      columnHelper.display({
        id: "select",
        header: () => {
          const allIds = pageRegistrationsRef.current.map((r) => r.id);
          const allSelected =
            allIds.length > 0 && allIds.every((id) => selectedIdsRef.current.has(id));
          return (
            <Form.Check
              type="checkbox"
              checked={allSelected}
              onChange={() => {
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
              className="m-0"
            />
          );
        },
        cell: ({ row }) => (
          <Form.Check
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={() => {
              setSelectedIds((prev) => {
                const next = new Set<string>(prev);
                if (next.has(row.id)) next.delete(row.id);
                else next.add(row.id);
                return next;
              });
            }}
            aria-label={`Select registration for ${row.original.person.name}`}
            className="m-0"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        meta: { tdClassName: "align-middle" },
      }),
    [selectedIds],
  );

  const handleCheckIn = useCallback(
    async (id: string) => {
      if (processingIds.has(id)) return;
      setProcessingIds((prev) => new Set(prev).add(id));
      try {
        await onCheckIn(id);
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [onCheckIn, processingIds],
  );

  const handleIssueStrap = useCallback(
    async (id: string) => {
      if (processingIds.has(id)) return;
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
    [onIssueStrap, processingIds],
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
                <div className="fw-semibold d-flex align-items-center gap-1">
                  {reg.person.name}
                  {isLinked && (
                    <i
                      className="bi bi-person-badge text-info"
                      title={m.admin_linked_exhibitor_title()}
                      aria-label={m.admin_allocation_contact_aria()}
                    />
                  )}
                  <Badge bg={isStandalone ? "info" : "warning"} text="dark">
                    {(() => {
                      const et = reg.event?.edition?.editionType;
                      if (et === "bourse") return m.admin_edition_type_bourse();
                      if (et === "capsule_exchange") return m.admin_edition_type_capsule_exchange();
                      return m.admin_edition_type_festival();
                    })()}
                  </Badge>
                </div>
                <div className="text-secondary small">{reg.person.email}</div>
                {!isStandalone && reg.orderItems.length > 0 && (
                  <div className="text-warning small">
                    <i className="bi bi-cart-fill me-1" aria-hidden="true" />
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
          cell: ({ getValue }) => <span className="small">{String(getValue())}</span>,
          meta: { tdClassName: "d-none d-md-table-cell" },
        }),
        columnHelper.accessor("guestCount", {
          header: m.admin_guests_count(),
        }),
        columnHelper.accessor("status", {
          header: m.admin_status_label(),
          cell: ({ getValue }) => (
            <Badge bg={statusBadgeVariant(getValue())}>{statusLabel(getValue())}</Badge>
          ),
        }),
        columnHelper.accessor("paymentStatus", {
          header: m.admin_payment_label(),
          cell: ({ getValue }) => (
            <Badge bg={paymentBadgeVariant(getValue())}>{paymentLabel(getValue())}</Badge>
          ),
          meta: { tdClassName: "d-none d-lg-table-cell" },
        }),
        columnHelper.accessor("checkedIn", {
          header: m.admin_check_in_title(),
          cell: ({ row }) => {
            const reg = row.original;
            const isStandalone = isStandaloneRegistration(reg);
            return (
              <>
                {reg.checkedIn ? (
                  <Badge bg="success">
                    <i className="bi bi-check-circle-fill me-1" aria-hidden="true" />
                    {m.admin_checked_in()}
                  </Badge>
                ) : (
                  <Badge bg="secondary">{m.admin_not_checked_in()}</Badge>
                )}
                {!isStandalone && reg.strapIssued && (
                  <Badge bg="info" className="ms-1">
                    <i className="bi bi-person-badge-fill" aria-hidden="true" />
                  </Badge>
                )}
              </>
            );
          },
          meta: { tdClassName: "d-none d-md-table-cell" },
        }),
        columnHelper.display({
          id: "table",
          header: m.admin_tables_tab(),
          enableSorting: false,
          cell: ({ row }) => {
            const reg = row.original;
            const isStandalone = isStandaloneRegistration(reg);
            return isStandalone ? (
              <span className="text-secondary small">—</span>
            ) : (
              <Form.Select
                size="sm"
                className="bg-dark text-light border-secondary"
                value={reg.tableId ?? ""}
                onChange={(e) => handleAssignTable(reg.id, e.target.value)}
                aria-label={m.admin_action_assign_table()}
              >
                <option value="">{m.admin_unassigned()}</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.capacity})
                  </option>
                ))}
              </Form.Select>
            );
          },
          meta: { tdClassName: "d-none d-lg-table-cell" },
        }),
        columnHelper.display({
          id: "actions",
          header: m.admin_actions_label(),
          enableSorting: false,
          cell: ({ row }) => {
            const reg = row.original;
            const hasMoreActions = reg.status !== "cancelled" || reg.paymentStatus !== "paid";
            return (
              <div className="d-flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline-light"
                  onClick={() => onViewDetail(reg)}
                  title={m.admin_qr_code()}
                  aria-label={m.admin_qr_code()}
                >
                  <i className="bi bi-qr-code" aria-hidden="true" />
                </Button>
                {reg.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={() => onUpdateStatus(reg.id, "confirmed")}
                    title={m.admin_action_confirm()}
                    aria-label={m.admin_action_confirm()}
                  >
                    <i className="bi bi-check-lg" aria-hidden="true" />
                  </Button>
                )}
                {!reg.checkedIn && (
                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={() => handleCheckIn(reg.id)}
                    disabled={processingIds.has(reg.id)}
                    title={m.admin_mark_checked_in()}
                    aria-label={m.admin_mark_checked_in()}
                  >
                    <i className="bi bi-box-arrow-in-right" aria-hidden="true" />
                  </Button>
                )}
                {reg.checkedIn && !reg.strapIssued && !isStandaloneRegistration(reg) && (
                  <Button
                    size="sm"
                    variant="outline-info"
                    onClick={() => handleIssueStrap(reg.id)}
                    disabled={processingIds.has(reg.id)}
                    title={m.admin_issue_strap()}
                    aria-label={m.admin_issue_strap()}
                  >
                    <i className="bi bi-person-badge" aria-hidden="true" />
                  </Button>
                )}
                {hasMoreActions && (
                  <Dropdown>
                    <Dropdown.Toggle
                      size="sm"
                      variant="outline-secondary"
                      id={`reg-more-${reg.id}`}
                      aria-label={m.admin_more_actions_for({ name: reg.person.name })}
                    >
                      <i className="bi bi-three-dots" aria-hidden="true" />
                    </Dropdown.Toggle>
                    <Dropdown.Menu variant="dark">
                      {reg.status !== "cancelled" && (
                        <Dropdown.Item
                          className="text-danger"
                          onClick={() => onUpdateStatus(reg.id, "cancelled")}
                        >
                          <i className="bi bi-x-lg me-2" aria-hidden="true" />
                          {m.admin_action_cancel()}
                        </Dropdown.Item>
                      )}
                      {reg.paymentStatus !== "paid" && (
                        <Dropdown.Item onClick={() => onUpdatePayment(reg.id, "paid")}>
                          <i className="bi bi-currency-euro me-2" aria-hidden="true" />
                          {m.admin_action_mark_paid()}
                        </Dropdown.Item>
                      )}
                    </Dropdown.Menu>
                  </Dropdown>
                )}
              </div>
            );
          },
        }),
      ]),
    [
      allContactPersonIds,
      tables,
      handleAssignTable,
      onViewDetail,
      onUpdateStatus,
      onUpdatePayment,
      handleCheckIn,
      handleIssueStrap,
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
  }, [onFilterChange]);

  const table = useAppTable(
    {
      data: pageRegistrations,
      columns,
      state: { sorting, columnVisibility },
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
  pageRegistrationsRef.current = table.getRowModel().rows.map((r) => r.original);

  // Built from every registration, not the current page: capacity is a property
  // of the event, so it must not shift when someone searches, filters, or pages.
  //
  // The counts themselves come from GET /api/events/checkin-stats — the endpoint
  // built for exactly this, and the one the Android entrance display reads — so
  // both surfaces report the same numbers, counted server-side over every
  // registration rather than over whatever this client happens to hold. The
  // local tally below still supplies each event's title and capacity, which the
  // stats endpoint doesn't carry, and stands in for the counts until the query
  // settles (or if it fails), since it measures the same thing.
  const eventCapacityStats = useMemo(() => {
    const statsByEvent = new Map<
      string,
      { checkedIn: number; total: number; title: string; maxCapacity?: number }
    >();

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
        if (existing.maxCapacity === undefined && registration.event?.maxCapacity !== undefined) {
          existing.maxCapacity = registration.event.maxCapacity;
        }
      } else {
        statsByEvent.set(registration.eventId, {
          checkedIn: checkedInGuests,
          total: guestCount,
          title: registration.event?.title ?? registration.eventId,
          maxCapacity: registration.event?.maxCapacity,
        });
      }
    }

    for (const serverStats of checkInStatsQuery.data ?? []) {
      const existing = statsByEvent.get(serverStats.eventId);
      statsByEvent.set(serverStats.eventId, {
        checkedIn: serverStats.checkedIn,
        total: serverStats.total,
        title: existing?.title ?? serverStats.eventId,
        maxCapacity: existing?.maxCapacity,
      });
    }

    return [...statsByEvent.entries()]
      .map(([eventId, stats]) => ({ eventId, ...stats }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [registrations, checkInStatsQuery.data]);

  const handleExportCsv = useCallback(() => {
    const rows = table.getRowModel().rows.map(({ original: reg }) => ({
      [m.registration_name()]: reg.person.name,
      [m.registration_email()]: reg.person.email,
      [m.registration_phone()]: reg.person.phone,
      [m.admin_event_label()]: reg.event?.title ?? reg.eventId,
      [m.admin_guests_count()]: reg.guestCount,
      [m.admin_status_label()]: reg.status,
      [m.admin_payment_label()]: reg.paymentStatus,
      [m.admin_check_in_title()]: reg.checkedIn ? m.admin_value_yes() : m.admin_value_no(),
      [m.admin_created_at()]: reg.createdAt,
    }));
    exportToCsv("registrations.csv", rows);
  }, [table]);

  const handleExportEventCsv = useCallback(
    async (eventId: string) => {
      setEventExportError(null);
      setExportingEventId(eventId);
      try {
        await downloadRegistrationsCsv(authHeaders, eventId);
      } catch (err) {
        devError("Failed to export guest list", err);
        setEventExportError(
          err instanceof Error ? err.message : m.admin_registrations_export_event_csv_error(),
        );
      } finally {
        setExportingEventId(null);
      }
    },
    [authHeaders],
  );

  const executeBulkAction = useCallback(async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setBulkInProgress(true);
    setBulkError(null);
    const ids = [...selectedIds];
    const results = await Promise.allSettled(
      ids.map((id) => {
        if (bulkAction === "confirm") return Promise.resolve(onUpdateStatus(id, "confirmed"));
        if (bulkAction === "cancel") return Promise.resolve(onUpdateStatus(id, "cancelled"));
        if (bulkAction === "paid") return Promise.resolve(onUpdatePayment(id, "paid"));
        return Promise.resolve();
      }),
    );
    const failedCount = results.filter((r) => r.status === "rejected").length;
    setBulkInProgress(false);
    setBulkAction(null);
    if (failedCount > 0) {
      setBulkError(m.admin_bulk_operations_failed({ failed: failedCount, total: ids.length }));
    } else {
      setSelectedIds(new Set());
    }
  }, [bulkAction, onUpdatePayment, onUpdateStatus, selectedIds]);

  const total = pageQuery.data?.total ?? 0;
  const effectivePageSize = pageQuery.data?.limit ?? pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));
  const rangeFrom = total === 0 ? 0 : (page - 1) * effectivePageSize + 1;
  const rangeTo = Math.min(page * effectivePageSize, total);

  return (
    <>
      <Card bg="dark" text="white" border="secondary">
        <Card.Header className="pb-2">
          {/* Row 1: title + stats + add */}
          <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="fw-semibold">{m.admin_registrations_tab_header()}</span>
              <span className="text-secondary small">
                <Badge bg="warning" text="dark" className="me-1">
                  {statusCounts.pending}
                </Badge>
                {m.admin_filter_pending()}
                <Badge bg="success" className="mx-1">
                  {statusCounts.confirmed}
                </Badge>
                {m.admin_filter_confirmed()}
                <span className="ms-2 text-secondary">
                  · {statusCounts.all} {m.admin_filter_all()}
                </span>
              </span>
            </div>
            <div className="d-flex gap-2">
              <ColumnVisibilityDropdown table={table} tableId="registrations" />
              <Button variant="outline-secondary" size="sm" onClick={handleExportCsv}>
                <i className="bi bi-download me-1" aria-hidden="true" />
                {m.admin_export_csv()}
              </Button>
              <Button variant="outline-primary" size="sm" onClick={() => setShowCreateModal(true)}>
                <i className="bi bi-plus-lg me-1" aria-hidden="true" />
                {m.admin_add_registration()}
              </Button>
            </div>
          </div>
          {/* Row 2: filters + search */}
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <ButtonGroup size="sm">
              <Button
                variant={editionFilter === "all" ? "primary" : "outline-secondary"}
                onClick={() => changeEditionFilter("all")}
              >
                {m.admin_filter_edition_all()} ({editionCounts.all})
              </Button>
              <Button
                variant={editionFilter === "festival" ? "primary" : "outline-secondary"}
                onClick={() => changeEditionFilter("festival")}
              >
                {m.admin_filter_edition_festivals()} ({editionCounts.festival})
              </Button>
              <Button
                variant={editionFilter === "standalone" ? "primary" : "outline-secondary"}
                onClick={() => changeEditionFilter("standalone")}
              >
                {m.admin_filter_edition_standalone()} ({editionCounts.standalone})
              </Button>
              <Button
                variant={activeEditionOnly ? "primary" : "outline-secondary"}
                onClick={toggleActiveEditionOnly}
              >
                {m.admin_filter_active_edition()} ({editionCounts.active})
              </Button>
            </ButtonGroup>
            {allocationOptions.length > 0 && (
              <Form.Select
                size="sm"
                className="bg-dark text-light border-secondary"
                style={{ maxWidth: 200 }}
                value={allocationFilter}
                onChange={(e) => changeAllocationFilter(e.target.value)}
                aria-label={m.admin_filter_allocation_aria()}
              >
                <option value="">{m.admin_all_allocations()}</option>
                {allocationOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Form.Select>
            )}
            <ButtonGroup size="sm">
              <Button
                variant={dateFilter === "today" ? "primary" : "outline-secondary"}
                onClick={toggleDateFilter}
              >
                {m.admin_filter_today()} ({todayCount})
              </Button>
            </ButtonGroup>
            <ButtonGroup size="sm">
              <Button
                variant={filter === "all" ? "primary" : "outline-secondary"}
                onClick={() => changeStatusFilter("all")}
              >
                {m.admin_filter_all()} ({statusCounts.all})
              </Button>
              <Button
                variant={filter === "pending" ? "primary" : "outline-secondary"}
                onClick={() => changeStatusFilter("pending")}
              >
                {m.admin_filter_pending()} ({statusCounts.pending})
              </Button>
              <Button
                variant={filter === "confirmed" ? "primary" : "outline-secondary"}
                onClick={() => changeStatusFilter("confirmed")}
              >
                {m.admin_filter_confirmed()} ({statusCounts.confirmed})
              </Button>
            </ButtonGroup>
            <Form.Control
              size="sm"
              type="search"
              placeholder={m.admin_search_person_placeholder()}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-dark text-light border-secondary"
              style={{ maxWidth: 220 }}
            />
          </div>
          {eventCapacityStats.length > 0 && (
            <div className="mt-2 pt-2 border-top border-secondary">
              <div className="d-flex flex-column gap-2">
                {eventCapacityStats.map((eventStats) => {
                  const checkInPercent =
                    eventStats.total > 0 ? (eventStats.checkedIn / eventStats.total) * 100 : 0;
                  const isOverCapacity =
                    eventStats.maxCapacity != null &&
                    eventStats.maxCapacity > 0 &&
                    eventStats.total >= eventStats.maxCapacity;

                  return (
                    <div key={eventStats.eventId}>
                      <div className="d-flex justify-content-between gap-2 small mb-1 flex-wrap">
                        <span className="text-secondary text-truncate">
                          {eventCapacityStats.length > 1 && (
                            <span className="fw-semibold text-light me-2">{eventStats.title}</span>
                          )}
                          {m.admin_checked_in()}: {eventStats.checkedIn}/{eventStats.total}{" "}
                          {m.admin_guests_count()}
                        </span>
                        <span className="d-flex align-items-center gap-2">
                          {eventStats.maxCapacity && eventStats.maxCapacity > 0 && (
                            <span className={isOverCapacity ? "text-danger" : "text-secondary"}>
                              {m.event_capacity()}: {eventStats.total}/{eventStats.maxCapacity}
                            </span>
                          )}
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            className="py-0 px-1"
                            disabled={exportingEventId === eventStats.eventId}
                            onClick={() => void handleExportEventCsv(eventStats.eventId)}
                            title={m.admin_registrations_export_event_csv()}
                            aria-label={m.admin_registrations_export_event_csv_for({
                              event: eventStats.title,
                            })}
                          >
                            <i className="bi bi-file-earmark-spreadsheet" aria-hidden="true" />
                          </Button>
                        </span>
                      </div>
                      <ProgressBar
                        now={checkInPercent}
                        variant="success"
                        className="bg-secondary"
                        aria-label={`${eventStats.title}: ${eventStats.checkedIn}/${eventStats.total} ${m.admin_checked_in()}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {bulkError && (
            <Alert
              variant="danger"
              className="py-1 mt-2 mb-0"
              dismissible
              onClose={() => setBulkError(null)}
            >
              {bulkError}
            </Alert>
          )}
          {eventExportError && (
            <Alert
              variant="danger"
              className="py-1 mt-2 mb-0"
              dismissible
              onClose={() => setEventExportError(null)}
            >
              {eventExportError}
            </Alert>
          )}
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="d-flex align-items-center gap-2 mt-2 pt-2 border-top border-secondary flex-wrap">
              <span className="text-secondary small">
                {m.admin_bulk_selected({ count: selectedIds.size })}
              </span>
              <Button size="sm" variant="outline-success" onClick={() => setBulkAction("confirm")}>
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
                className="text-secondary ms-auto p-0"
                onClick={() => setSelectedIds(new Set())}
              >
                {m.admin_bulk_clear()}
              </Button>
            </div>
          )}
        </Card.Header>

        <Card.Body className="p-0">
          {sectionError && (
            <Alert variant="danger" dismissible className="m-3 mb-0" onClose={onClearSectionError}>
              {sectionError}
            </Alert>
          )}
          {pageQuery.isLoading ? (
            <p className="text-secondary text-center py-4 mb-0">
              <span
                className="spinner-border spinner-border-sm me-2"
                role="status"
                aria-hidden="true"
              />
              {m.admin_search_person_placeholder()}…
            </p>
          ) : pageQuery.isError ? (
            <p className="text-danger text-center py-4 mb-0">{m.admin_error_load_data()}</p>
          ) : table.getRowModel().rows.length === 0 ? (
            hasActiveRegistrationFilters ? (
              <div className="text-secondary text-center py-4 px-3">
                <p className="mb-2">{m.admin_no_registration_filter_matches()}</p>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={handleClearRegistrationFilters}
                >
                  {m.admin_content_clear_filters()}
                </Button>
              </div>
            ) : (
              <p className="text-secondary text-center py-4 mb-0">{m.admin_no_registrations()}</p>
            )
          ) : (
            <div className="table-responsive">
              <Table variant="dark" hover striped className="mb-0" size="sm">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        const canSort = header.column.getCanSort();
                        const sorted = header.column.getIsSorted();
                        return (
                          <th
                            key={header.id}
                            className={header.column.columnDef.meta?.tdClassName}
                            onClick={header.column.getToggleSortingHandler()}
                            onKeyDown={
                              canSort
                                ? (e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      header.column.getToggleSortingHandler()?.(e);
                                    }
                                  }
                                : undefined
                            }
                            role={canSort ? "button" : undefined}
                            tabIndex={canSort ? 0 : undefined}
                            aria-sort={
                              canSort
                                ? sorted === "asc"
                                  ? "ascending"
                                  : sorted === "desc"
                                    ? "descending"
                                    : "none"
                                : undefined
                            }
                            style={{
                              cursor: canSort ? "pointer" : "default",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <table.FlexRender header={header} />
                            {header.column.getCanSort() && (
                              <i
                                className={`bi ms-1 small ${
                                  header.column.getIsSorted() === "asc"
                                    ? "bi-arrow-up"
                                    : header.column.getIsSorted() === "desc"
                                      ? "bi-arrow-down"
                                      : "bi-arrow-down-up opacity-25"
                                }`}
                                aria-hidden="true"
                              />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className={cell.column.columnDef.meta?.tdClassName}>
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          {!pageQuery.isLoading && !pageQuery.isError && total > 0 && (
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 p-2 border-top border-secondary">
              <span className="text-secondary small">
                {m.admin_registrations_page_summary({ from: rangeFrom, to: rangeTo, total })}
              </span>
              <div className="d-flex align-items-center gap-2">
                <Form.Select
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  style={{ width: "auto" }}
                  value={pageSize}
                  onChange={(e) => changePageSize(Number(e.target.value))}
                  aria-label={m.admin_registrations_page_size_aria()}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </Form.Select>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  disabled={page <= 1 || pageQuery.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {m.admin_registrations_page_previous()}
                </Button>
                <span className="text-secondary small">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  disabled={page >= totalPages || pageQuery.isFetching}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {m.admin_registrations_page_next()}
                </Button>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>

      <RegistrationCreateModal
        show={showCreateModal}
        authHeaders={authHeaders}
        onSaved={(registration) => {
          onAddRegistration(registration);
          setShowCreateModal(false);
        }}
        onHide={() => setShowCreateModal(false)}
      />

      {/* Bulk action confirmation */}
      <Modal
        show={bulkAction !== null}
        onHide={() => setBulkAction(null)}
        centered
        dialogClassName="admin-dialog"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {bulkAction === "confirm" && m.admin_bulk_confirm()}
            {bulkAction === "cancel" && m.admin_bulk_cancel()}
            {bulkAction === "paid" && m.admin_bulk_mark_paid()}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>{m.admin_bulk_confirm_action({ count: selectedIds.size })}</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setBulkAction(null)} disabled={bulkInProgress}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            variant={bulkAction === "cancel" ? "danger" : "primary"}
            onClick={executeBulkAction}
            disabled={bulkInProgress}
          >
            {bulkInProgress && (
              <span
                className="spinner-border spinner-border-sm me-2"
                role="status"
                aria-hidden="true"
              />
            )}
            {m.admin_action_confirm()}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
