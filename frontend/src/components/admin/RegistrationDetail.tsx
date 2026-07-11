import { useCallback, useMemo } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import { QRCodeSVG } from "qrcode.react";
import { m } from "@/paraglide/messages";
import type { FloorTable } from "@/types/admin";
import type { OrderItem, Registration } from "@/types/registration";

interface RegistrationDetailProps {
  registration: Registration | null;
  /** Full origin + router basename (e.g. `https://example.com`). Used to build the check-in QR code URL. */
  baseUrl: string;
  /** Other people sharing the same email address, shown in the merge-duplicate alert. */
  emailDuplicates?: { id: string; name: string }[];
  tables?: FloorTable[] | null;
  onClose: () => void;
  onToggleDelivered: (registrationId: string, updatedOrders: OrderItem[]) => void;
  onCheckIn: (registrationId: string) => void;
  onIssueStrap: (registrationId: string) => void;
  onAssignTable: (registrationId: string, tableId: string | undefined) => void;
  onMergeDuplicate?: (canonicalId: string, duplicateId: string) => void;
  actionError?: string;
  onClearActionError?: () => void;
}

function isSimpleRsvp(registration: Registration) {
  if (!registration.event || !registration.event.edition) return false;
  return registration.event.edition.editionType !== "festival";
}

