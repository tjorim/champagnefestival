import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import type { PaymentStatus, ReservationStatus } from "@/types/reservation";

interface GuestReservation {
  id: string;
  eventTitle: string;
  guestCount: number;
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  checkedIn: boolean;
  checkedInAt?: string;
  strapIssued: boolean;
  createdAt: string;
  preOrders: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
    category: string;
    delivered: boolean;
  }[];
}

type DeliveryMode = "development_log" | "disabled";

function mapGuestReservations(data: Record<string, unknown>[]): GuestReservation[] {
  return data.map((reservation) => ({
    id: reservation.id as string,
    eventTitle: (reservation.event_title ?? "") as string,
    guestCount: (reservation.guest_count ?? 1) as number,
    status: (reservation.status ?? "pending") as ReservationStatus,
    paymentStatus: (reservation.payment_status ?? "unpaid") as PaymentStatus,
    checkedIn: (reservation.checked_in ?? false) as boolean,
    checkedInAt: reservation.checked_in_at as string | undefined,
    strapIssued: (reservation.strap_issued ?? false) as boolean,
    createdAt: (reservation.created_at ?? "") as string,
    preOrders: ((reservation.pre_orders ?? []) as Record<string, unknown>[]).map(
      (item) => ({
        productId: item.product_id as string,
        name: item.name as string,
        quantity: item.quantity as number,
        price: item.price as number,
        category: item.category as string,
        delivered: (item.delivered ?? false) as boolean,
      }),
    ),
  }));
}

