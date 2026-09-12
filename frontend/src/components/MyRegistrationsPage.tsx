import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { QRCodeSVG } from "qrcode.react";
import { m } from "@/paraglide/messages";
import {
  claimVerifiedEmailRegistrations,
  fetchClaimableRegistrations,
  fetchOwnedRegistrations,
  fetchOwnedRegistrationsViaSession,
  getVisitorSessionStatus,
  isRegistrationLookupError,
  redeemVisitorMagicLink,
  requestBookingChange,
  requestVisitorMagicLink,
  signOutVisitorSession,
  type GuestRegistration,
} from "@/utils/publicRegistrationApi";
import { EMAIL_REGEX } from "@/config/constants";
import { useAuth } from "@/contexts/AuthContext";
import { getLocale } from "@/paraglide/runtime";
import {
  getCommunicationPreference,
  updateCommunicationPreference,
  type CommunicationLanguage,
} from "@/utils/meApi";

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
  const { token: rawToken } = useSearch({ from: "/me" });
  const token = rawToken?.trim() ?? "";
  const navigate = useNavigate({ from: "/me" });
  const accessToken = auth.getAccessToken();

  const [email, setEmail] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [error, setError] = useState("");
  const [isEmailInvalid, setIsEmailInvalid] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<CommunicationLanguage>(getLocale());
  const [preferenceStatus, setPreferenceStatus] = useState<"" | "saving" | "saved" | "error">("");
  const [isPreferenceLoading, setIsPreferenceLoading] = useState(false);
  const preferenceRequestId = useRef(0);

  // A returning visitor's passwordless session (#953) — checked once on
  // mount so "check my order again next week" works without a fresh email,
  // separate from the token-redemption mutation below (which handles a
  // *new* link being opened).
  const [sessionRegistrations, setSessionRegistrations] = useState<GuestRegistration[] | null>(
    null,
  );
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [requestRegistration, setRequestRegistration] = useState<GuestRegistration | null>(null);
  const [requestType, setRequestType] = useState<"change" | "cancellation">("change");
  const [requestDetails, setRequestDetails] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const submissionId = useRef(crypto.randomUUID());

  const bookingRequestMutation = useMutation({
    mutationFn: () =>
      requestBookingChange(
        requestRegistration?.id ?? "",
        requestType,
        requestDetails,
        submissionId.current,
        accessToken,
      ),
    retry: false,
    onSuccess: () => setRequestSubmitted(true),
  });

  const requestLookupMutation = useMutation({
    mutationFn: (targetEmail: string) => requestVisitorMagicLink(targetEmail),
    retry: false,
  });

  const attemptedToken = useRef("");
  // Reactive twin of attemptedToken, for the render-time checks below —
  // reading a ref's .current directly during render isn't safe/reactive.
  const [tokenAttempted, setTokenAttempted] = useState(false);
  const registrationsMutation = useMutation({
    mutationFn: async (lookupToken: string) => {
      await navigate({ search: {}, replace: true });
      return redeemVisitorMagicLink(lookupToken);
    },
    retry: false,
  });

  useEffect(() => {
    if (!token || attemptedToken.current === token) return;

    attemptedToken.current = token;
    setTokenAttempted(true);
    registrationsMutation.mutate(token);
  }, [registrationsMutation, token]);

  useEffect(() => {
    if (token || auth.isLoading || auth.isAuthenticated || sessionChecked) return;
    let cancelled = false;
    void getVisitorSessionStatus().then((status) => {
      if (cancelled) return;
      if (!status.authenticated) {
        setSessionChecked(true);
        return;
      }
      setSessionExpiresAt(status.expiresAt);
      void fetchOwnedRegistrationsViaSession()
        .then((regs) => {
          if (!cancelled) setSessionRegistrations(regs);
        })
        .finally(() => {
          if (!cancelled) setSessionChecked(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [token, auth.isLoading, auth.isAuthenticated, sessionChecked]);

  // A signed-in member/volunteer with no token in the URL — e.g. they just
  // navigated straight to /me — already owns any registration booked while
  // signed in (Registration.user_id is set at booking time). No claim step
  // needed: fetch their own registrations directly.
  const [oidcRegistrations, setOidcRegistrations] = useState<GuestRegistration[] | null>(null);
  const [oidcChecked, setOidcChecked] = useState(false);
  useEffect(() => {
    // attemptedToken guards against double-fetching: once a token claim has
    // run (or is running) for this page load, that flow already owns
    // fetching registrations — even after it clears the token from the URL,
    // which would otherwise make this effect's own `!token` guard re-fire.
    if (
      token ||
      attemptedToken.current ||
      auth.isLoading ||
      !auth.isAuthenticated ||
      !accessToken ||
      oidcChecked
    ) {
      return;
    }
    let cancelled = false;
    void fetchOwnedRegistrations(accessToken)
      .then((regs) => {
        if (!cancelled) setOidcRegistrations(regs);
      })
      .finally(() => {
        if (!cancelled) setOidcChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, auth.isLoading, auth.isAuthenticated, accessToken, oidcChecked]);

  const registrations =
    registrationsMutation.data ?? sessionRegistrations ?? oidcRegistrations ?? null;

  // A signed-in caller's own verified email may match bookings placed while
  // signed out — previewed here, never linked without an explicit confirm
  // (#1044: an earlier version of this did so silently, which is exactly
  // the "randomly linked" behaviour that isn't acceptable for someone
  // else's account data, even when it's provably the same person).
  const [claimableRegistrations, setClaimableRegistrations] = useState<GuestRegistration[] | null>(
    null,
  );
  const [claimableDismissed, setClaimableDismissed] = useState(false);
  useEffect(() => {
    if (!auth.isAuthenticated || !accessToken) return;
    let cancelled = false;
    void fetchClaimableRegistrations(accessToken).then((regs) => {
      if (!cancelled) setClaimableRegistrations(regs);
    });
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, accessToken]);

  const claimVerifiedEmailMutation = useMutation({
    mutationFn: () => claimVerifiedEmailRegistrations(accessToken ?? ""),
    retry: false,
    onSuccess: (regs) => {
      setOidcRegistrations(regs);
      setClaimableRegistrations(null);
    },
  });

  useEffect(() => {
    if (!auth.isAuthenticated || !accessToken || registrations === null) return;
    const requestId = ++preferenceRequestId.current;
    setIsPreferenceLoading(true);
    void getCommunicationPreference(accessToken)
      .then((language) => {
        if (requestId !== preferenceRequestId.current) return;
        if (language) setPreferredLanguage(language);
      })
      .catch(() => {
        if (requestId === preferenceRequestId.current) setPreferenceStatus("error");
      })
      .finally(() => {
        if (requestId === preferenceRequestId.current) setIsPreferenceLoading(false);
      });
  }, [accessToken, auth.isAuthenticated, registrations]);

  const savePreference = async () => {
    if (!accessToken) return;
    preferenceRequestId.current += 1;
    setIsPreferenceLoading(false);
    setPreferenceStatus("saving");
    try {
      await updateCommunicationPreference(accessToken, preferredLanguage);
      setPreferenceStatus("saved");
    } catch {
      setPreferenceStatus("error");
    }
  };
  const isSubmittingEmail = requestLookupMutation.isPending;
  const isLoadingRegistrations =
    registrationsMutation.isPending ||
    (!token && !tokenAttempted && auth.isAuthenticated && !oidcChecked);
  const tokenError = registrationsMutation.isError
    ? registrationsMutation.error instanceof Error
      ? registrationsMutation.error.message
      : String(registrationsMutation.error)
    : "";
  const showRecoveryCTA =
    registrationsMutation.isError &&
    isRegistrationLookupError(registrationsMutation.error) &&
    registrationsMutation.error.code === "invalid_token";
  const showSignOut = !auth.isAuthenticated && registrations !== null;
  // Not gated on the returning-visitor session check (sessionChecked) below:
  // the common case has no session, and gating this would flash a loading
  // spinner in front of the email form on every visit just to rule that out.
  // A session, when one exists, instead promotes registrations from null to
  // non-null once found, which the registrations !== null branch already
  // switches this on for. An OIDC session is different: auth.isAuthenticated
  // is known synchronously (no network round trip), so it's worth gating on
  // oidcChecked to avoid flashing the anonymous email-lookup form at a
  // signed-in member/volunteer for an instant before their own registrations
  // load.
  const showRegistrationFlow =
    token.length > 0 ||
    registrations !== null ||
    registrationsMutation.isPending ||
    registrationsMutation.isError ||
    (!tokenAttempted && auth.isAuthenticated && !oidcChecked);

  const resetToRequestForm = useCallback(() => {
    void navigate({ search: {}, replace: true });
    setRequestSent(false);
    setError("");
    setIsEmailInvalid(false);
    attemptedToken.current = "";
    setTokenAttempted(false);
    registrationsMutation.reset();
  }, [navigate, registrationsMutation, setError, setIsEmailInvalid, setRequestSent]);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    setSignOutError("");
    try {
      await signOutVisitorSession();
    } catch {
      // Local "signed in" state must only clear once sign-out actually
      // succeeded server-side — otherwise the UI would show the sign-in
      // form while the session and cookie are still valid (PR #1012 review).
      // Shown next to the sign-out button itself: the generic `error` state
      // above only renders in the email-request form, which isn't visible
      // while viewing results.
      setIsSigningOut(false);
      setSignOutError(m.my_registrations_error());
      return;
    }
    setIsSigningOut(false);
    setSessionRegistrations(null);
    setSessionExpiresAt(null);
    setSessionChecked(true);
    resetToRequestForm();
  }, [resetToRequestForm]);

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
    [email, requestLookupMutation, setError, setIsEmailInvalid, setRequestSent],
  );

  return (
    <div id="my-registrations">
      {!showRegistrationFlow && (
        <>
          <p className="text-center text-secondary mb-4">{m.my_registrations_description()}</p>
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
          <Button
            variant="link"
            className="w-100 mt-2 text-secondary"
            onClick={() => auth.login("/me")}
          >
            {m.my_registrations_sign_in_instead()}
          </Button>
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

          {!isLoadingRegistrations &&
            !claimableDismissed &&
            claimableRegistrations !== null &&
            claimableRegistrations.length > 0 && (
              <Alert variant="warning" className="mb-3">
                <div className="fw-semibold mb-1">{m.my_registrations_claimable_heading()}</div>
                <div className="mb-2">{m.my_registrations_claimable_description()}</div>
                <div className="d-flex gap-2">
                  <Button
                    size="sm"
                    variant="warning"
                    disabled={claimVerifiedEmailMutation.isPending}
                    onClick={() => claimVerifiedEmailMutation.mutate()}
                  >
                    {claimVerifiedEmailMutation.isPending ? (
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        role="status"
                        aria-hidden="true"
                      />
                    ) : (
                      m.my_registrations_claimable_confirm()
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={claimVerifiedEmailMutation.isPending}
                    onClick={() => setClaimableDismissed(true)}
                  >
                    {m.my_registrations_claimable_dismiss()}
                  </Button>
                </div>
                {claimVerifiedEmailMutation.isError && (
                  <div className="small text-danger mt-2" role="alert">
                    {m.my_registrations_error()}
                  </div>
                )}
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
                  {auth.isAuthenticated && registrations.length > 0 && (
                    <Card bg="dark" text="white" border="secondary">
                      <Card.Body>
                        <Form.Label htmlFor="my-registrations-language">
                          {m.registration_preferred_language()}
                        </Form.Label>
                        <div className="d-flex gap-2">
                          <Form.Select
                            id="my-registrations-language"
                            value={preferredLanguage}
                            disabled={isPreferenceLoading || preferenceStatus === "saving"}
                            onChange={(event) => {
                              setPreferredLanguage(event.target.value as CommunicationLanguage);
                              setPreferenceStatus("");
                            }}
                          >
                            <option value="nl">Nederlands</option>
                            <option value="fr">Français</option>
                            <option value="en">English</option>
                          </Form.Select>
                          <Button
                            variant="outline-warning"
                            disabled={isPreferenceLoading || preferenceStatus === "saving"}
                            onClick={() => void savePreference()}
                          >
                            {m.my_registrations_save_language()}
                          </Button>
                        </div>
                        {preferenceStatus === "saved" && (
                          <div className="small text-success mt-2" role="status">
                            {m.my_registrations_language_saved()}
                          </div>
                        )}
                        {preferenceStatus === "error" && (
                          <div className="small text-danger mt-2" role="alert">
                            {m.my_account_preference_error()}
                          </div>
                        )}
                      </Card.Body>
                    </Card>
                  )}
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
                        {registration.status !== "cancelled" && (
                          <Button
                            size="sm"
                            variant="outline-light"
                            className="mt-2 ms-2"
                            onClick={() => {
                              submissionId.current = crypto.randomUUID();
                              setRequestRegistration(registration);
                              setRequestType("change");
                              setRequestDetails("");
                              setRequestSubmitted(false);
                              bookingRequestMutation.reset();
                            }}
                          >
                            {m.my_registrations_request_change()}
                          </Button>
                        )}
                        {registration.orderItems.some((item) => item.visible) && (
                          <ListGroup variant="flush" className="mt-2">
                            {registration.orderItems
                              .filter((item) => item.visible)
                              .map((item, idx) => (
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
                  <Alert variant="info" className="mb-0">
                    {m.my_registrations_changes_contact()}
                  </Alert>
                </div>
              ) : null}

              {showSignOut && sessionExpiresAt && (
                <p className="small text-secondary text-center mt-3 mb-0">
                  {m.my_registrations_session_expires({
                    date: new Date(sessionExpiresAt).toLocaleDateString(),
                  })}
                </p>
              )}

              {showSignOut && signOutError && (
                <Alert variant="danger" className="mt-3 mb-0" role="alert">
                  <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                  {signOutError}
                </Alert>
              )}

              {showSignOut ? (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  className="mt-2 w-100"
                  disabled={isSigningOut}
                  onClick={() => void handleSignOut()}
                >
                  {isSigningOut ? (
                    <Spinner
                      as="span"
                      animation="border"
                      size="sm"
                      role="status"
                      aria-hidden="true"
                    />
                  ) : (
                    <i className="bi bi-box-arrow-right me-2" aria-hidden="true" />
                  )}
                  {m.my_registrations_sign_out()}
                </Button>
              ) : (
                !auth.isAuthenticated && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="mt-3 w-100"
                    onClick={resetToRequestForm}
                  >
                    <i className="bi bi-arrow-repeat me-2" aria-hidden="true" />
                    {m.my_registrations_request_new_link()}
                  </Button>
                )
              )}
            </>
          )}
        </>
      )}
      <Modal
        show={requestRegistration !== null}
        onHide={() => setRequestRegistration(null)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>{m.my_registrations_request_change()}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {requestSubmitted ? (
            <Alert variant="success" role="status">
              {m.my_registrations_request_change_success()}
            </Alert>
          ) : (
            <>
              <Alert variant="warning">{m.my_registrations_request_change_warning()}</Alert>
              <Form.Group className="mb-3">
                <Form.Label>{m.my_registrations_request_type()}</Form.Label>
                <Form.Select
                  value={requestType}
                  onChange={(event) =>
                    setRequestType(event.target.value as "change" | "cancellation")
                  }
                >
                  <option value="change">{m.my_registrations_request_type_change()}</option>
                  <option value="cancellation">
                    {m.my_registrations_request_type_cancellation()}
                  </option>
                </Form.Select>
              </Form.Group>
              <Form.Group>
                <Form.Label>{m.my_registrations_request_details()}</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  placeholder={m.my_registrations_request_details_placeholder()}
                  value={requestDetails}
                  onChange={(event) => setRequestDetails(event.target.value)}
                />
              </Form.Group>
              {bookingRequestMutation.isError && (
                <Alert variant="danger" className="mt-3 mb-0" role="alert">
                  {m.my_registrations_request_change_error()}
                </Alert>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setRequestRegistration(null)}>
            {m.close()}
          </Button>
          {!requestSubmitted && (
            <Button
              variant="warning"
              disabled={bookingRequestMutation.isPending}
              onClick={() => bookingRequestMutation.mutate()}
            >
              {m.my_registrations_submit_request()}
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </div>
  );
}
