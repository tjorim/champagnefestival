import {
  CalendarDaysIcon,
  CircleCheckIcon,
  InboxIcon,
  LogOutIcon,
  MailOpenIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import { useForm, useSelector } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  PublicField,
  PublicInput,
  PublicLabel,
  PublicOption,
  PublicSelect,
  PublicTextarea,
} from "@/components/PublicFields";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
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
  const [oidcError, setOidcError] = useState(false);
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
      .catch(() => {
        // Surfaced via oidcError below rather than falling through to the
        // anonymous email-lookup form, which would otherwise silently show
        // for a signed-in member/volunteer whose own fetch failed.
        if (!cancelled) setOidcError(true);
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
    void fetchClaimableRegistrations(accessToken)
      .then((regs) => {
        if (!cancelled) setClaimableRegistrations(regs);
      })
      .catch(() => {
        // A failed preview is not actionable for the caller; keep the card hidden.
        if (!cancelled) setClaimableRegistrations([]);
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
    oidcError ||
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

  const emailForm = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      const trimmed = value.email.trim();
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
  });
  const email = useSelector(emailForm.atom, (s) => s.values.email);

  return (
    <div id="my-registrations">
      {!showRegistrationFlow && (
        <>
          <p className="tw:text-center tw:text-subtle tw:mb-6">
            {m.my_registrations_description()}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void emailForm.handleSubmit();
            }}
            noValidate
          >
            <PublicField controlId="my-registrations-email" className="tw:mb-4">
              <PublicLabel>{m.my_registrations_email_label()}</PublicLabel>
              <emailForm.Field name="email">
                {(field) => (
                  <PublicInput
                    type="email"
                    placeholder={m.my_registrations_email_placeholder()}
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    required
                    disabled={isSubmittingEmail}
                    autoComplete="email"
                    aria-invalid={isEmailInvalid}
                    aria-describedby={error ? "email-error" : undefined}
                  />
                )}
              </emailForm.Field>
            </PublicField>

            <div id="email-error" role="alert">
              {error && (
                <Alert variant="danger" className="tw:mb-4">
                  <Icon icon={TriangleAlertIcon} className="tw:me-2" />
                  {error}
                </Alert>
              )}
            </div>

            {requestSent && (
              <Alert variant="info" className="tw:mb-4" role="status" aria-live="polite">
                <div className="tw:font-semibold tw:mb-1">
                  {m.my_registrations_request_success()}
                </div>
                <div>{m.my_registrations_request_pending_notice()}</div>
              </Alert>
            )}

            <Button
              type="submit"
              variant="warning"
              className="tw:w-full"
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
                    className="tw:me-2"
                  />
                  {m.my_registrations_requesting()}
                </>
              ) : (
                <>
                  <Icon icon={MailOpenIcon} className="tw:me-2" />
                  {m.my_registrations_request_link()}
                </>
              )}
            </Button>
          </form>
          <Button
            variant="link"
            className="tw:w-full tw:mt-2 tw:text-subtle"
            onClick={() => auth.login("/me")}
          >
            {m.my_registrations_sign_in_instead()}
          </Button>
        </>
      )}

      {showRegistrationFlow && (
        <>
          {isLoadingRegistrations && (
            <Alert variant="secondary" className="tw:text-center">
              <Spinner animation="border" size="sm" className="tw:me-2" />
              {m.my_registrations_loading()}
            </Alert>
          )}

          {!isLoadingRegistrations &&
            !claimableDismissed &&
            claimableRegistrations !== null &&
            claimableRegistrations.length > 0 && (
              <Alert variant="warning" className="tw:mb-4">
                <div className="tw:font-semibold tw:mb-1">
                  {m.my_registrations_claimable_heading()}
                </div>
                <div className="tw:mb-2">{m.my_registrations_claimable_description()}</div>
                <div className="tw:flex tw:gap-2">
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
                  <div className="tw:text-sm tw:text-destructive tw:mt-2" role="alert">
                    {m.my_registrations_error()}
                  </div>
                )}
              </Alert>
            )}

          {tokenError && (
            <Alert variant="danger" className="tw:mb-4" role="alert">
              <Icon icon={TriangleAlertIcon} className="tw:me-2" />
              {tokenError}
            </Alert>
          )}

          {oidcError && (
            <Alert variant="danger" className="tw:mb-4" role="alert">
              <Icon icon={TriangleAlertIcon} className="tw:me-2" />
              {m.my_registrations_error()}
            </Alert>
          )}

          {!isLoadingRegistrations && (registrations !== null || showRecoveryCTA) && (
            <>
              {registrations !== null && registrations.length === 0 ? (
                <Alert variant="info" className="tw:text-center">
                  <Icon icon={InboxIcon} className="tw:me-2" />
                  {m.my_registrations_no_results()}
                </Alert>
              ) : registrations !== null ? (
                <div className="tw:flex tw:flex-col tw:gap-4">
                  {auth.isAuthenticated && registrations.length > 0 && (
                    <Card tone="secondary">
                      <CardContent>
                        <PublicField controlId="my-registrations-language">
                          <PublicLabel>{m.registration_preferred_language()}</PublicLabel>
                          <div className="tw:flex tw:gap-2">
                            <PublicSelect
                              value={preferredLanguage}
                              disabled={isPreferenceLoading || preferenceStatus === "saving"}
                              onValueChange={(language) => {
                                setPreferredLanguage(language as CommunicationLanguage);
                                setPreferenceStatus("");
                              }}
                            >
                              <PublicOption value="nl">Nederlands</PublicOption>
                              <PublicOption value="fr">Français</PublicOption>
                              <PublicOption value="en">English</PublicOption>
                            </PublicSelect>
                            <Button
                              variant="outline-warning"
                              disabled={isPreferenceLoading || preferenceStatus === "saving"}
                              onClick={() => void savePreference()}
                            >
                              {m.my_registrations_save_language()}
                            </Button>
                          </div>
                        </PublicField>
                        {preferenceStatus === "saved" && (
                          <div className="tw:text-sm tw:text-success tw:mt-2" role="status">
                            {m.my_registrations_language_saved()}
                          </div>
                        )}
                        {preferenceStatus === "error" && (
                          <div className="tw:text-sm tw:text-destructive tw:mt-2" role="alert">
                            {m.my_account_preference_error()}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  {registrations.map((registration) => (
                    <Card key={registration.id} tone="secondary">
                      <CardHeader className="tw:flex tw:items-center tw:justify-between">
                        <span className="tw:font-semibold">
                          <Icon icon={CalendarDaysIcon} className="tw:me-2" />
                          {registration.eventTitle}
                        </span>
                        <span className="tw:text-subtle tw:text-sm">
                          {new Date(registration.createdAt).toLocaleDateString()}
                        </span>
                      </CardHeader>
                      <CardContent className="tw:pb-2">
                        {registration.status !== "cancelled" && (
                          <div className="tw:text-center tw:mb-4">
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
                            <div className="tw:text-sm tw:text-subtle tw:mt-1">
                              {m.registration_reference({ reference: registration.id })}
                            </div>
                          </div>
                        )}
                        <div className="tw:flex tw:gap-2 tw:flex-wrap tw:mb-2">
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
                              <Icon icon={CircleCheckIcon} className="tw:me-1" />
                              {m.admin_checked_in()}
                            </Badge>
                          )}
                        </div>
                        <div className="tw:text-subtle tw:text-sm">
                          <Icon icon={UsersIcon} className="tw:me-1" />
                          {registration.guestCount} {m.my_registrations_guests_label()}
                        </div>
                        {registration.eventDate && (
                          <a
                            className="btn btn-sm btn-outline-warning tw:mt-2"
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
                            className="tw:mt-2 tw:ms-2"
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
                          <PresentationList flush className="tw:mt-2">
                            {registration.orderItems
                              .filter((item) => item.visible)
                              .map((item, idx) => (
                                <PresentationListItem
                                  key={`${item.productId}-${idx}`}
                                  className="tw:flex tw:justify-between tw:items-center tw:px-0 tw:py-1"
                                >
                                  <span className="tw:text-sm">
                                    {item.name} <Badge bg="secondary">×{item.quantity}</Badge>
                                  </span>
                                </PresentationListItem>
                              ))}
                          </PresentationList>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  <Alert variant="info" className="tw:mb-0">
                    {m.my_registrations_changes_contact()}
                  </Alert>
                </div>
              ) : null}

              {showSignOut && sessionExpiresAt && (
                <p className="tw:text-sm tw:text-subtle tw:text-center tw:mt-4 tw:mb-0">
                  {m.my_registrations_session_expires({
                    date: new Date(sessionExpiresAt).toLocaleDateString(),
                  })}
                </p>
              )}

              {showSignOut && signOutError && (
                <Alert variant="danger" className="tw:mt-4 tw:mb-0" role="alert">
                  <Icon icon={TriangleAlertIcon} className="tw:me-2" />
                  {signOutError}
                </Alert>
              )}

              {showSignOut ? (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  className="tw:mt-2 tw:w-full"
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
                    <Icon icon={LogOutIcon} className="tw:me-2" />
                  )}
                  {m.my_registrations_sign_out()}
                </Button>
              ) : (
                !auth.isAuthenticated && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="tw:mt-4 tw:w-full"
                    onClick={resetToRequestForm}
                  >
                    <Icon icon={RefreshCwIcon} className="tw:me-2" />
                    {m.my_registrations_request_new_link()}
                  </Button>
                )
              )}
            </>
          )}
        </>
      )}
      <Dialog
        open={requestRegistration !== null}
        onOpenChange={(open) => {
          if (!open) setRequestRegistration(null);
        }}
      >
        <DialogContent size="default">
          <DialogHeader>
            <DialogTitle>{m.my_registrations_request_change()}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {requestSubmitted ? (
              <Alert variant="success" role="status">
                {m.my_registrations_request_change_success()}
              </Alert>
            ) : (
              <>
                <Alert variant="warning">{m.my_registrations_request_change_warning()}</Alert>
                <PublicField className="tw:mb-4" controlId="my-registrations-request-type">
                  <PublicLabel>{m.my_registrations_request_type()}</PublicLabel>
                  <PublicSelect
                    value={requestType}
                    onValueChange={(type) => setRequestType(type as "change" | "cancellation")}
                  >
                    <PublicOption value="change">
                      {m.my_registrations_request_type_change()}
                    </PublicOption>
                    <PublicOption value="cancellation">
                      {m.my_registrations_request_type_cancellation()}
                    </PublicOption>
                  </PublicSelect>
                </PublicField>
                <PublicField controlId="my-registrations-request-details">
                  <PublicLabel>{m.my_registrations_request_details()}</PublicLabel>
                  <PublicTextarea
                    rows={4}
                    placeholder={m.my_registrations_request_details_placeholder()}
                    value={requestDetails}
                    onChange={(event) => setRequestDetails(event.target.value)}
                  />
                </PublicField>
                {bookingRequestMutation.isError && (
                  <Alert variant="danger" className="tw:mt-4 tw:mb-0" role="alert">
                    {m.my_registrations_request_change_error()}
                  </Alert>
                )}
              </>
            )}
          </DialogBody>
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
