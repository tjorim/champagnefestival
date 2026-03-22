import { useCallback, useState } from "react";
import Card from "react-bootstrap/Card";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Table from "react-bootstrap/Table";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import { m } from "@/paraglide/messages";
import type { Registration, RegistrationStatus, PaymentStatus } from "@/types/registration";
import type { FloorTable } from "@/types/admin";
import RegistrationCreateModal from "./RegistrationCreateModal";

interface AllocationRef {
  id: number;
  name: string;
  contactPersonId: string | null;
}

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

  // Build allocation entities that appear in the current registration list
  const registrationPersonIds = new Set(registrations.map((r) => r.personId));
  const allocationOptions: { key: string; label: string; personId: string }[] = [
    ...exhibitors
      .filter((e) => e.contactPersonId && registrationPersonIds.has(e.contactPersonId))
      .map((e) => ({
        key: `e:${e.id}`,
        label: `${m.admin_allocation_exhibitor_label()}: ${e.name}`,
        personId: e.contactPersonId!,
      })),
  ];

  // Find which registrations are linked to an exhibitor contact person
  const allContactPersonIds = new Set(
    exhibitors.map((e) => e.contactPersonId).filter((id): id is string => id !== null),
  );

  const filterPersonId = allocationFilter
    ? (allocationOptions.find((o) => o.key === allocationFilter)?.personId ?? null)
    : null;

  const filtered = registrations.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (filterPersonId && r.person.id !== filterPersonId) return false;
    return true;
  });

  const handleAssignTable = useCallback(
    (registrationId: string, tableId: string) => {
      onAssignTable(registrationId, tableId || undefined);
    },
    [onAssignTable],
  );

  return (
    <>
      <Card bg="dark" text="white" border="secondary">
        <Card.Header className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <span className="fw-semibold">{m.admin_reservations_tab()}</span>
          <div className="d-flex flex-wrap gap-2 align-items-center">
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
                variant={filter === "all" ? "warning" : "outline-secondary"}
                onClick={() => onFilterChange("all")}
              >
                {m.admin_filter_all()} ({registrations.length})
              </Button>
              <Button
                variant={filter === "pending" ? "warning" : "outline-secondary"}
                onClick={() => onFilterChange("pending")}
              >
                {m.admin_filter_pending()} (
                {registrations.filter((r) => r.status === "pending").length})
              </Button>
              <Button
                variant={filter === "confirmed" ? "warning" : "outline-secondary"}
                onClick={() => onFilterChange("confirmed")}
              >
                {m.admin_filter_confirmed()} (
                {registrations.filter((r) => r.status === "confirmed").length})
              </Button>
            </ButtonGroup>
            <Button variant="outline-warning" size="sm" onClick={() => setShowCreateModal(true)}>
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              {m.admin_add_reservation()}
            </Button>
          </div>
        </Card.Header>

        <Card.Body className="p-0">
          {filtered.length === 0 ? (
            <p className="text-secondary text-center py-4 mb-0">{m.admin_no_reservations()}</p>
          ) : (
            <div className="table-responsive">
              <Table variant="dark" hover striped className="mb-0" size="sm">
                <thead>
                  <tr>
                    <th>{m.reservation_name()}</th>
                    <th className="d-none d-md-table-cell">{m.admin_event_label()}</th>
                    <th>{m.admin_guests_count()}</th>
                    <th>{m.admin_status_label()}</th>
                    <th className="d-none d-lg-table-cell">{m.admin_payment_label()}</th>
                    <th className="d-none d-xl-table-cell">{m.admin_check_in_title()}</th>
                    <th className="d-none d-lg-table-cell">{m.admin_tables_tab()}</th>
                    <th>{m.admin_actions_label()}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((res) => {
                    const isLinked = allContactPersonIds.has(res.person.id);
                    return (
                      <tr key={res.id}>
                        <td>
                          <div className="fw-semibold d-flex align-items-center gap-1">
                            {res.person.name}
                            {isLinked && (
                              <i
                                className="bi bi-person-badge text-info"
                                title={m.admin_linked_exhibitor_title()}
                                aria-label={m.admin_allocation_contact_aria()}
                              />
                            )}
                          </div>
                          <div className="text-secondary small">{res.person.email}</div>
                          {res.preOrders.length > 0 && (
                            <div className="text-warning small">
                              <i className="bi bi-cart-fill me-1" aria-hidden="true" />
                              {res.preOrders.filter((o) => o.delivered).length}/
                              {res.preOrders.length} {m.admin_pre_orders()}
                            </div>
                          )}
                        </td>
                        <td className="d-none d-md-table-cell small">
                          {res.eventTitle || res.eventId}
                        </td>
                        <td>{res.guestCount}</td>
                        <td>
                          <Badge bg={statusBadgeVariant(res.status)}>
                            {statusLabel(res.status)}
                          </Badge>
                        </td>
                        <td className="d-none d-lg-table-cell">
                          <Badge bg={paymentBadgeVariant(res.paymentStatus)}>
                            {paymentLabel(res.paymentStatus)}
                          </Badge>
                        </td>
                        <td className="d-none d-xl-table-cell">
                          {res.checkedIn ? (
                            <Badge bg="success">
                              <i className="bi bi-check-circle-fill me-1" aria-hidden="true" />
                              {m.admin_checked_in()}
                            </Badge>
                          ) : (
                            <Badge bg="secondary">{m.admin_not_checked_in()}</Badge>
                          )}
                          {res.strapIssued && (
                            <Badge bg="info" className="ms-1">
                              <i className="bi bi-person-badge-fill" aria-hidden="true" />
                            </Badge>
                          )}
                        </td>
                        <td className="d-none d-lg-table-cell">
                          <Form.Select
                            size="sm"
                            className="bg-dark text-light border-secondary"
                            value={res.tableId ?? ""}
                            onChange={(e) => handleAssignTable(res.id, e.target.value)}
                            aria-label={m.admin_action_assign_table()}
                          >
                            <option value="">{m.admin_unassigned()}</option>
                            {tables.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({t.capacity})
                              </option>
                            ))}
                          </Form.Select>
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline-light"
                              onClick={() => onViewDetail(res)}
                              title={m.admin_qr_code()}
                              aria-label={m.admin_qr_code()}
                            >
                              <i className="bi bi-qr-code" aria-hidden="true" />
                            </Button>
                            {res.status === "pending" && (
                              <Button
                                size="sm"
                                variant="outline-success"
                                onClick={() => onUpdateStatus(res.id, "confirmed")}
                                title={m.admin_action_confirm()}
                                aria-label={m.admin_action_confirm()}
                              >
                                <i className="bi bi-check-lg" aria-hidden="true" />
                              </Button>
                            )}
                            {res.status !== "cancelled" && (
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => onUpdateStatus(res.id, "cancelled")}
                                title={m.admin_action_cancel()}
                                aria-label={m.admin_action_cancel()}
                              >
                                <i className="bi bi-x-lg" aria-hidden="true" />
                              </Button>
                            )}
                            {res.paymentStatus !== "paid" && (
                              <Button
                                size="sm"
                                variant="outline-warning"
                                onClick={() => onUpdatePayment(res.id, "paid")}
                                title={m.admin_action_mark_paid()}
                                aria-label={m.admin_action_mark_paid()}
                              >
                                <i className="bi bi-currency-euro" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      <RegistrationCreateModal
        show={showCreateModal}
        authHeaders={authHeaders}
        onSaved={(r) => {
          onAddRegistration(r);
          setShowCreateModal(false);
        }}
        onHide={() => setShowCreateModal(false)}
      />
    </>
  );
}
