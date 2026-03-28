import { useCallback, useMemo, useState } from "react";
import {
  flexRender,
  useTable,
  tableFeatures,
  globalFilteringFeature,
  rowSortingFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFns,
  sortFns,
  type ColumnDef,
  type FilterFn,
  type SortingState,
} from "@tanstack/react-table";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import Form from "react-bootstrap/Form";
import Table from "react-bootstrap/Table";
import { m } from "@/paraglide/messages";
import type { FloorTable } from "@/types/admin";
import type { PaymentStatus, Registration, RegistrationStatus } from "@/types/registration";
import RegistrationCreateModal from "./RegistrationCreateModal";

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
  onUpdateStatus: (id: string, status: RegistrationStatus) => void;
  onUpdatePayment: (id: string, paymentStatus: PaymentStatus) => void;
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

const _features = tableFeatures({
  globalFilteringFeature,
  rowSortingFeature,
});

const registrationGlobalFilter: FilterFn<typeof _features, Registration> = (
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

  const columns = useMemo<ColumnDef<typeof _features, Registration>[]>(
    () => [
      {
        id: "name",
        header: m.registration_name(),
        accessorFn: (row) => row.person.name,
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
                  {isStandalone
                    ? m.admin_filter_edition_standalone()
                    : m.admin_edition_type_festival()}
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
      },
      {
        id: "event",
        header: m.admin_event_label(),
        accessorFn: (row) => row.event?.title ?? row.eventId,
        cell: ({ getValue }) => <span className="small">{String(getValue())}</span>,
        meta: { tdClassName: "d-none d-md-table-cell" },
      },
      {
        accessorKey: "guestCount",
        header: m.admin_guests_count(),
      },
      {
        accessorKey: "status",
        header: m.admin_status_label(),
        cell: ({ getValue }) => (
          <Badge bg={statusBadgeVariant(getValue() as RegistrationStatus)}>
            {statusLabel(getValue() as RegistrationStatus)}
          </Badge>
        ),
      },
      {
        accessorKey: "paymentStatus",
        header: m.admin_payment_label(),
        cell: ({ getValue }) => (
          <Badge bg={paymentBadgeVariant(getValue() as PaymentStatus)}>
            {paymentLabel(getValue() as PaymentStatus)}
          </Badge>
        ),
        meta: { tdClassName: "d-none d-lg-table-cell" },
      },
      {
        id: "checkedIn",
        accessorKey: "checkedIn",
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
      },
      {
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
      },
      {
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
                  <Dropdown.Toggle size="sm" variant="outline-secondary" id={`reg-more-${reg.id}`}>
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
      },
    ],
    [allContactPersonIds, tables, handleAssignTable, onViewDetail, onUpdateStatus, onUpdatePayment],
  );

  const table = useTable(
    {
      _features,
      _rowModels: {
        filteredRowModel: createFilteredRowModel(filterFns),
        sortedRowModel: createSortedRowModel(sortFns),
      },
      data: preFiltered,
      columns,
      state: { sorting, globalFilter: q },
      getRowId: (row) => row.id,
      onSortingChange: setSorting,
      onGlobalFilterChange: setQ,
      globalFilterFn: registrationGlobalFilter,
    },
    (state) => state,
  );

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
            <Button variant="outline-primary" size="sm" onClick={() => setShowCreateModal(true)}>
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              {m.admin_add_registration()}
            </Button>
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
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className={header.column.columnDef.meta?.tdClassName}
                          onClick={header.column.getToggleSortingHandler()}
                          style={{
                            cursor: header.column.getCanSort() ? "pointer" : "default",
                            userSelect: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
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
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getAllCells().map((cell) => (
                        <td key={cell.id} className={cell.column.columnDef.meta?.tdClassName}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
    </>
  );
}
