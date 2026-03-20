/**
 * MyReservationsPage — lets guests look up their own reservations by email.
 * Uses the public GET /api/reservations/my?email=... endpoint.
 */

import { useState, useCallback } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import type { OrderItemCategory, PaymentStatus, ReservationStatus } from "@/types/reservation";

interface GuestReservation {
  id: string;
  name: string;
  eventId: string;
  eventTitle: string;
  guestCount: number;
  preOrders: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
    category: OrderItemCategory;
    delivered: boolean;
  }[];
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  checkedIn: boolean;
  checkedInAt?: string;
  strapIssued: boolean;
  createdAt: string;
}

function statusBadgeVariant(status: ReservationStatus): string {
  switch (status) {
    case "confirmed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "warning";
  }
}

function statusLabel(status: ReservationStatus): string {
  switch (status) {
    case "confirmed":
      return m.admin_status_confirmed();
    case "cancelled":
      return m.admin_status_cancelled();
    default:
      return m.admin_status_pending();
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

export default function MyReservationsPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservations, setReservations] = useState<GuestReservation[] | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const emailTrimmed = email.trim();
      if (!emailTrimmed) return;

      setIsLoading(true);
      setError(null);
      setReservations(null);

      try {
        const res = await fetch(
          `/api/reservations/my?email=${encodeURIComponent(emailTrimmed)}`,
        );
        if (!res.ok) {
          setError(m.my_reservations_error());
          return;
        }
        const data = (await res.json()) as Record<string, unknown>[];
        const mapped: GuestReservation[] = data.map((d) => {
          const rawOrders = (d.pre_orders ?? []) as Record<string, unknown>[];
          return {
            id: d.id as string,
            name: d.name as string,
            eventId: (d.event_id ?? "") as string,
            eventTitle: (d.event_title ?? "") as string,
            guestCount: (d.guest_count ?? 1) as number,
            preOrders: rawOrders.map((item) => ({
              productId: (item.product_id ?? "") as string,
              name: (item.name ?? "") as string,
              quantity: (item.quantity ?? 1) as number,
              price: (item.price ?? 0) as number,
              category: (item.category ?? "other") as OrderItemCategory,
              delivered: (item.delivered ?? false) as boolean,
            })),
            status: (d.status ?? "pending") as ReservationStatus,
            paymentStatus: (d.payment_status ?? "unpaid") as PaymentStatus,
            checkedIn: (d.checked_in ?? false) as boolean,
            checkedInAt: d.checked_in_at as string | undefined,
            strapIssued: (d.strap_issued ?? false) as boolean,
            createdAt: (d.created_at ?? "") as string,
          };
        });
        setReservations(mapped);
      } catch {
        setError(m.my_reservations_error());
      } finally {
        setIsLoading(false);
      }
    },
    [email],
  );

  return (
    <Container className="py-4" style={{ maxWidth: 640 }}>
      <h4 className="text-warning mb-1">
        <i className="bi bi-ticket-perforated me-2" aria-hidden="true" />
        {m.my_reservations_title()}
      </h4>
      <p className="text-secondary mb-4">{m.my_reservations_description()}</p>

      <Card bg="dark" text="white" border="secondary" className="mb-4">
        <Card.Body>
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label className="text-secondary small">
                {m.my_reservations_email_label()}
              </Form.Label>
              <Form.Control
                type="email"
                placeholder={m.my_reservations_email_placeholder()}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
            <Button
              type="submit"
              variant="warning"
              disabled={isLoading || !email.trim()}
            >
              {isLoading ? (
                <>
                  <Spinner
                    as="span"
                    animation="border"
                    size="sm"
                    role="status"
                    aria-hidden="true"
                    className="me-2"
                  />
                  {m.my_reservations_searching()}
                </>
              ) : (
                <>
                  <i className="bi bi-search me-2" aria-hidden="true" />
                  {m.my_reservations_search()}
                </>
              )}
            </Button>
          </Form>
        </Card.Body>
      </Card>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {reservations !== null && reservations.length === 0 && (
        <Alert variant="info">{m.my_reservations_no_results()}</Alert>
      )}

      {reservations !== null && reservations.length > 0 && (
        <ListGroup variant="flush" className="border border-secondary rounded">
          {reservations.map((r) => (
            <ListGroup.Item key={r.id} className="bg-dark text-light border-secondary py-3">
              <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <div className="fw-semibold">{r.eventTitle}</div>
                  <div className="text-secondary small">
                    <i className="bi bi-people me-1" aria-hidden="true" />
                    {r.guestCount} {m.my_reservations_guests_label()}
                  </div>
                </div>
                <div className="d-flex gap-1 flex-wrap">
                  <Badge bg={statusBadgeVariant(r.status)}>{statusLabel(r.status)}</Badge>
                  <Badge bg={paymentBadgeVariant(r.paymentStatus)}>
                    {paymentLabel(r.paymentStatus)}
                  </Badge>
                  {r.checkedIn && (
                    <Badge bg="success">
                      <i className="bi bi-check2-circle me-1" aria-hidden="true" />
                      {m.my_reservations_checkedin_label()}
                    </Badge>
                  )}
                </div>
              </div>
              {r.preOrders.length > 0 && (
                <div className="mt-2 text-secondary small">
                  <i className="bi bi-basket me-1" aria-hidden="true" />
                  {r.preOrders.map((o) => `${o.name} ×${o.quantity}`).join(", ")}
                </div>
              )}
              <div className="text-secondary small mt-1">
                {new Date(r.createdAt).toLocaleDateString()}
              </div>
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </Container>
  );
}
