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

interface GuestOrderItemResponse {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
  category: string;
  delivered: boolean;
}

interface GuestReservationResponse {
  id: string;
  event_title: string;
  guest_count: number;
  status: ReservationStatus;
  payment_status: PaymentStatus;
  checked_in: boolean;
  checked_in_at?: string | null;
  strap_issued: boolean;
  created_at: string;
  pre_orders: GuestOrderItemResponse[];
}

interface ReservationLookupRequestAcceptedResponse {
  ok: boolean;
  delivery_mode: "email";
  expires_in_minutes: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReservationStatus(value: unknown): value is ReservationStatus {
  return value === "pending" || value === "confirmed" || value === "cancelled";
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === "unpaid" || value === "partial" || value === "paid";
}

function isGuestOrderItemResponse(value: unknown): value is GuestOrderItemResponse {
  return (
    isRecord(value) &&
    typeof value.product_id === "string" &&
    typeof value.name === "string" &&
    typeof value.quantity === "number" &&
    typeof value.price === "number" &&
    typeof value.category === "string" &&
    typeof value.delivered === "boolean"
  );
}

function isGuestReservationResponse(value: unknown): value is GuestReservationResponse {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.event_title === "string" &&
    typeof value.guest_count === "number" &&
    isReservationStatus(value.status) &&
    isPaymentStatus(value.payment_status) &&
    typeof value.checked_in === "boolean" &&
    (value.checked_in_at === undefined ||
      value.checked_in_at === null ||
      typeof value.checked_in_at === "string") &&
    typeof value.strap_issued === "boolean" &&
    typeof value.created_at === "string" &&
    Array.isArray(value.pre_orders) &&
    value.pre_orders.every(isGuestOrderItemResponse)
  );
}

function parseGuestReservationsResponse(value: unknown): GuestReservationResponse[] {
  if (!Array.isArray(value) || !value.every(isGuestReservationResponse)) {
    throw new Error("Invalid guest reservations response.");
  }
  return value;
}

function parseReservationLookupRequestAccepted(
  value: unknown,
): ReservationLookupRequestAcceptedResponse {
  if (
    !isRecord(value) ||
    typeof value.ok !== "boolean" ||
    value.delivery_mode !== "email" ||
    typeof value.expires_in_minutes !== "number"
  ) {
    throw new Error("Invalid reservation lookup request response.");
  }
  return {
    ok: value.ok,
    delivery_mode: value.delivery_mode,
    expires_in_minutes: value.expires_in_minutes,
  };
}

function mapGuestReservations(
  data: GuestReservationResponse[],
): GuestReservation[] {
  return data.map((reservation) => ({
    id: reservation.id,
    eventTitle: reservation.event_title,
    guestCount: reservation.guest_count,
    status: reservation.status as ReservationStatus,
    paymentStatus: reservation.payment_status as PaymentStatus,
    checkedIn: reservation.checked_in,
    checkedInAt: reservation.checked_in_at ?? undefined,
    strapIssued: reservation.strap_issued,
    createdAt: reservation.created_at,
    preOrders: reservation.pre_orders.map(
      (item) => ({
        productId: item.product_id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        category: item.category,
        delivered: item.delivered,
      }),
    ),
  }));
}

export default function MyReservationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [email, setEmail] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [reservations, setReservations] = useState<GuestReservation[] | null>(null);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [showRecoveryCTA, setShowRecoveryCTA] = useState(false);
  const [error, setError] = useState("");

  const resetToRequestForm = useCallback(() => {
    setSearchParams({}, { replace: true });
    setRequestSent(false);
    setReservations(null);
    setShowRecoveryCTA(false);
    setError("");
  }, [setSearchParams]);

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) return;
      if (!EMAIL_PATTERN.test(trimmed)) {
        setError(m.my_reservations_invalid_email());
        setRequestSent(false);
        return;
      }

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
          setError(
            response.status === 422
              ? m.my_reservations_invalid_email()
              : m.my_reservations_error(),
          );
          return;
        }
        parseReservationLookupRequestAccepted(await response.json());
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
    setShowRecoveryCTA(false);

    void (async () => {
      try {
        const response = await fetch("/api/reservations/my/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          if (!isActive) return;
          setShowRecoveryCTA(response.status === 401);
          setError(
            response.status === 401
              ? m.my_reservations_invalid_token()
              : m.my_reservations_error(),
          );
          return;
        }

        const data = parseGuestReservationsResponse(await response.json());
        if (!isActive) return;
        setReservations(mapGuestReservations(data));
        setShowRecoveryCTA(false);
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
                      isInvalid={Boolean(error)}
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
                      <div>{m.my_reservations_request_pending_notice()}</div>
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

                {!isLoadingReservations && (reservations !== null || showRecoveryCTA) && (
                  <>
                    {reservations !== null && reservations.length === 0 ? (
                      <Alert variant="info" className="text-center">
                        <i className="bi bi-inbox me-2" aria-hidden="true" />
                        {m.my_reservations_no_results()}
                      </Alert>
                    ) : reservations !== null ? (
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
                    ) : null}

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
