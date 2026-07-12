import clsx from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "@tanstack/react-router";
import Container from "react-bootstrap/Container";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import ListGroup from "react-bootstrap/ListGroup";
import Form from "react-bootstrap/Form";
import Collapse from "react-bootstrap/Collapse";
import { m } from "@/paraglide/messages";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/utils/queryKeys";
import { SESSION_EXPIRED_ERROR, UNAUTHORIZED_ERROR } from "@/utils/adminApi";
import {
  CheckInError,
  fetchCheckInRegistration,
  submitCheckIn,
  type CheckInData,
} from "@/utils/publicRegistrationApi";
import {
  searchVolunteerRegistrations,
  submitVolunteerCheckIn,
  updateVolunteerRegistration,
} from "@/utils/volunteerApi";

interface CheckInCardProps {
  registration: CheckInData;
  success: boolean;
  isAlreadyCheckedIn: boolean;
  isCheckingIn: boolean;
  isUpdatingRegistration: boolean;
  canManageEntranceActions: boolean;
  onCheckIn: () => void;
  onAdjustPreOrder: (productId: string, delta: number) => void;
  onSetPreOrderQuantity: (productId: string, quantity: number) => void;
  onIssueStrap: () => void;
}

function CheckInCard({
  registration,
  success,
  isAlreadyCheckedIn,
  isCheckingIn,
  isUpdatingRegistration,
  canManageEntranceActions,
  onCheckIn,
  onAdjustPreOrder,
  onSetPreOrderQuantity,
  onIssueStrap,
}: CheckInCardProps) {
  return (
    <Card
      bg="dark"
      text="white"
      border={success ? "success" : isAlreadyCheckedIn ? "warning" : "secondary"}
    >
      <Card.Header
        className={clsx(
          "d-flex align-items-center justify-content-between gap-3 flex-wrap",
          success ? "border-success" : isAlreadyCheckedIn ? "border-warning" : "border-secondary",
        )}
      >
        <span className="fw-semibold fs-5">
          <i className="bi bi-person-fill me-2" aria-hidden="true" />
          {registration.name}
        </span>
        <div className="d-flex gap-2 flex-wrap">
          {registration.checkedIn && (
            <Badge bg="success">
              <i className="bi bi-check-circle-fill me-1" aria-hidden="true" />
              {m.admin_checked_in()}
            </Badge>
          )}
          {registration.strapIssued && (
            <Badge bg="info">
              <i className="bi bi-person-badge-fill me-1" aria-hidden="true" />
              {m.admin_strap_issued()}
            </Badge>
          )}
        </div>
      </Card.Header>

      <Card.Body>
        <div role="status" aria-live="polite">
          {success && (
            <Alert variant="success" className="mb-3">
              <i className="bi bi-check-circle-fill me-2" aria-hidden="true" />
              <strong>{m.checkin_success()}</strong>
              {registration.strapIssued && <div className="mt-1">{m.checkin_strap_issued()}</div>}
            </Alert>
          )}
        </div>

        <div role="alert" aria-live="assertive">
          {isAlreadyCheckedIn && !success && registration.checkedInAt && (
            <Alert variant="warning" className="mb-3">
              <i className="bi bi-exclamation-circle-fill me-2" aria-hidden="true" />
              {m.checkin_already_in()} {new Date(registration.checkedInAt).toLocaleTimeString()}
            </Alert>
          )}
        </div>

        <ListGroup variant="flush" className="bg-dark">
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between gap-3">
            <span className="text-secondary">{m.checkin_event()}</span>
            <span className="text-end">{registration.eventTitle || registration.eventId}</span>
          </ListGroup.Item>
          <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between gap-3">
            <span className="text-secondary">{m.checkin_guests()}</span>
            <span>{registration.guestCount}</span>
          </ListGroup.Item>
          {registration.tableName && (
            <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between gap-3">
              <span className="text-secondary">{m.checkin_table()}</span>
              <span className="fw-semibold text-warning">{registration.tableName}</span>
            </ListGroup.Item>
          )}
        </ListGroup>

        {registration.preOrders.length > 0 && (
          <div className="mt-3">
            <p className="fw-semibold text-warning mb-2">
              <i className="bi bi-cart-fill me-2" aria-hidden="true" />
              {m.checkin_pre_orders()}
            </p>
            <ListGroup variant="flush">
              {registration.preOrders.map((item, idx) => (
                <ListGroup.Item
                  key={`${item.productId}-${idx}`}
                  className="bg-dark text-light border-secondary d-flex justify-content-between align-items-center gap-3 flex-wrap"
                >
                  <span>
                    {item.name} <Badge bg="secondary">×{item.quantity}</Badge>
                  </span>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Badge bg={item.delivered ? "success" : "secondary"}>
                      {m.admin_bottle_delivered()}: {item.deliveredQuantity}/{item.quantity}
                    </Badge>
                    <Badge bg={item.remainingQuantity > 0 ? "warning" : "success"} text="dark">
                      {m.admin_bottle_not_delivered()}: {item.remainingQuantity}
                    </Badge>
                    <div className="d-flex align-items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => onAdjustPreOrder(item.productId, -1)}
                        disabled={
                          !canManageEntranceActions ||
                          isUpdatingRegistration ||
                          item.deliveredQuantity <= 0
                        }
                        title={m.admin_mark_not_delivered()}
                      >
                        <i className="bi bi-dash" aria-hidden="true" />
                        <span className="visually-hidden">{m.admin_mark_not_delivered()}</span>
                      </Button>
                      <Form.Control
                        key={item.deliveredQuantity}
                        aria-label={`${m.admin_bottle_delivered()} ${item.name}`}
                        className="text-center"
                        inputMode="numeric"
                        min={0}
                        max={item.quantity}
                        onBlur={(event) => {
                          const deliveredQuantity = Number(event.currentTarget.value);
                          if (
                            Number.isFinite(deliveredQuantity) &&
                            deliveredQuantity !== item.deliveredQuantity
                          ) {
                            onSetPreOrderQuantity(item.productId, deliveredQuantity);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                        size="sm"
                        style={{ width: "5rem" }}
                        type="number"
                        defaultValue={item.deliveredQuantity}
                        disabled={!canManageEntranceActions || isUpdatingRegistration}
                      />
                      <Button
                        size="sm"
                        variant={item.delivered ? "success" : "outline-success"}
                        onClick={() => onAdjustPreOrder(item.productId, 1)}
                        disabled={
                          !canManageEntranceActions ||
                          isUpdatingRegistration ||
                          item.deliveredQuantity >= item.quantity
                        }
                        title={m.admin_mark_delivered()}
                      >
                        <i className="bi bi-plus" aria-hidden="true" />
                        <span className="visually-hidden">{m.admin_mark_delivered()}</span>
                      </Button>
                    </div>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
            {!canManageEntranceActions && registration.checkedIn && registration.strapIssued && (
              <div className="small text-secondary mt-2">
                <i className="bi bi-info-circle me-1" aria-hidden="true" />
                {m.checkin_actions_login_required()}
              </div>
            )}
          </div>
        )}
      </Card.Body>

      {(!registration.checkedIn || !registration.strapIssued) && (
        <Card.Footer className="bg-dark border-secondary d-grid gap-2">
          {!registration.checkedIn && (
            <Button variant="warning" className="w-100" onClick={onCheckIn} disabled={isCheckingIn}>
              {isCheckingIn ? (
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                  className="me-2"
                />
              ) : (
                <i className="bi bi-person-check-fill me-2" aria-hidden="true" />
              )}
              {m.checkin_do_checkin()}
            </Button>
          )}
          {registration.checkedIn && !registration.strapIssued && (
            <Button
              variant="info"
              className="w-100"
              onClick={onIssueStrap}
              disabled={!canManageEntranceActions || isUpdatingRegistration}
            >
              {isUpdatingRegistration ? (
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                  className="me-2"
                />
              ) : (
                <i className="bi bi-person-badge-fill me-2" aria-hidden="true" />
              )}
              {m.admin_issue_strap()}
            </Button>
          )}
          {!canManageEntranceActions && (
            <div className="small text-secondary">{m.checkin_actions_login_required()}</div>
          )}
        </Card.Footer>
      )}
    </Card>
  );
}

export default function CheckInPage() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { id: registrationId, token: checkInToken } = useSearch({
    from: "/admin-layout/check-in",
  });
  const location = useLocation();
  const [success, setSuccess] = useState(false);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [searchOpen, setSearchOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [manualRegistration, setManualRegistration] = useState<CheckInData | null>(null);
  const hasQrCredentials = Boolean(registrationId && checkInToken);
  const checkInQueryKey = queryKeys.checkInRegistration(registrationId ?? "", checkInToken ?? "");
  const canManageEntranceActions = auth.hasRole("admin") || auth.hasRole("volunteer");
  const returnTo = location.pathname + location.searchStr;

  const authHeaders = useCallback((): Record<string, string> => {
    const token = auth.getAccessToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [auth]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (hasQrCredentials) {
      setManualRegistration(null);
      setSuccess(false);
      setAlreadyCheckedIn(false);
      setSearchTerm("");
      setDebouncedSearchTerm("");
    }
  }, [registrationId, checkInToken, hasQrCredentials]);

  const registrationQuery = useQuery({
    queryKey: checkInQueryKey,
    queryFn: () => fetchCheckInRegistration(registrationId!, checkInToken!),
    enabled: hasQrCredentials,
    retry: false,
    staleTime: 30 * 1000,
  });

  const volunteerSearchQuery = useQuery({
    queryKey: queryKeys.volunteerRegistrationSearch(debouncedSearchTerm),
    queryFn: ({ signal }) => searchVolunteerRegistrations(debouncedSearchTerm, authHeaders, signal),
    enabled: !hasQrCredentials && canManageEntranceActions && debouncedSearchTerm.length >= 2,
    retry: false,
    staleTime: 15 * 1000,
  });

  const checkInMutation = useMutation({
    mutationFn: () => submitCheckIn(registrationId!, checkInToken!),
    retry: false,
    onMutate: () => {
      setSuccess(false);
      setAlreadyCheckedIn(false);
    },
    onSuccess: ({
      registration: updatedRegistration,
      alreadyCheckedIn: mutationAlreadyCheckedIn,
    }) => {
      queryClient.setQueryData(checkInQueryKey, updatedRegistration);
      setSuccess(true);
      setAlreadyCheckedIn(mutationAlreadyCheckedIn || updatedRegistration.checkedIn);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: checkInQueryKey });
    },
  });

  const volunteerCheckInMutation = useMutation({
    mutationFn: (regId: string) => submitVolunteerCheckIn(regId, authHeaders),
    retry: false,
    onMutate: () => {
      setSuccess(false);
      setAlreadyCheckedIn(false);
    },
    onSuccess: ({
      registration: updatedRegistration,
      alreadyCheckedIn: mutationAlreadyCheckedIn,
    }) => {
      setManualRegistration(updatedRegistration);
      setSuccess(true);
      setAlreadyCheckedIn(mutationAlreadyCheckedIn || updatedRegistration.checkedIn);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.volunteerRegistrationSearch(debouncedSearchTerm),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.registrations });
    },
  });

  const updateRegistrationMutation = useMutation({
    mutationFn: ({
      targetRegistration,
      preOrders,
      strapIssued,
    }: {
      targetRegistration: CheckInData;
      preOrders?: CheckInData["preOrders"];
      strapIssued?: boolean;
    }) =>
      updateVolunteerRegistration(targetRegistration.id, { preOrders, strapIssued }, authHeaders),
    retry: false,
    onSuccess: (updatedRegistration) => {
      setManualRegistration((prev) =>
        prev?.id === updatedRegistration.id ? updatedRegistration : prev,
      );
      if (hasQrCredentials) {
        queryClient.setQueryData(checkInQueryKey, updatedRegistration);
      }
      queryClient.setQueryData<CheckInData[]>(
        queryKeys.volunteerRegistrationSearch(debouncedSearchTerm),
        (prev) =>
          prev?.map((item) => (item.id === updatedRegistration.id ? updatedRegistration : item)),
      );
    },
    onSettled: async () => {
      if (hasQrCredentials) {
        await queryClient.invalidateQueries({ queryKey: checkInQueryKey });
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.volunteerRegistrationSearch(debouncedSearchTerm),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.registrations });
    },
  });

  const registration = manualRegistration ?? registrationQuery.data ?? null;
  const isLoading = hasQrCredentials ? registrationQuery.isPending : false;
  const isCheckingIn = checkInMutation.isPending || volunteerCheckInMutation.isPending;
  const isUpdatingRegistration = updateRegistrationMutation.isPending;
  const queryError = registrationQuery.isError ? registrationQuery.error.message : "";
  const mutationError = checkInMutation.isError
    ? checkInMutation.error instanceof CheckInError
      ? checkInMutation.error.message
      : m.checkin_error()
    : volunteerCheckInMutation.isError
      ? volunteerCheckInMutation.error.message
      : updateRegistrationMutation.isError
        ? updateRegistrationMutation.error.message === SESSION_EXPIRED_ERROR
          ? m.checkin_actions_session_expired()
          : updateRegistrationMutation.error.message === UNAUTHORIZED_ERROR
            ? m.checkin_actions_unauthorized()
            : updateRegistrationMutation.error.message
        : "";
  const isAlreadyCheckedIn = success ? alreadyCheckedIn : (registration?.checkedIn ?? false);
  const searchResults = debouncedSearchTerm.length >= 2 ? (volunteerSearchQuery.data ?? []) : [];
  const showSearchHint =
    !hasQrCredentials && searchTerm.trim().length > 0 && searchTerm.trim().length < 2;
  const shouldShowAuthLoadingGate = !hasQrCredentials && auth.isLoading;

  const handleCheckIn = useCallback(() => {
    if (hasQrCredentials) {
      checkInMutation.mutate();
      return;
    }
    if (!manualRegistration) return;
    volunteerCheckInMutation.mutate(manualRegistration.id);
  }, [checkInMutation, hasQrCredentials, manualRegistration, volunteerCheckInMutation]);

  const handleSetPreOrderQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (!registration || !Number.isFinite(quantity)) return;
      const updatedOrders = registration.preOrders.map((item) => {
        if (item.productId !== productId) return item;
        const deliveredQuantity = Math.max(0, Math.min(item.quantity, Math.trunc(quantity)));
        return {
          ...item,
          deliveredQuantity,
          remainingQuantity: item.quantity - deliveredQuantity,
          delivered: deliveredQuantity === item.quantity,
        };
      });
      updateRegistrationMutation.mutate({
        targetRegistration: registration,
        preOrders: updatedOrders,
      });
    },
    [registration, updateRegistrationMutation],
  );

  const handleAdjustPreOrder = useCallback(
    (productId: string, delta: number) => {
      if (!registration) return;
      const item = registration.preOrders.find((order) => order.productId === productId);
      if (!item) return;
      handleSetPreOrderQuantity(productId, item.deliveredQuantity + delta);
    },
    [handleSetPreOrderQuantity, registration],
  );

  const handleIssueStrap = useCallback(() => {
    if (!registration) return;
    updateRegistrationMutation.mutate({ targetRegistration: registration, strapIssued: true });
  }, [registration, updateRegistrationMutation]);

  const handleSelectManualRegistration = useCallback((selected: CheckInData) => {
    setManualRegistration(selected);
    setSuccess(false);
    setAlreadyCheckedIn(selected.checkedIn);
    setSearchOpen(false);
  }, []);

  return (
    <section id="check-in" className="py-5" aria-labelledby="checkin-title">
      <Container>
        <h2 id="checkin-title" className="text-center mb-4 text-warning">
          <i className="bi bi-qr-code-scan me-2" aria-hidden="true" />
          {m.checkin_title()}
        </h2>

        {shouldShowAuthLoadingGate ? (
          <div className="text-center py-4">
            <Spinner animation="border" variant="warning" role="status">
              <span className="visually-hidden">{m.admin_loading()}</span>
            </Spinner>
            <p className="mt-2 text-secondary">{m.admin_loading()}</p>
          </div>
        ) : (
          <div className="row justify-content-center">
            <div className="col-12 col-sm-10 col-md-8 col-lg-6">
              {!hasQrCredentials && (
                <>
                  <Alert variant="warning" className="text-center">
                    <i className="bi bi-info-circle me-2" aria-hidden="true" />
                    {m.checkin_scan_prompt()}
                  </Alert>

                  <Card bg="dark" text="white" border="secondary" className="mb-3">
                    <Card.Header className="bg-dark border-secondary p-0">
                      <Button
                        variant="link"
                        className="w-100 text-start text-warning text-decoration-none p-3 d-flex justify-content-between align-items-center"
                        onClick={() => setSearchOpen((open) => !open)}
                        aria-expanded={searchOpen}
                        aria-controls="manual-checkin-search"
                      >
                        <span>
                          <i className="bi bi-search me-2" aria-hidden="true" />
                          {m.checkin_manual_search_title()}
                        </span>
                        <i
                          className={clsx("bi", searchOpen ? "bi-chevron-up" : "bi-chevron-down")}
                          aria-hidden="true"
                        />
                      </Button>
                    </Card.Header>
                    <Collapse in={searchOpen}>
                      <Card.Body id="manual-checkin-search">
                        {!auth.isAuthenticated && (
                          <Alert
                            variant="info"
                            className="d-flex justify-content-between align-items-center gap-3 flex-wrap"
                          >
                            <span>{m.checkin_manual_search_login_required()}</span>
                            <Button
                              variant="outline-warning"
                              size="sm"
                              onClick={() => auth.login(returnTo)}
                            >
                              {m.admin_login_button()}
                            </Button>
                          </Alert>
                        )}
                        {auth.isAuthenticated && !canManageEntranceActions && (
                          <Alert variant="warning">{m.checkin_manual_search_unauthorized()}</Alert>
                        )}

                        <Form.Group controlId="manual-checkin-query">
                          <Form.Label>{m.checkin_manual_search_label()}</Form.Label>
                          <Form.Control
                            type="search"
                            value={searchTerm}
                            onChange={(event) => {
                              setSearchTerm(event.currentTarget.value);
                              setManualRegistration(null);
                              setSuccess(false);
                              setAlreadyCheckedIn(false);
                            }}
                            placeholder={m.checkin_manual_search_placeholder()}
                            disabled={!canManageEntranceActions}
                          />
                          <Form.Text className="text-secondary">
                            {m.checkin_manual_search_help()}
                          </Form.Text>
                        </Form.Group>

                        {showSearchHint && (
                          <div className="text-secondary mt-3">
                            {m.checkin_manual_search_min_chars()}
                          </div>
                        )}

                        {volunteerSearchQuery.isFetching && (
                          <div className="text-secondary mt-3" role="status" aria-live="polite">
                            <Spinner
                              as="span"
                              animation="border"
                              size="sm"
                              role="status"
                              aria-hidden="true"
                              className="me-2"
                            />
                            {m.checkin_manual_search_loading()}
                          </div>
                        )}

                        {volunteerSearchQuery.isError && (
                          <Alert variant="danger" className="mt-3 mb-0" role="alert">
                            <i
                              className="bi bi-exclamation-triangle-fill me-2"
                              aria-hidden="true"
                            />
                            {volunteerSearchQuery.error.message === SESSION_EXPIRED_ERROR
                              ? m.checkin_manual_search_session_expired()
                              : volunteerSearchQuery.error.message === UNAUTHORIZED_ERROR
                                ? m.checkin_manual_search_unauthorized()
                                : volunteerSearchQuery.error.message}
                          </Alert>
                        )}

                        {!volunteerSearchQuery.isFetching &&
                          debouncedSearchTerm.length >= 2 &&
                          searchResults.length === 0 &&
                          !volunteerSearchQuery.isError && (
                            <div className="text-secondary mt-3">
                              {m.checkin_manual_search_no_results()}
                            </div>
                          )}

                        {searchResults.length > 0 && (
                          <ListGroup className="mt-3">
                            {searchResults.map((result) => (
                              <ListGroup.Item
                                key={result.id}
                                action
                                variant="dark"
                                className="border-secondary d-flex justify-content-between align-items-center gap-3"
                                onClick={() => handleSelectManualRegistration(result)}
                              >
                                <span>
                                  <span className="fw-semibold d-block">{result.name}</span>
                                  <span className="text-secondary small">
                                    {result.eventTitle || result.eventId} · {m.checkin_guests()}:{" "}
                                    {result.guestCount}
                                  </span>
                                </span>
                                <Badge bg={result.checkedIn ? "success" : "secondary"}>
                                  {result.checkedIn
                                    ? m.admin_checked_in()
                                    : m.checkin_manual_not_checked_in()}
                                </Badge>
                              </ListGroup.Item>
                            ))}
                          </ListGroup>
                        )}
                      </Card.Body>
                    </Collapse>
                  </Card>
                </>
              )}

              {isLoading && (
                <div className="text-center py-4">
                  <Spinner animation="border" variant="warning" role="status">
                    <span className="visually-hidden">{m.checkin_looking_up()}</span>
                  </Spinner>
                  <p className="mt-2 text-secondary">{m.checkin_looking_up()}</p>
                </div>
              )}

              {(mutationError || queryError) && (
                <Alert variant="danger" role="alert">
                  <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                  {mutationError || queryError}
                </Alert>
              )}

              {registration && !isLoading && (
                <CheckInCard
                  registration={registration}
                  success={success}
                  isAlreadyCheckedIn={isAlreadyCheckedIn}
                  isCheckingIn={isCheckingIn}
                  isUpdatingRegistration={isUpdatingRegistration}
                  canManageEntranceActions={canManageEntranceActions}
                  onCheckIn={handleCheckIn}
                  onAdjustPreOrder={handleAdjustPreOrder}
                  onSetPreOrderQuantity={handleSetPreOrderQuantity}
                  onIssueStrap={handleIssueStrap}
                />
              )}
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
