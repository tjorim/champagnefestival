import { useCallback } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import { QRCodeSVG } from "qrcode.react";
import { m } from "@/paraglide/messages";
import type { OrderItem, Registration } from "@/types/registration";

interface RegistrationDetailProps {
  registration: Registration | null;
  /** Full origin + router basename (e.g. `https://example.com`). Used to build the check-in QR code URL. */
  baseUrl: string;
  /** Other people sharing the same email address, shown in the merge-duplicate alert. */
  emailDuplicates?: { id: string; name: string }[];
  onClose: () => void;
  onToggleDelivered: (registrationId: string, updatedOrders: OrderItem[]) => void;
  onCheckIn: (registrationId: string) => void;
  onIssueStrap: (registrationId: string) => void;
  onMergeDuplicate?: (canonicalId: string, duplicateId: string) => void;
}

function isSimpleRsvp(registration: Registration) {
  if (!registration.event || !registration.event.edition) return false;
  return registration.event.edition.editionType !== "festival";
}

export default function RegistrationDetail({
  registration,
  baseUrl,
  emailDuplicates = [],
  onClose,
  onToggleDelivered,
  onCheckIn,
  onIssueStrap,
  onMergeDuplicate,
}: RegistrationDetailProps) {
  const checkInUrl = registration
    ? `${baseUrl}/check-in?id=${encodeURIComponent(registration.id)}&token=${encodeURIComponent(registration.checkInToken ?? "")}`
    : "";

  const handleToggleDelivered = useCallback(
    (productId: string) => {
      if (!registration) return;
      const updatedOrders = registration.preOrders.map((item) =>
        item.productId === productId ? { ...item, delivered: !item.delivered } : item,
      );
      onToggleDelivered(registration.id, updatedOrders);
    },
    [registration, onToggleDelivered],
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
              {simpleRsvp
                ? m.registration_edition_type_standalone()
                : m.registration_edition_type_festival()}
            </span>
          </ListGroup.Item>
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
            <span className="text-secondary">{m.admin_guests_count()}</span>
            <span>{registration.guestCount}</span>
          </ListGroup.Item>
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
                  <Button
                    size="sm"
                    variant={item.delivered ? "success" : "outline-secondary"}
                    onClick={() => handleToggleDelivered(item.productId)}
                    title={item.delivered ? m.admin_mark_not_delivered() : m.admin_mark_delivered()}
                  >
                    {item.delivered ? (
                      <>
                        <i className="bi bi-check-circle-fill me-1" aria-hidden="true" />
                        {m.admin_bottle_delivered()}
                      </>
                    ) : (
                      <>
                        <i className="bi bi-circle me-1" aria-hidden="true" />
                        {m.admin_bottle_not_delivered()}
                      </>
                    )}
                  </Button>
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
