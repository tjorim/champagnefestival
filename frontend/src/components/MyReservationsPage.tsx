import { useState, useCallback } from "react";
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

export default function MyReservationsPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [reservations, setReservations] = useState<GuestReservation[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) return;

      setIsLoading(true);
      setError("");
      setReservations(null);

      try {
        const response = await fetch(
          `/api/reservations/my?email=${encodeURIComponent(trimmed)}`,
        );
        if (response.ok) {
          const data = (await response.json()) as Record<string, unknown>[];
          setReservations(
            data.map((r) => ({
              id: r.id as string,
              eventTitle: (r.event_title ?? "") as string,
              guestCount: (r.guest_count ?? 1) as number,
              status: (r.status ?? "pending") as ReservationStatus,
              paymentStatus: (r.payment_status ?? "unpaid") as PaymentStatus,
              checkedIn: (r.checked_in ?? false) as boolean,
              checkedInAt: r.checked_in_at as string | undefined,
              strapIssued: (r.strap_issued ?? false) as boolean,
              createdAt: (r.created_at ?? "") as string,
              preOrders: ((r.pre_orders ?? []) as Record<string, unknown>[]).map(
                (item) => ({
                  productId: item.product_id as string,
                  name: item.name as string,
                  quantity: item.quantity as number,
                  price: item.price as number,
                  category: item.category as string,
                  delivered: (item.delivered ?? false) as boolean,
                }),
              ),
            })),
          );
          setSubmitted(true);
        } else {
          setError(m.my_reservations_error());
        }
      } catch {
        setError(m.my_reservations_error());
      } finally {
        setIsLoading(false);
      }
    },
    [email],
  );

  const handleReset = useCallback(() => {
    setSubmitted(false);
    setReservations(null);
    setEmail("");
    setError("");
  }, []);

  return (
    <section id="my-reservations" className="py-5" aria-labelledby="my-reservations-title">
      <Container>
        <h2
          id="my-reservations-title"
          className="text-center mb-2 text-warning"
        >
          <i className="bi bi-ticket-perforated me-2" aria-hidden="true" />
          {m.my_reservations_title()}
        </h2>
        <p className="text-center text-secondary mb-4">
          {m.my_reservations_description()}
        </p>

        <Row className="justify-content-center">
          <Col xs={12} sm={10} md={8} lg={6}>
            {!submitted && (
              <Form onSubmit={handleSubmit} noValidate>
                <Form.Group controlId="my-reservations-email" className="mb-3">
                  <Form.Label>{m.my_reservations_email_label()}</Form.Label>
                  <Form.Control
                    type="email"
                    placeholder={m.my_reservations_email_placeholder()}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
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

                <Button
                  type="submit"
                  variant="warning"
                  className="w-100"
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
            )}

            {submitted && reservations !== null && (
              <>
                {reservations.length === 0 ? (
                  <Alert variant="info" className="text-center">
                    <i className="bi bi-inbox me-2" aria-hidden="true" />
                    {m.my_reservations_no_results()}
                  </Alert>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {reservations.map((r) => (
                      <Card key={r.id} bg="dark" text="white" border="secondary">
                        <Card.Header className="d-flex align-items-center justify-content-between">
                          <span className="fw-semibold">
                            <i className="bi bi-calendar-event me-2" aria-hidden="true" />
                            {r.eventTitle}
                          </span>
                          <span className="text-secondary small">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </span>
                        </Card.Header>
                        <Card.Body className="pb-2">
                          <div className="d-flex gap-2 flex-wrap mb-2">
                            <Badge
                              bg={
                                r.status === "confirmed"
                                  ? "success"
                                  : r.status === "cancelled"
                                    ? "danger"
                                    : "warning"
                              }
                            >
                              {r.status === "confirmed"
                                ? m.admin_status_confirmed()
                                : r.status === "cancelled"
                                  ? m.admin_status_cancelled()
                                  : m.admin_status_pending()}
                            </Badge>
                            <Badge
                              bg={
                                r.paymentStatus === "paid"
                                  ? "success"
                                  : r.paymentStatus === "partial"
                                    ? "warning"
                                    : "secondary"
                              }
                            >
                              {r.paymentStatus === "paid"
                                ? m.admin_payment_paid()
                                : r.paymentStatus === "partial"
                                  ? m.admin_payment_partial()
                                  : m.admin_payment_unpaid()}
                            </Badge>
                            {r.checkedIn && (
                              <Badge bg="success">
                                <i className="bi bi-check2-circle me-1" aria-hidden="true" />
                                {m.admin_checked_in()}
                              </Badge>
                            )}
                          </div>
                          <div className="text-secondary small">
                            <i className="bi bi-people me-1" aria-hidden="true" />
                            {r.guestCount} {m.my_reservations_guests_label()}
                          </div>
                          {r.preOrders.length > 0 && (
                            <ListGroup variant="flush" className="mt-2">
                              {r.preOrders.map((item, idx) => (
                                <ListGroup.Item
                                  key={`${item.productId}-${idx}`}
                                  className="bg-dark text-light border-secondary d-flex justify-content-between align-items-center px-0 py-1"
                                >
                                  <span className="small">
                                    {item.name}{" "}
                                    <Badge bg="secondary">×{item.quantity}</Badge>
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
                  onClick={handleReset}
                >
                  <i className="bi bi-arrow-left me-2" aria-hidden="true" />
                  {m.my_reservations_search_again()}
                </Button>
              </>
            )}
          </Col>
        </Row>
      </Container>
    </section>
  );
}