export default function MyReservationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [email, setEmail] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("disabled");
  const [reservations, setReservations] = useState<GuestReservation[] | null>(null);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [error, setError] = useState("");

  const resetToRequestForm = useCallback(() => {
    setSearchParams({}, { replace: true });
    setRequestSent(false);
    setDeliveryMode("disabled");
    setReservations(null);
    setError("");
  }, [setSearchParams]);

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) return;

      setIsSubmittingEmail(true);
      setError("");
      setRequestSent(false);

      try {
        const response = await fetch("/api/reservations/my/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        });
        if (!response.ok) {
          setError(m.my_reservations_error());
          return;
        }
        const data = (await response.json()) as {
          delivery_mode?: DeliveryMode;
        };
        setDeliveryMode(data.delivery_mode ?? "disabled");
        setRequestSent(true);
      } catch {
        setError(m.my_reservations_error());
      } finally {
        setIsSubmittingEmail(false);
      }
    },
    [email],
  );

  useEffect(() => {
    if (!token) {
      setReservations(null);
      return;
    }

    let isActive = true;
    setIsLoadingReservations(true);
    setError("");
    setRequestSent(false);

    void (async () => {
      try {
        const response = await fetch(
          `/api/reservations/my/access?token=${encodeURIComponent(token)}`,
        );

        if (!response.ok) {
          if (!isActive) return;
          setReservations(null);
          setError(
            response.status === 401
              ? m.my_reservations_invalid_token()
              : m.my_reservations_error(),
          );
          return;
        }

        const data = (await response.json()) as Record<string, unknown>[];
        if (!isActive) return;
        setReservations(mapGuestReservations(data));
      } catch {
        if (!isActive) return;
        setReservations(null);
        setError(m.my_reservations_error());
      } finally {
        if (isActive) {
          setIsLoadingReservations(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [token]);

  return (
    <section id="my-reservations" className="py-5" aria-labelledby="my-reservations-title">
      <Container>
        <h2 id="my-reservations-title" className="text-center mb-2 text-warning">
          <i className="bi bi-ticket-perforated me-2" aria-hidden="true" />
          {m.my_reservations_title()}
        </h2>
        <p className="text-center text-secondary mb-4">{m.my_reservations_description()}</p>

        <Row className="justify-content-center">
          <Col xs={12} sm={10} md={8} lg={6}>
            {!token && (
              <>
                <Form onSubmit={handleEmailSubmit} noValidate>
                  <Form.Group controlId="my-reservations-email" className="mb-3">
                    <Form.Label>{m.my_reservations_email_label()}</Form.Label>
                    <Form.Control
                      type="email"
                      placeholder={m.my_reservations_email_placeholder()}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isSubmittingEmail}
                      autoComplete="email"
                      className="bg-dark text-light border-secondary"
                    />
                  </Form.Group>

                  {error && (
                    <Alert variant="danger" className="mb-3">
                      <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                      {error}
                    </Alert>
                  )}

                  {requestSent && (
                    <Alert variant="info" className="mb-3">
                      <div className="fw-semibold mb-1">{m.my_reservations_request_success()}</div>
                      <div>
                        {deliveryMode === "development_log"
                          ? m.my_reservations_request_dev_notice()
                          : m.my_reservations_request_pending_notice()}
                      </div>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    variant="warning"
                    className="w-100"
                    disabled={isSubmittingEmail || !email.trim()}
                  >
                    {isSubmittingEmail ? (
                      <>
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                          className="me-2"
                        />
                        {m.my_reservations_requesting()}
                      </>
                    ) : (
                      <>
                        <i className="bi bi-envelope-paper me-2" aria-hidden="true" />
                        {m.my_reservations_request_link()}
                      </>
                    )}
                  </Button>
                </Form>
              </>
            )}

            {token && (
              <>
                {isLoadingReservations && (
                  <Alert variant="secondary" className="text-center">
                    <Spinner animation="border" size="sm" className="me-2" />
                    {m.my_reservations_loading()}
                  </Alert>
                )}

                {error && (
                  <Alert variant="danger" className="mb-3">
                    <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                    {error}
                  </Alert>
                )}

                {!isLoadingReservations && reservations !== null && (
                  <>
                    {reservations.length === 0 ? (
                      <Alert variant="info" className="text-center">
                        <i className="bi bi-inbox me-2" aria-hidden="true" />
                        {m.my_reservations_no_results()}
                      </Alert>
                    ) : (
                      <div className="d-flex flex-column gap-3">
                        {reservations.map((reservation) => (
                          <Card
                            key={reservation.id}
                            bg="dark"
                            text="white"
                            border="secondary"
                          >
                            <Card.Header className="d-flex align-items-center justify-content-between">
                              <span className="fw-semibold">
                                <i className="bi bi-calendar-event me-2" aria-hidden="true" />
                                {reservation.eventTitle}
                              </span>
                              <span className="text-secondary small">
                                {new Date(reservation.createdAt).toLocaleDateString()}
                              </span>
                            </Card.Header>
                            <Card.Body className="pb-2">
                              <div className="d-flex gap-2 flex-wrap mb-2">
                                <Badge
                                  bg={
                                    reservation.status === "confirmed"
                                      ? "success"
                                      : reservation.status === "cancelled"
                                        ? "danger"
                                        : "warning"
                                  }
                                >
                                  {reservation.status === "confirmed"
                                    ? m.admin_status_confirmed()
                                    : reservation.status === "cancelled"
                                      ? m.admin_status_cancelled()
                                      : m.admin_status_pending()}
                                </Badge>
                                <Badge
                                  bg={
                                    reservation.paymentStatus === "paid"
                                      ? "success"
                                      : reservation.paymentStatus === "partial"
                                        ? "warning"
                                        : "secondary"
                                  }
                                >
                                  {reservation.paymentStatus === "paid"
                                    ? m.admin_payment_paid()
                                    : reservation.paymentStatus === "partial"
                                      ? m.admin_payment_partial()
                                      : m.admin_payment_unpaid()}
                                </Badge>
                                {reservation.checkedIn && (
                                  <Badge bg="success">
                                    <i className="bi bi-check2-circle me-1" aria-hidden="true" />
                                    {m.admin_checked_in()}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-secondary small">
                                <i className="bi bi-people me-1" aria-hidden="true" />
                                {reservation.guestCount} {m.my_reservations_guests_label()}
                              </div>
                              {reservation.preOrders.length > 0 && (
                                <ListGroup variant="flush" className="mt-2">
                                  {reservation.preOrders.map((item, idx) => (
                                    <ListGroup.Item
                                      key={`${item.productId}-${idx}`}
                                      className="bg-dark text-light border-secondary d-flex justify-content-between align-items-center px-0 py-1"
                                    >
                                      <span className="small">
                                        {item.name} <Badge bg="secondary">×{item.quantity}</Badge>
                                      </span>
                                    </ListGroup.Item>
                                  ))}
                                </ListGroup>
                              )}
                            </Card.Body>
                          </Card>
                        ))}
                      </div>
                    )}

                    <Button
                      variant="outline-secondary"
                      size="sm"
                      className="mt-3 w-100"
                      onClick={resetToRequestForm}
                    >
                      <i className="bi bi-arrow-repeat me-2" aria-hidden="true" />
                      {m.my_reservations_request_new_link()}
                    </Button>
                  </>
                )}
              </>
            )}
          </Col>
        </Row>
      </Container>
    </section>
  );
}