export default function RegistrationDetail({
  registration,
  baseUrl,
  emailDuplicates = [],
  tables = [],
  onClose,
  onToggleDelivered,
  onCheckIn,
  onIssueStrap,
  onAssignTable,
  onMergeDuplicate,
  actionError,
  onClearActionError,
}: RegistrationDetailProps) {
  const checkInUrl = registration
    ? `${baseUrl}/check-in?id=${encodeURIComponent(registration.id)}&token=${encodeURIComponent(registration.checkInToken ?? "")}`
    : "";

  const sortedTables = useMemo(
    () =>
      [...(tables ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [tables],
  );

  const handleSetDeliveredQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (!registration || !Number.isFinite(quantity)) return;
      const updatedOrders = registration.preOrders.map((item) => {
        if (item.productId !== productId) return item;
        const deliveredQuantity = Math.max(0, Math.min(item.quantity, Math.trunc(quantity)));
        return {
          ...item,
          deliveredQuantity,
          remainingQuantity: item.quantity - deliveredQuantity,
          delivered: deliveredQuantity === item.quantity,
        };
      });
      onToggleDelivered(registration.id, updatedOrders);
    },
    [registration, onToggleDelivered],
  );

  const handleAdjustDeliveredQuantity = useCallback(
    (productId: string, delta: number) => {
      if (!registration) return;
      const item = registration.preOrders.find((order) => order.productId === productId);
      if (!item) return;
      handleSetDeliveredQuantity(productId, item.deliveredQuantity + delta);
    },
    [handleSetDeliveredQuantity, registration],
  );

  if (!registration) return null;
  const simpleRsvp = isSimpleRsvp(registration);

  return (
    <Modal
      show
      onHide={onClose}
      size="lg"
      centered
      aria-labelledby="res-detail-modal-title"
      dialogClassName="admin-dialog"
    >
      <Modal.Header closeButton className="bg-dark text-light border-secondary">
        <Modal.Title id="res-detail-modal-title">
          <i className="bi bi-person-fill me-2" aria-hidden="true" />
          {registration.person.name}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="bg-dark text-light">
        {actionError && (
          <Alert
            variant="danger"
            dismissible={Boolean(onClearActionError)}
            onClose={onClearActionError}
            className="mb-3"
            role="alert"
          >
            {actionError}
          </Alert>
        )}

        <div className="d-flex flex-wrap gap-2 mb-3">
          <Badge
            bg={
              registration.status === "confirmed"
                ? "success"
                : registration.status === "cancelled"
                  ? "danger"
                  : "warning"
            }
          >
            {registration.status === "confirmed"
              ? m.admin_status_confirmed()
              : registration.status === "cancelled"
                ? m.admin_status_cancelled()
                : m.admin_status_pending()}
          </Badge>
          <Badge
            bg={
              registration.paymentStatus === "paid"
                ? "success"
                : registration.paymentStatus === "partial"
                  ? "warning"
                  : "secondary"
            }
          >
            {registration.paymentStatus === "paid"
              ? m.admin_payment_paid()
              : registration.paymentStatus === "partial"
                ? m.admin_payment_partial()
                : m.admin_payment_unpaid()}
          </Badge>
          {registration.checkedIn ? (
            <Badge bg="success">
              <i className="bi bi-check-circle-fill me-1" aria-hidden="true" />
              {m.admin_checked_in()}
              {registration.checkedInAt && (
                <span className="ms-1 fw-normal">
                  {new Date(registration.checkedInAt).toLocaleTimeString()}
                </span>
              )}
            </Badge>
          ) : (
            <Badge bg="secondary">{m.admin_not_checked_in()}</Badge>
          )}
          {!simpleRsvp &&
            (registration.strapIssued ? (
              <Badge bg="info">
                <i className="bi bi-person-badge-fill me-1" aria-hidden="true" />
                {m.admin_strap_issued()}
              </Badge>
            ) : (
              <Badge bg="secondary">{m.admin_strap_not_issued()}</Badge>
            ))}
        </div>

        {emailDuplicates.length > 0 && (
          <Alert variant="warning" className="py-2 mb-3">
            <div className="fw-semibold mb-1">
              <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
              {m.admin_people_duplicates_title()}
            </div>
            <div className="small mb-2">{m.admin_people_duplicates_same_email()}</div>
            <div className="d-flex flex-wrap gap-2">
              {emailDuplicates.map((dup) => (
                <Button
                  key={dup.id}
                  size="sm"
                  variant="warning"
                  onClick={() => onMergeDuplicate?.(registration.personId, dup.id)}
                >
                  <i className="bi bi-person-fill-gear me-1" aria-hidden="true" />
                  {m.admin_people_merge_title()}: {dup.name}
                </Button>
              ))}
            </div>
          </Alert>
        )}

        <ListGroup variant="flush" className="mb-3">
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
            <span className="text-secondary">{m.registration_email()}</span>
            <a href={`mailto:${registration.person.email}`} className="text-warning">
              {registration.person.email}
            </a>
          </ListGroup.Item>
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
            <span className="text-secondary">{m.registration_phone()}</span>
            <span>{registration.person.phone}</span>
          </ListGroup.Item>
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
            <span className="text-secondary">{m.admin_event_label()}</span>
            <span>{registration.event?.title ?? registration.eventId}</span>
          </ListGroup.Item>
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
            <span className="text-secondary">{m.registration_edition_type_label()}</span>
            <span>
              {(() => {
                const et = registration.event?.edition?.editionType;
                if (et === "bourse") return m.admin_edition_type_bourse();
                if (et === "capsule_exchange") return m.admin_edition_type_capsule_exchange();
                return m.admin_edition_type_festival();
              })()}
            </span>
          </ListGroup.Item>
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
            <span className="text-secondary">{m.admin_guests_count()}</span>
            <span>{registration.guestCount}</span>
          </ListGroup.Item>
          {!simpleRsvp && (
            <ListGroup.Item className="bg-dark text-light border-secondary">
              <Form.Group controlId={`registration-detail-table-${registration.id}`}>
                <Form.Label className="text-secondary">{m.admin_action_assign_table()}</Form.Label>
                <Form.Select
                  size="sm"
                  className="bg-dark text-light border-secondary"
                  value={registration.tableId ?? ""}
                  onChange={(event) =>
                    onAssignTable(registration.id, event.target.value || undefined)
                  }
                  aria-label={m.admin_action_assign_table()}
                >
                  <option value="">{m.admin_unassigned()}</option>
                  {sortedTables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name} ({table.capacity})
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </ListGroup.Item>
          )}
          {registration.notes && (
            <ListGroup.Item className="bg-dark text-light border-secondary">
              <span className="text-secondary d-block mb-1">{m.admin_notes()}</span>
              <span className="small">{registration.notes}</span>
            </ListGroup.Item>
          )}
          {registration.accessibilityNote && (
            <ListGroup.Item className="bg-dark text-light border-secondary">
              <span className="text-secondary d-block mb-1">
                <i className="bi bi-universal-access me-1" aria-hidden="true" />
                {m.admin_accessibility_note_label()}
              </span>
              <span className="small">{registration.accessibilityNote}</span>
            </ListGroup.Item>
          )}
        </ListGroup>

        {!simpleRsvp && registration.preOrders.length > 0 && (
          <div className="mb-4">
            <h6 className="text-warning mb-2">
              <i className="bi bi-basket-fill me-2" aria-hidden="true" />
              {m.admin_bottle_fulfillment()}
            </h6>
            <ListGroup>
              {registration.preOrders.map((item) => (
                <ListGroup.Item
                  key={item.productId}
                  className="bg-dark text-light border-secondary d-flex align-items-center justify-content-between"
                >
                  <span>
                    {item.name}{" "}
                    <Badge bg="secondary" className="ms-1">
                      ×{item.quantity}
                    </Badge>
                  </span>
                  <div className="d-flex align-items-center gap-2">
                    <Badge bg={item.delivered ? "success" : "secondary"}>
                      {m.admin_bottle_delivered()}: {item.deliveredQuantity}/{item.quantity}
                    </Badge>
                    <Badge bg={item.remainingQuantity > 0 ? "warning" : "success"} text="dark">
                      {m.admin_bottle_not_delivered()}: {item.remainingQuantity}
                    </Badge>
                    <div className="d-flex align-items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => handleAdjustDeliveredQuantity(item.productId, -1)}
                        disabled={item.deliveredQuantity <= 0}
                        title={m.admin_mark_not_delivered()}
                      >
                        <i className="bi bi-dash" aria-hidden="true" />
                      </Button>
                      <Form.Control
                        key={item.deliveredQuantity}
                        aria-label={`${m.admin_bottle_delivered()} ${item.name}`}
                        className="text-center"
                        inputMode="numeric"
                        min={0}
                        max={item.quantity}
                        onBlur={(event) => {
                          const deliveredQuantity = Number(event.currentTarget.value);
                          if (
                            Number.isFinite(deliveredQuantity) &&
                            deliveredQuantity !== item.deliveredQuantity
                          ) {
                            handleSetDeliveredQuantity(item.productId, deliveredQuantity);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                        size="sm"
                        style={{ width: "5rem" }}
                        type="number"
                        defaultValue={item.deliveredQuantity}
                      />
                      <Button
                        size="sm"
                        variant={item.delivered ? "success" : "outline-success"}
                        onClick={() => handleAdjustDeliveredQuantity(item.productId, 1)}
                        disabled={item.deliveredQuantity >= item.quantity}
                        title={m.admin_mark_delivered()}
                      >
                        <i className="bi bi-plus" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </div>
        )}

        <div className="mb-4">
          <h6 className="text-warning mb-2">
            <i className="bi bi-person-check-fill me-2" aria-hidden="true" />
            {m.admin_check_in_title()}
          </h6>
          <div className="d-flex gap-2 flex-wrap">
            {!registration.checkedIn && (
              <Button
                variant="outline-success"
                size="sm"
                onClick={() => onCheckIn(registration.id)}
              >
                <i className="bi bi-box-arrow-in-right me-1" aria-hidden="true" />
                {m.admin_mark_checked_in()}
              </Button>
            )}
            {!simpleRsvp && !registration.strapIssued && (
              <Button
                variant="outline-info"
                size="sm"
                onClick={() => onIssueStrap(registration.id)}
              >
                <i className="bi bi-person-badge me-1" aria-hidden="true" />
                {m.admin_issue_strap()}
              </Button>
            )}
          </div>
        </div>

        {registration.checkInToken && (
          <div className="text-center">
            <h6 className="text-warning mb-2">
              <i className="bi bi-qr-code me-2" aria-hidden="true" />
              {m.admin_qr_code()}
            </h6>
            <p className="text-secondary small mb-3">{m.admin_qr_scan_info()}</p>
            <div className="d-inline-block p-3 bg-white rounded">
              <QRCodeSVG value={checkInUrl} size={180} level="M" includeMargin={false} />
            </div>
            <div className="mt-2">
              <a
                href={checkInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-secondary small text-break"
              >
                {checkInUrl}
              </a>
            </div>
          </div>
        )}
      </Modal.Body>

      <Modal.Footer className="bg-dark border-secondary">
        <Button variant="outline-secondary" onClick={onClose}>
          {m.close()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
