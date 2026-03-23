import { useCallback, useMemo, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
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

export default function RegistrationList({ registrations, tables, exhibitors, filter, onFilterChange, onUpdateStatus, onUpdatePayment, onAssignTable, onViewDetail, onAddRegistration, authHeaders }: RegistrationListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [allocationFilter, setAllocationFilter] = useState("");
  const [editionFilter, setEditionFilter] = useState<EditionFilter>("all");

  const registrationPersonIds = new Set(registrations.map((r) => r.personId));
  const allocationOptions: { key: string; label: string; personId: string }[] = exhibitors
    .filter((e) => e.contactPersonId && registrationPersonIds.has(e.contactPersonId))
    .map((e) => ({ key: `e:${e.id}`, label: `${m.admin_allocation_exhibitor_label()}: ${e.name}`, personId: e.contactPersonId! }));

  const allContactPersonIds = new Set(exhibitors.map((e) => e.contactPersonId).filter((id): id is string => id !== null));
  const filterPersonId = allocationFilter ? allocationOptions.find((o) => o.key === allocationFilter)?.personId ?? null : null;

  const filtered = registrations.filter((registration) => {
    if (filter !== "all" && registration.status !== filter) return false;
    if (filterPersonId && registration.person.id !== filterPersonId) return false;
    const standalone = isStandaloneRegistration(registration);
    if (editionFilter === "festival" && standalone) return false;
    if (editionFilter === "standalone" && !standalone) return false;
    return true;
  });

  const handleAssignTable = useCallback((registrationId: string, tableId: string) => {
    onAssignTable(registrationId, tableId || undefined);
  }, [onAssignTable]);

  const statusCounts = useMemo(() => ({
    all: registrations.length,
    pending: registrations.filter((r) => r.status === "pending").length,
    confirmed: registrations.filter((r) => r.status === "confirmed").length,
  }), [registrations]);

  const editionCounts = useMemo(() => ({
    all: registrations.length,
    festival: registrations.filter((registration) => !isStandaloneRegistration(registration)).length,
    standalone: registrations.filter((registration) => isStandaloneRegistration(registration)).length,
  }), [registrations]);

  return (
    <>
      <Card bg="dark" text="white" border="secondary">
        <Card.Header className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <span className="fw-semibold">{m.admin_registrations_tab_header()}</span>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <ButtonGroup size="sm">
              <Button variant={editionFilter === "all" ? "warning" : "outline-secondary"} onClick={() => setEditionFilter("all")}>{m.admin_filter_edition_all()} ({editionCounts.all})</Button>
              <Button variant={editionFilter === "festival" ? "warning" : "outline-secondary"} onClick={() => setEditionFilter("festival")}>{m.admin_filter_edition_festivals()} ({editionCounts.festival})</Button>
              <Button variant={editionFilter === "standalone" ? "warning" : "outline-secondary"} onClick={() => setEditionFilter("standalone")}>{m.admin_filter_edition_standalone()} ({editionCounts.standalone})</Button>
            </ButtonGroup>
            {allocationOptions.length > 0 && (
              <Form.Select size="sm" className="bg-dark text-light border-secondary" style={{ maxWidth: 200 }} value={allocationFilter} onChange={(e) => setAllocationFilter(e.target.value)} aria-label={m.admin_filter_allocation_aria()}>
                <option value="">{m.admin_all_allocations()}</option>
                {allocationOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </Form.Select>
            )}
            <ButtonGroup size="sm">
              <Button variant={filter === "all" ? "warning" : "outline-secondary"} onClick={() => onFilterChange("all")}>{m.admin_filter_all()} ({statusCounts.all})</Button>
              <Button variant={filter === "pending" ? "warning" : "outline-secondary"} onClick={() => onFilterChange("pending")}>{m.admin_filter_pending()} ({statusCounts.pending})</Button>
              <Button variant={filter === "confirmed" ? "warning" : "outline-secondary"} onClick={() => onFilterChange("confirmed")}>{m.admin_filter_confirmed()} ({statusCounts.confirmed})</Button>
            </ButtonGroup>
            <Button variant="outline-warning" size="sm" onClick={() => setShowCreateModal(true)}><i className="bi bi-plus-lg me-1" aria-hidden="true" />{m.admin_add_registration()}</Button>
          </div>
        </Card.Header>

        <Card.Body className="p-0">
          {filtered.length === 0 ? (
            <p className="text-secondary text-center py-4 mb-0">{m.admin_no_registrations()}</p>
          ) : (
            <div className="table-responsive">
              <Table variant="dark" hover striped className="mb-0" size="sm">
                <thead>
                  <tr>
                    <th>{m.registration_name()}</th>
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
                  {filtered.map((registration) => {
                    const isLinked = allContactPersonIds.has(registration.person.id);
                    const isStandalone = isStandaloneRegistration(registration);
                    return (
                      <tr key={registration.id}>
                        <td>
                          <div className="fw-semibold d-flex align-items-center gap-1">
                            {registration.person.name}
                            {isLinked && <i className="bi bi-person-badge text-info" title={m.admin_linked_exhibitor_title()} aria-label={m.admin_allocation_contact_aria()} />}
                            <Badge bg={isStandalone ? "info" : "warning"} text="dark">{isStandalone ? m.admin_filter_edition_standalone() : m.admin_edition_type_festival()}</Badge>
                          </div>
                          <div className="text-secondary small">{registration.person.email}</div>
                          {!isStandalone && registration.preOrders.length > 0 && (
                            <div className="text-warning small"><i className="bi bi-cart-fill me-1" aria-hidden="true" />{registration.preOrders.filter((o) => o.delivered).length}/{registration.preOrders.length} {m.admin_pre_orders()}</div>
                          )}
                        </td>
                        <td className="d-none d-md-table-cell small">{registration.event?.title ?? registration.eventId}</td>
                        <td>{registration.guestCount}</td>
                        <td><Badge bg={statusBadgeVariant(registration.status)}>{statusLabel(registration.status)}</Badge></td>
                        <td className="d-none d-lg-table-cell"><Badge bg={paymentBadgeVariant(registration.paymentStatus)}>{paymentLabel(registration.paymentStatus)}</Badge></td>
                        <td className="d-none d-xl-table-cell">
                          {registration.checkedIn ? <Badge bg="success"><i className="bi bi-check-circle-fill me-1" aria-hidden="true" />{m.admin_checked_in()}</Badge> : <Badge bg="secondary">{m.admin_not_checked_in()}</Badge>}
                          {!isStandalone && registration.strapIssued && <Badge bg="info" className="ms-1"><i className="bi bi-person-badge-fill" aria-hidden="true" /></Badge>}
                        </td>
                        <td className="d-none d-lg-table-cell">
                          {isStandalone ? (
                            <span className="text-secondary small">—</span>
                          ) : (
                            <Form.Select size="sm" className="bg-dark text-light border-secondary" value={registration.tableId ?? ""} onChange={(e) => handleAssignTable(registration.id, e.target.value)} aria-label={m.admin_action_assign_table()}>
                              <option value="">{m.admin_unassigned()}</option>
                              {tables.map((table) => <option key={table.id} value={table.id}>{table.name} ({table.capacity})</option>)}
                            </Form.Select>
                          )}
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            <Button size="sm" variant="outline-light" onClick={() => onViewDetail(registration)} title={m.admin_qr_code()} aria-label={m.admin_qr_code()}><i className="bi bi-qr-code" aria-hidden="true" /></Button>
                            {registration.status === "pending" && <Button size="sm" variant="outline-success" onClick={() => onUpdateStatus(registration.id, "confirmed")} title={m.admin_action_confirm()} aria-label={m.admin_action_confirm()}><i className="bi bi-check-lg" aria-hidden="true" /></Button>}
                            {registration.status !== "cancelled" && <Button size="sm" variant="outline-danger" onClick={() => onUpdateStatus(registration.id, "cancelled")} title={m.admin_action_cancel()} aria-label={m.admin_action_cancel()}><i className="bi bi-x-lg" aria-hidden="true" /></Button>}
                            {registration.paymentStatus !== "paid" && <Button size="sm" variant="outline-warning" onClick={() => onUpdatePayment(registration.id, "paid")} title={m.admin_action_mark_paid()} aria-label={m.admin_action_mark_paid()}><i className="bi bi-currency-euro" aria-hidden="true" /></Button>}
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

      <RegistrationCreateModal show={showCreateModal} authHeaders={authHeaders} onSaved={(registration) => { onAddRegistration(registration); setShowCreateModal(false); }} onHide={() => setShowCreateModal(false)} />
    </>
  );
}
