import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
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
import type { PaymentStatus, RegistrationStatus } from "@/types/registration";

interface GuestRegistration {
  id: string;
  eventTitle: string;
  guestCount: number;
  status: RegistrationStatus;
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

interface GuestRegistrationResponse {
  id: string;
  event_title: string;
  guest_count: number;
  status: RegistrationStatus;
  payment_status: PaymentStatus;
  checked_in: boolean;
  checked_in_at?: string | null;
  strap_issued: boolean;
  created_at: string;
  pre_orders: GuestOrderItemResponse[];
}

interface RegistrationLookupRequestAcceptedResponse {
  ok: boolean;
  delivery_mode: "email";
  expires_in_minutes: number;
}

class RegistrationLookupError extends Error {
  code: "invalid_email" | "invalid_token" | "request_failed";

  constructor(
    code: "invalid_email" | "invalid_token" | "request_failed",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

function isRegistrationLookupError(error: unknown): error is RegistrationLookupError {
  return error instanceof RegistrationLookupError;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const myRegistrationsQueryKey = (token: string) => ["my-registrations", token] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRegistrationStatus(value: unknown): value is RegistrationStatus {
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

function isGuestRegistrationResponse(value: unknown): value is GuestRegistrationResponse {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.event_title === "string" &&
    typeof value.guest_count === "number" &&
    isRegistrationStatus(value.status) &&
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

function parseGuestRegistrationsResponse(value: unknown): GuestRegistrationResponse[] {
  if (!Array.isArray(value) || !value.every(isGuestRegistrationResponse)) {
    throw new Error("Invalid guest registrations response.");
  }
  return value;
}

function parseRegistrationLookupRequestAccepted(
  value: unknown,
): RegistrationLookupRequestAcceptedResponse {
  if (
    !isRecord(value) ||
    typeof value.ok !== "boolean" ||
    value.delivery_mode !== "email" ||
    typeof value.expires_in_minutes !== "number"
  ) {
    throw new Error("Invalid registration lookup request response.");
  }
  return {
    ok: value.ok,
    delivery_mode: value.delivery_mode,
    expires_in_minutes: value.expires_in_minutes,
  };
}

function mapGuestRegistrations(
  data: GuestRegistrationResponse[],
): GuestRegistration[] {
  return data.map((registration) => ({
    id: registration.id,
    eventTitle: registration.event_title,
    guestCount: registration.guest_count,
    status: registration.status as RegistrationStatus,
    paymentStatus: registration.payment_status as PaymentStatus,
    checkedIn: registration.checked_in,
    checkedInAt: registration.checked_in_at ?? undefined,
    strapIssued: registration.strap_issued,
    createdAt: registration.created_at,
    preOrders: registration.pre_orders.map(
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

async function requestRegistrationLookup(email: string): Promise<RegistrationLookupRequestAcceptedResponse> {
  const response = await fetch("/api/registrations/my/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new RegistrationLookupError(
      response.status === 422 ? "invalid_email" : "request_failed",
      response.status === 422 ? m.my_reservations_invalid_email() : m.my_reservations_error(),
    );
  }

  return parseRegistrationLookupRequestAccepted(await response.json());
}

async function fetchMyRegistrations(token: string): Promise<GuestRegistration[]> {
  const response = await fetch("/api/registrations/my/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new RegistrationLookupError(
      response.status === 401 ? "invalid_token" : "request_failed",
      response.status === 401 ? m.my_reservations_invalid_token() : m.my_reservations_error(),
    );
  }

  const data = parseGuestRegistrationsResponse(await response.json());
  return mapGuestRegistrations(data);
}

export default function MyRegistrationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [email, setEmail] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [error, setError] = useState("");
  const [isEmailInvalid, setIsEmailInvalid] = useState(false);

  const requestLookupMutation = useMutation({
    mutationFn: requestRegistrationLookup,
    retry: false,
  });

  const registrationsQuery = useQuery({
    queryKey: myRegistrationsQueryKey(token),
    queryFn: () => fetchMyRegistrations(token),
    enabled: token.length > 0,
    retry: false,
    staleTime: 30 * 1000,
  });

  const registrations = registrationsQuery.data ?? null;
  const isSubmittingEmail = requestLookupMutation.isPending;
  const isLoadingRegistrations = registrationsQuery.isPending;
  const tokenError = registrationsQuery.isError ? registrationsQuery.error.message : "";
  const showRecoveryCTA =
    registrationsQuery.isError &&
    isRegistrationLookupError(registrationsQuery.error) &&
    registrationsQuery.error.code === "invalid_token";

  const resetToRequestForm = useCallback(() => {
    setSearchParams({}, { replace: true });
    setRequestSent(false);
    setError("");
    setIsEmailInvalid(false);
  }, [setSearchParams]);

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) return;
      if (!EMAIL_PATTERN.test(trimmed)) {
        setError(m.my_reservations_invalid_email());
        setIsEmailInvalid(true);
        setRequestSent(false);
        return;
      }

      setError("");
      setIsEmailInvalid(false);
      setRequestSent(false);

      try {
        await requestLookupMutation.mutateAsync(trimmed);
        setRequestSent(true);
      } catch (mutationError) {
        if (isRegistrationLookupError(mutationError)) {
          setError(mutationError.message);
          setIsEmailInvalid(mutationError.code === "invalid_email");
          return;
        }

        setError(m.my_reservations_error());
      }
    },
    [email, requestLookupMutation],
  );

  return (
    <section id="my-registrations" className="py-5" aria-labelledby="my-registrations-title">
      <Container>
        <h2 id="my-registrations-title" className="text-center mb-2 text-warning">
          <i className="bi bi-ticket-perforated me-2" aria-hidden="true" />
          {m.my_reservations_title()}
        </h2>
        <p className="text-center text-secondary mb-4">{m.my_reservations_description()}</p>

        <Row className="justify-content-center">
          <Col xs={12} sm={10} md={8} lg={6}>
            {!token && (
              <>
                <Form onSubmit={handleEmailSubmit} noValidate>
                  <Form.Group controlId="my-registrations-email" className="mb-3">
                    <Form.Label>{m.my_reservations_email_label()}</Form.Label>
                    <Form.Control
                      type="email"
                      placeholder={m.my_reservations_email_placeholder()}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isSubmittingEmail}
                      autoComplete="email"
                      isInvalid={isEmailInvalid}
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
                {isLoadingRegistrations && (
                  <Alert variant="secondary" className="text-center">
                    <Spinner animation="border" size="sm" className="me-2" />
                    {m.my_reservations_loading()}
                  </Alert>
                )}

                {tokenError && (
                  <Alert variant="danger" className="mb-3">
                    <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                    {tokenError}
                  </Alert>
                )}

                {!isLoadingRegistrations && (registrations !== null || showRecoveryCTA) && (
                  <>
                    {registrations !== null && registrations.length === 0 ? (
                      <Alert variant="info" className="text-center">
                        <i className="bi bi-inbox me-2" aria-hidden="true" />
                        {m.my_reservations_no_results()}
                      </Alert>
                    ) : registrations !== null ? (
                      <div className="d-flex flex-column gap-3">
                        {registrations.map((registration) => (
                          <Card
                            key={registration.id}
                            bg="dark"
                            text="white"
                            border="secondary"
                          >
                            <Card.Header className="d-flex align-items-center justify-content-between">
                              <span className="fw-semibold">
                                <i className="bi bi-calendar-event me-2" aria-hidden="true" />
                                {registration.eventTitle}
                              </span>
                              <span className="text-secondary small">
                                {new Date(registration.createdAt).toLocaleDateString()}
                              </span>
                            </Card.Header>
                            <Card.Body className="pb-2">
                              <div className="d-flex gap-2 flex-wrap mb-2">
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
                                {registration.checkedIn && (
                                  <Badge bg="success">
                                    <i className="bi bi-check2-circle me-1" aria-hidden="true" />
                                    {m.admin_checked_in()}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-secondary small">
                                <i className="bi bi-people me-1" aria-hidden="true" />
                                {registration.guestCount} {m.my_reservations_guests_label()}
                              </div>
                              {registration.preOrders.length > 0 && (
                                <ListGroup variant="flush" className="mt-2">
                                  {registration.preOrders.map((item, idx) => (
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
