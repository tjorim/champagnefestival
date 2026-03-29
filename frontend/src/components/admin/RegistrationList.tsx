import { useCallback, useMemo, useRef, useState } from "react";
import { type FilterFn, type SortingState, type ColumnVisibilityState } from "@tanstack/react-table";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Table from "react-bootstrap/Table";
import { m } from "@/paraglide/messages";
import type { FloorTable } from "@/types/admin";
import type { PaymentStatus, Registration, RegistrationStatus } from "@/types/registration";
import {
  useAppTable,
  createAppColumnHelper,
  type AdminTableFeatures,
} from "@/hooks/useAdminTable";
import { exportToCsv } from "@/utils/csvExport";
import RegistrationCreateModal from "./RegistrationCreateModal";
import { ColumnVisibilityDropdown } from "./ColumnVisibilityDropdown";
import { loadColVis, saveColVis } from "@/utils/columnVisibility";

const COL_VIS_KEY = "admin-col-vis-registrations";

interface AllocationRef {
  id: number;
  name: string;
  contactPersonId: string | null;
}

type EditionFilter = "all" | "festival" | "standalone";

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
  onAddRegistration: (registration: Registration) => void;
  authHeaders: () => Record<string, string>;
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

const registrationGlobalFilter: FilterFn<AdminTableFeatures, Registration> = (
  row,
  _columnId,
  filterValue: string,
) => {
  const s = filterValue.toLowerCase();
  return (
    row.original.person.name.toLowerCase().includes(s) ||
    row.original.person.email.toLowerCase().includes(s)
  );
};
registrationGlobalFilter.autoRemove = (val: unknown) => !val || String(val) === "";

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
  onAddRegistration,
  authHeaders,
}: RegistrationListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [allocationFilter, setAllocationFilter] = useState("");
  const [editionFilter, setEditionFilter] = useState<EditionFilter>("all");
  const [q, setQ] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(
    () => loadColVis(COL_VIS_KEY),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"confirm" | "cancel" | "paid" | null>(null);
  const [bulkInProgress, setBulkInProgress] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Refs so column header/cell can read latest selection state without being in deps
  const selectedIdsRef = useRef<Set<string>>(selectedIds);
  selectedIdsRef.current = selectedIds;
  const preFilteredRef = useRef<Registration[]>([]);

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

  // Domain-level pre-filter (edition type, status, allocation) — text search handled by TanStack
  const preFiltered = useMemo(
    () =>
      registrations.filter((registration) => {
        if (filter !== "all" && registration.status !== filter) return false;
        if (filterPersonId && registration.person.id !== filterPersonId) return false;
        const standalone = isStandaloneRegistration(registration);
        if (editionFilter === "festival" && standalone) return false;
        if (editionFilter === "standalone" && !standalone) return false;
        return true;
      }),
    [registrations, filter, filterPersonId, editionFilter],
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
    }),
    [registrations],
  );

  // Isolated memo so that selectedIds changes only rebuild the select column, not all columns
  const selectColumn = useMemo(
    () =>
      columnHelper.display({
        id: "select",
        header: () => {
          const allIds = preFilteredRef.current.map((r) => r.id);
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

  const dataColumns = useMemo(
    () => columnHelper.columns([
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
              {!isStandalone && reg.preOrders.length > 0 && (
                <div className="text-warning small">
                  <i className="bi bi-cart-fill me-1" aria-hidden="true" />
                  {reg.preOrders.filter((o) => o.delivered).length}/{reg.preOrders.length}{" "}
                  {m.admin_pre_orders()}
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
          <Badge bg={statusBadgeVariant(getValue())}>
            {statusLabel(getValue())}
          </Badge>
        ),
      }),
      columnHelper.accessor("paymentStatus", {
        header: m.admin_payment_label(),
        cell: ({ getValue }) => (
          <Badge bg={paymentBadgeVariant(getValue())}>
            {paymentLabel(getValue())}
          </Badge>
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
        meta: { tdClassName: "d-none d-xl-table-cell" },
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
    [allContactPersonIds, tables, handleAssignTable, onViewDetail, onUpdateStatus, onUpdatePayment],
  );

  const columns = useMemo(
    () => columnHelper.columns([selectColumn, ...dataColumns]),
    [selectColumn, dataColumns],
  );

  const table = useAppTable(
    {
      data: preFiltered,
      columns,
      state: { sorting, globalFilter: q, columnVisibility },
      getRowId: (row) => row.id,
      onSortingChange: setSorting,
      onGlobalFilterChange: setQ,
      onColumnVisibilityChange: (updater) => {
        const next =
          typeof updater === "function" ? updater(columnVisibility) : updater;
        setColumnVisibility(next);
        saveColVis(COL_VIS_KEY, next);
      },
      globalFilterFn: registrationGlobalFilter,
    },
    (state) => ({
      sorting: state.sorting,
      globalFilter: state.globalFilter,
      columnVisibility: state.columnVisibility,
    }),
  );
  // Keep ref in sync with currently visible rows (respects text-search filter applied by TanStack).
  // Memoized so the .map() only runs when preFiltered, sorting, or query change.
  const visibleRegistrations = useMemo(
    () => table.getRowModel().rows.map((r) => r.original),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preFiltered, sorting, q],
  );
  preFilteredRef.current = visibleRegistrations;

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
                onClick={() => setEditionFilter("all")}
              >
                {m.admin_filter_edition_all()} ({editionCounts.all})
              </Button>
              <Button
                variant={editionFilter === "festival" ? "primary" : "outline-secondary"}
                onClick={() => setEditionFilter("festival")}
              >
                {m.admin_filter_edition_festivals()} ({editionCounts.festival})
              </Button>
              <Button
                variant={editionFilter === "standalone" ? "primary" : "outline-secondary"}
                onClick={() => setEditionFilter("standalone")}
              >
                {m.admin_filter_edition_standalone()} ({editionCounts.standalone})
              </Button>
            </ButtonGroup>
            {allocationOptions.length > 0 && (
              <Form.Select
                size="sm"
                className="bg-dark text-light border-secondary"
                style={{ maxWidth: 200 }}
                value={allocationFilter}
                onChange={(e) => setAllocationFilter(e.target.value)}
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
                variant={filter === "all" ? "primary" : "outline-secondary"}
                onClick={() => onFilterChange("all")}
              >
                {m.admin_filter_all()} ({statusCounts.all})
              </Button>
              <Button
                variant={filter === "pending" ? "primary" : "outline-secondary"}
                onClick={() => onFilterChange("pending")}
              >
                {m.admin_filter_pending()} ({statusCounts.pending})
              </Button>
              <Button
                variant={filter === "confirmed" ? "primary" : "outline-secondary"}
                onClick={() => onFilterChange("confirmed")}
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
          {bulkError && (
            <Alert variant="danger" className="py-1 mt-2 mb-0" dismissible onClose={() => setBulkError(null)}>
              {bulkError}
            </Alert>
          )}
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="d-flex align-items-center gap-2 mt-2 pt-2 border-top border-secondary flex-wrap">
              <span className="text-secondary small">
                {m.admin_bulk_selected({ count: selectedIds.size })}
              </span>
              <Button
                size="sm"
                variant="outline-success"
                onClick={() => setBulkAction("confirm")}
              >
                {m.admin_bulk_confirm()}
              </Button>
              <Button
                size="sm"
                variant="outline-danger"
                onClick={() => setBulkAction("cancel")}
              >
                {m.admin_bulk_cancel()}
              </Button>
              <Button
                size="sm"
                variant="outline-info"
                onClick={() => setBulkAction("paid")}
              >
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
          {table.getRowModel().rows.length === 0 ? (
            <p className="text-secondary text-center py-4 mb-0">{m.admin_no_registrations()}</p>
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
        <Modal.Body>
          {m.admin_bulk_confirm_action({ count: selectedIds.size })}
        </Modal.Body>
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
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            )}
            {m.admin_action_confirm()}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
