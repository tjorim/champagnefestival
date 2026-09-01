import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
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
import { QRCodeSVG } from "qrcode.react";
import { m } from "@/paraglide/messages";
import {
  accessMyRegistrations,
  claimMyRegistrations,
  fetchOwnedRegistrations,
  isRegistrationLookupError,
  requestRegistrationLookup,
} from "@/utils/publicRegistrationApi";
import { EMAIL_REGEX } from "@/config/constants";
import { useAuth } from "@/contexts/AuthContext";

function calendarDateRange(date: string): string {
  const start = date.replaceAll("-", "");
  const endDate = new Date(`${date}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const end = endDate.toISOString().slice(0, 10).replaceAll("-", "");
  return `${start}/${end}`;
}

export function buildCheckInQrUrl(
  origin: string,
  registrationId: string,
  checkInToken: string,
): string {
  return `${origin}/check-in?id=${encodeURIComponent(registrationId)}#token=${encodeURIComponent(checkInToken)}`;
}

export default function MyRegistrationsPage() {
  const auth = useAuth();
  const { token: rawToken } = useSearch({ from: "/my-registrations" });
  const token = rawToken?.trim() ?? "";
  const navigate = useNavigate({ from: "/my-registrations" });

  const [email, setEmail] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [error, setError] = useState("");
  const [isEmailInvalid, setIsEmailInvalid] = useState(false);

  const requestLookupMutation = useMutation({
    mutationFn: requestRegistrationLookup,
    retry: false,
  });

  const accessToken = auth.getAccessToken();
  const attemptedToken = useRef("");
  const registrationsMutation = useMutation({
    mutationFn: async ({
      lookupToken,
      oidcToken,
    }: {
      lookupToken: string;
      oidcToken: string | null;
    }) => {
      await navigate({ search: {}, replace: true });
      if (!oidcToken) {
        return accessMyRegistrations(lookupToken);
      }
      try {
        await claimMyRegistrations(lookupToken, oidcToken);
      } catch (claimError) {
        if (isRegistrationLookupError(claimError) && claimError.code === "invalid_token") {
          throw claimError;
        }
        return fetchOwnedRegistrations(oidcToken);
      }
      return fetchOwnedRegistrations(oidcToken);
    },
    retry: false,
  });

  useEffect(() => {
    if (
      !token ||
      auth.isLoading ||
      (auth.isAuthenticated && !accessToken) ||
      attemptedToken.current === token
    ) {
      return;
    }

    attemptedToken.current = token;
    registrationsMutation.mutate({
      lookupToken: token,
      oidcToken: auth.isAuthenticated ? accessToken : null,
    });
  }, [accessToken, auth.isAuthenticated, auth.isLoading, navigate, registrationsMutation, token]);

  const registrations = registrationsMutation.data ?? null;
  const isSubmittingEmail = requestLookupMutation.isPending;
  const isLoadingRegistrations =
    registrationsMutation.isPending ||
    (token.length > 0 && (auth.isLoading || (auth.isAuthenticated && !accessToken)));
  const tokenError = registrationsMutation.isError
    ? registrationsMutation.error instanceof Error
      ? registrationsMutation.error.message
      : String(registrationsMutation.error)
    : "";
  const showRecoveryCTA =
    registrationsMutation.isError &&
    isRegistrationLookupError(registrationsMutation.error) &&
    registrationsMutation.error.code === "invalid_token";
  const showRegistrationFlow =
    token.length > 0 ||
    registrations !== null ||
    registrationsMutation.isPending ||
    registrationsMutation.isError;

  const resetToRequestForm = useCallback(() => {
    void navigate({ search: {}, replace: true });
    setRequestSent(false);
    setError("");
    setIsEmailInvalid(false);
    attemptedToken.current = "";
    registrationsMutation.reset();
  }, [navigate, registrationsMutation]);

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) return;
      if (!EMAIL_REGEX.test(trimmed)) {
        setError(m.my_registrations_invalid_email());
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

        setError(m.my_registrations_error());
      }
    },
    [email, requestLookupMutation],
  );

  return (
    <section id="my-registrations" className="py-5" aria-labelledby="my-registrations-title">
      <Container>
        <h2 id="my-registrations-title" className="text-center mb-2 text-warning">
          <i className="bi bi-ticket-perforated me-2" aria-hidden="true" />
          {m.my_registrations_title()}
        </h2>
        <p className="text-center text-secondary mb-4">{m.my_registrations_description()}</p>

        <Row className="justify-content-center">
          <Col xs={12} sm={10} md={8} lg={6}>
            {!showRegistrationFlow && (
              <>
                <Form onSubmit={handleEmailSubmit} noValidate>
                  <Form.Group controlId="my-registrations-email" className="mb-3">
                    <Form.Label>{m.my_registrations_email_label()}</Form.Label>
                    <Form.Control
                      type="email"
                      placeholder={m.my_registrations_email_placeholder()}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isSubmittingEmail}
                      autoComplete="email"
                      isInvalid={isEmailInvalid}
                      className="bg-dark text-light border-secondary"
                      aria-describedby={error ? "email-error" : undefined}
                    />
                  </Form.Group>

                  <div id="email-error" role="alert">
                    {error && (
                      <Alert variant="danger" className="mb-3">
                        <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                        {error}
                      </Alert>
                    )}
                  </div>

                  {requestSent && (
                    <Alert variant="info" className="mb-3" role="status" aria-live="polite">
                      <div className="fw-semibold mb-1">{m.my_registrations_request_success()}</div>
                      <div>{m.my_registrations_request_pending_notice()}</div>
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
                        {m.my_registrations_requesting()}
                      </>
                    ) : (
                      <>
                        <i className="bi bi-envelope-paper me-2" aria-hidden="true" />
                        {m.my_registrations_request_link()}
                      </>
                    )}
                  </Button>
                </Form>
              </>
            )}

            {showRegistrationFlow && (
              <>
                {isLoadingRegistrations && (
                  <Alert variant="secondary" className="text-center">
                    <Spinner animation="border" size="sm" className="me-2" />
                    {m.my_registrations_loading()}
                  </Alert>
                )}

                {tokenError && (
                  <Alert variant="danger" className="mb-3" role="alert">
                    <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                    {tokenError}
                  </Alert>
                )}

                {!isLoadingRegistrations && (registrations !== null || showRecoveryCTA) && (
                  <>
                    {registrations !== null && registrations.length === 0 ? (
                      <Alert variant="info" className="text-center">
                        <i className="bi bi-inbox me-2" aria-hidden="true" />
                        {m.my_registrations_no_results()}
                      </Alert>
                    ) : registrations !== null ? (
                      <div className="d-flex flex-column gap-3">
                        {registrations.map((registration) => (
                          <Card key={registration.id} bg="dark" text="white" border="secondary">
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
                              {registration.status !== "cancelled" && (
                                <div className="text-center mb-3">
                                  <QRCodeSVG
                                    value={buildCheckInQrUrl(
                                      window.location.origin,
                                      registration.id,
                                      registration.checkInToken,
                                    )}
                                    size={160}
                                    level="M"
                                    includeMargin
                                    aria-label={m.my_registrations_qr_label()}
                                  />
                                  <div className="small text-secondary mt-1">
                                    {m.registration_reference({ reference: registration.id })}
                                  </div>
                                </div>
                              )}
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
                                {registration.guestCount} {m.my_registrations_guests_label()}
                              </div>
                              {registration.eventDate && (
                                <a
                                  className="btn btn-sm btn-outline-warning mt-2"
                                  href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(registration.eventTitle)}&dates=${calendarDateRange(registration.eventDate)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {m.my_registrations_add_calendar()}
                                </a>
                              )}
                              {registration.orderItems.length > 0 && (
                                <ListGroup variant="flush" className="mt-2">
                                  {registration.orderItems.map((item, idx) => (
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
                      {m.my_registrations_request_new_link()}
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
