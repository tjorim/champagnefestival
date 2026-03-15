import { useCallback } from "react";
import Modal from "react-bootstrap/Modal";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ListGroup from "react-bootstrap/ListGroup";
import { QRCodeSVG } from "qrcode.react";
import { m } from "../../paraglide/messages";
import type { Reservation, OrderItem } from "../../types/reservation";

interface ReservationDetailProps {
  reservation: Reservation | null;
  /** Base URL for the check-in link, e.g. https://festival.example.com */
  baseUrl: string;
  onClose: () => void;
  onToggleDelivered: (reservationId: string, updatedOrders: OrderItem[]) => void;
  onCheckIn: (reservationId: string) => void;
  onIssueStrap: (reservationId: string) => void;
}

export default function ReservationDetail({
  reservation,
  baseUrl,
  onClose,
  onToggleDelivered,
  onCheckIn,
  onIssueStrap,
}: ReservationDetailProps) {
  const checkInUrl = reservation
    ? `${baseUrl}/check-in?id=${reservation.id}&token=${reservation.checkInToken}`
    : "";

  const handleToggleDelivered = useCallback(
    (productId: string) => {
      if (!reservation) return;
      const updatedOrders = reservation.preOrders.map((item) =>
        item.productId === productId ? { ...item, delivered: !item.delivered } : item,
      );
      onToggleDelivered(reservation.id, updatedOrders);
    },
    [reservation, onToggleDelivered],
  );

  if (!reservation) return null;

  return (
    <Modal show onHide={onClose} size="lg" centered aria-labelledby="res-detail-modal-title">
      <Modal.Header closeButton className="bg-dark text-light border-secondary">
        <Modal.Title id="res-detail-modal-title">
          <i className="bi bi-person-fill me-2" aria-hidden="true" />
          {reservation.name}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="bg-dark text-light">
        {/* Status badges */}
        <div className="d-flex flex-wrap gap-2 mb-3">
          <Badge bg={reservation.status === "confirmed" ? "success" : reservation.status === "cancelled" ? "danger" : "warning"}>
            {reservation.status}
          </Badge>
          <Badge bg={reservation.paymentStatus === "paid" ? "success" : reservation.paymentStatus === "partial" ? "warning" : "secondary"}>
            {reservation.paymentStatus}
          </Badge>
          {reservation.checkedIn ? (
            <Badge bg="success">
              <i className="bi bi-check-circle-fill me-1" aria-hidden="true" />
              {m.admin_checked_in()}
              {reservation.checkedInAt && (
                <span className="ms-1 fw-normal">
                  {new Date(reservation.checkedInAt).toLocaleTimeString()}
                </span>
              )}
            </Badge>
          ) : (
            <Badge bg="secondary">{m.admin_not_checked_in()}</Badge>
          )}
          {reservation.strapIssued ? (
            <Badge bg="info">
              <i className="bi bi-person-badge-fill me-1" aria-hidden="true" />
              {m.admin_strap_issued()}
            </Badge>
          ) : (
            <Badge bg="secondary">{m.admin_strap_not_issued()}</Badge>
          )}
        </div>

        {/* Basic info */}
        <ListGroup variant="flush" className="mb-3">
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
            <span className="text-secondary">{m.reservation_email()}</span>
            <a href={`mailto:${reservation.email}`} className="text-warning">{reservation.email}</a>
          </ListGroup.Item>
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
            <span className="text-secondary">{m.reservation_phone()}</span>
            <span>{reservation.phone}</span>
          </ListGroup.Item>
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
            <span className="text-secondary">{m.admin_event_label()}</span>
            <span>{reservation.eventTitle || reservation.eventId}</span>
          </ListGroup.Item>
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
            <span className="text-secondary">{m.admin_guests_count()}</span>
            <span>{reservation.guestCount}</span>
          </ListGroup.Item>
          {reservation.notes && (
            <ListGroup.Item className="bg-dark text-light border-secondary">
              <span className="text-secondary d-block mb-1">{m.admin_notes()}</span>
              <span className="small">{reservation.notes}</span>
            </ListGroup.Item>
          )}
        </ListGroup>

        {/* Bottle fulfillment */}
        {reservation.preOrders.length > 0 && (
          <div className="mb-4">
            <h6 className="text-warning mb-2">
              <i className="bi bi-basket-fill me-2" aria-hidden="true" />
              {m.admin_bottle_fulfillment()}
            </h6>
            <ListGroup>
              {reservation.preOrders.map((item) => (
                <ListGroup.Item
                  key={item.productId}
                  className="bg-dark text-light border-secondary d-flex align-items-center justify-content-between"
                >
                  <span>
                    {item.name}{" "}
                    <Badge bg="secondary" className="ms-1">×{item.quantity}</Badge>
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

        {/* Check-in actions */}
        <div className="mb-4">
          <h6 className="text-warning mb-2">
            <i className="bi bi-person-check-fill me-2" aria-hidden="true" />
            {m.admin_check_in_title()}
          </h6>
          <div className="d-flex gap-2 flex-wrap">
            {!reservation.checkedIn && (
              <Button
                variant="outline-success"
                size="sm"
                onClick={() => onCheckIn(reservation.id)}
              >
                <i className="bi bi-box-arrow-in-right me-1" aria-hidden="true" />
                {m.admin_mark_checked_in()}
              </Button>
            )}
            {!reservation.strapIssued && (
              <Button
                variant="outline-info"
                size="sm"
                onClick={() => onIssueStrap(reservation.id)}
              >
                <i className="bi bi-person-badge me-1" aria-hidden="true" />
                {m.admin_issue_strap()}
              </Button>
            )}
          </div>
        </div>

        {/* QR Code */}
        {reservation.checkInToken && (
          <div className="text-center">
            <h6 className="text-warning mb-2">
              <i className="bi bi-qr-code me-2" aria-hidden="true" />
              {m.admin_qr_code()}
            </h6>
            <p className="text-secondary small mb-3">{m.admin_qr_scan_info()}</p>
            <div className="d-inline-block p-3 bg-white rounded">
              <QRCodeSVG
                value={checkInUrl}
                size={180}
                level="M"
                includeMargin={false}
              />
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
