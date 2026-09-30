import {
  ChevronDown,
  ChevronUp,
  CircleAlertIcon,
  CircleCheckIcon,
  ContactRoundIcon,
  InfoIcon,
  MapIcon,
  MinusIcon,
  OctagonXIcon,
  PlusIcon,
  ScanQrCodeIcon,
  Search,
  ShoppingCartIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  UserIcon,
  WifiOffIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import clsx from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect } from "react";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import ListGroup from "react-bootstrap/ListGroup";
import Form from "react-bootstrap/Form";
import { Button as SearchButton } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { m } from "@/paraglide/messages";
import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { queryKeys } from "@/utils/queryKeys";
import { SESSION_EXPIRED_ERROR, UNAUTHORIZED_ERROR } from "@/utils/adminApi";
import CheckInScanner, { type ScannedCheckInCredentials } from "@/components/CheckInScanner";
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

const AUTO_RETURN_TO_SCANNER_MS = 4000;

function formatEntranceActionError(message: string): string {
  if (message === SESSION_EXPIRED_ERROR) {
    return m.checkin_actions_session_expired();
  }
  if (message === UNAUTHORIZED_ERROR) {
    return m.checkin_actions_unauthorized();
  }
  return message;
}

interface CheckInCardProps {
  registration: CheckInData;
  success: boolean;
  isAlreadyCheckedIn: boolean;
  isCheckingIn: boolean;
  isUpdatingRegistration: boolean;
  canManageEntranceActions: boolean;
  onCheckIn: () => void;
  onAdjustOrderItem: (productId: string, delta: number) => void;
  onSetOrderItemQuantity: (productId: string, quantity: number) => void;
  onIssueStrap: () => void;
  onReturnToScanner: () => void;
}

function CheckInCard({
  registration,
  success,
  isAlreadyCheckedIn,
  isCheckingIn,
  isUpdatingRegistration,
  canManageEntranceActions,
  onCheckIn,
  onAdjustOrderItem,
  onSetOrderItemQuantity,
  onIssueStrap,
  onReturnToScanner,
}: CheckInCardProps) {
  const isCancelled = registration.status === "cancelled";
  const canUpdateEntrance = canManageEntranceActions && !isCancelled;
  return (
    <Card
      bg="dark"
      text="white"
      border={success ? "success" : isAlreadyCheckedIn ? "warning" : "secondary"}
    >
      <Card.Header
        className={clsx(
          "tw:flex tw:items-center tw:justify-between tw:gap-4 tw:flex-wrap",
          success ? "border-success" : isAlreadyCheckedIn ? "border-warning" : "border-secondary",
        )}
      >
        <span className="tw:font-semibold tw:text-xl">
          <Icon icon={UserIcon} className="tw:me-2" />
          {registration.name}
        </span>
        <div className="tw:flex tw:gap-2 tw:flex-wrap">
          {isCancelled && <Badge bg="danger">{m.admin_status_cancelled()}</Badge>}
          {registration.checkedIn && (
            <Badge bg="success">
              <Icon icon={CircleCheckIcon} className="tw:me-1" />
              {m.admin_checked_in()}
            </Badge>
          )}
          {registration.strapIssued && (
            <Badge bg="info">
              <Icon icon={ContactRoundIcon} className="tw:me-1" />
              {m.admin_strap_issued()}
            </Badge>
          )}
        </div>
      </Card.Header>

      <Card.Body>
        <div role="status" aria-live="polite">
          {success && (
            <Alert variant="success" className="tw:mb-4">
              <div className="tw:flex tw:justify-between tw:items-center tw:gap-4 tw:flex-wrap">
                <span>
                  <Icon icon={CircleCheckIcon} className="tw:me-2" />
                  <strong>{m.checkin_success()}</strong>
                  {registration.strapIssued && (
                    <div className="tw:mt-1">{m.checkin_strap_issued()}</div>
                  )}
                </span>
                <Button variant="outline-success" size="sm" onClick={onReturnToScanner}>
                  <Icon icon={ScanQrCodeIcon} className="tw:me-2" />
                  {m.checkin_scan_next()}
                </Button>
              </div>
            </Alert>
          )}
        </div>
        {canManageEntranceActions && registration.editionId && registration.tableId && (
          <Link
            to="/venue-plan"
            search={{ edition: registration.editionId, table: registration.tableId }}
            className="btn btn-outline-warning tw:w-full tw:mb-4"
          >
            <Icon icon={MapIcon} className="tw:me-2" />
            {m.venue_plan_show_table()}
          </Link>
        )}

        <div role="alert" aria-live="assertive">
          {isCancelled && (
            <Alert variant="danger" className="tw:mb-4">
              <Icon icon={OctagonXIcon} className="tw:me-2" />
              {m.admin_status_cancelled()}
            </Alert>
          )}
          {isAlreadyCheckedIn && !success && registration.checkedInAt && (
            <Alert variant="warning" className="tw:mb-4">
              <Icon icon={CircleAlertIcon} className="tw:me-2" />
              {m.checkin_already_in()} {new Date(registration.checkedInAt).toLocaleTimeString()}
            </Alert>
          )}
        </div>

        <ListGroup variant="flush" className="bg-dark">
          <ListGroup.Item className="bg-dark tw:text-content border-secondary tw:flex tw:justify-between tw:gap-4">
            <span className="tw:text-subtle">{m.checkin_event()}</span>
            <span className="tw:text-right">{registration.eventTitle || registration.eventId}</span>
          </ListGroup.Item>
          <ListGroup.Item className="bg-dark tw:text-content border-secondary tw:flex tw:justify-between tw:gap-4">
            <span className="tw:text-subtle">{m.checkin_guests()}</span>
            <span>{registration.guestCount}</span>
          </ListGroup.Item>
          {registration.tableName && (
            <ListGroup.Item className="bg-dark tw:text-content border-secondary tw:flex tw:justify-between tw:gap-4">
              <span className="tw:text-subtle">{m.checkin_table()}</span>
              <span className="tw:font-semibold tw:text-highlight">{registration.tableName}</span>
            </ListGroup.Item>
          )}
        </ListGroup>

        {registration.orderItems.length > 0 && (
          <div className="tw:mt-4">
            <p className="tw:font-semibold tw:text-highlight tw:mb-2">
              <Icon icon={ShoppingCartIcon} className="tw:me-2" />
              {m.checkin_order_items()}
            </p>
            <ListGroup variant="flush">
              {registration.orderItems.map((item, idx) => (
                <ListGroup.Item
                  key={`${item.productId}-${idx}`}
                  className="bg-dark tw:text-content border-secondary tw:flex tw:justify-between tw:items-center tw:gap-4 tw:flex-wrap"
                >
                  <span>
                    {item.name} <Badge bg="secondary">×{item.quantity}</Badge>
                  </span>
                  <div className="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
                    <Badge bg={item.delivered ? "success" : "secondary"}>
                      {m.admin_bottle_delivered()}: {item.deliveredQuantity}/{item.quantity}
                    </Badge>
                    <Badge bg={item.remainingQuantity > 0 ? "warning" : "success"} text="dark">
                      {m.admin_bottle_not_delivered()}: {item.remainingQuantity}
                    </Badge>
                    <div className="tw:flex tw:items-center tw:gap-1">
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => onAdjustOrderItem(item.productId, -1)}
                        disabled={
                          !canUpdateEntrance ||
                          isUpdatingRegistration ||
                          item.deliveredQuantity <= 0
                        }
                        title={m.admin_mark_not_delivered()}
                      >
                        <Icon icon={MinusIcon} />
                        <span className="tw:sr-only">{m.admin_mark_not_delivered()}</span>
                      </Button>
                      <Form.Control
                        key={item.deliveredQuantity}
                        aria-label={`${m.admin_bottle_delivered()} ${item.name}`}
                        className="tw:w-20 tw:text-center"
                        inputMode="numeric"
                        min={0}
                        max={item.quantity}
                        onBlur={(event) => {
                          const value = Number(event.currentTarget.value);
                          if (Number.isFinite(value)) {
                            const bounded = Math.max(0, Math.min(item.quantity, Math.trunc(value)));
                            event.currentTarget.value = String(bounded);
                            if (bounded !== item.deliveredQuantity) {
                              onSetOrderItemQuantity(item.productId, bounded);
                            }
                          } else {
                            event.currentTarget.value = String(item.deliveredQuantity);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                        size="sm"

                        type="number"
                        defaultValue={item.deliveredQuantity}
                        disabled={!canUpdateEntrance || isUpdatingRegistration}
                      />
                      <Button
                        size="sm"
                        variant={item.delivered ? "success" : "outline-success"}
                        onClick={() => onAdjustOrderItem(item.productId, 1)}
                        disabled={
                          !canUpdateEntrance ||
                          isUpdatingRegistration ||
                          item.deliveredQuantity >= item.quantity
                        }
                        title={m.admin_mark_delivered()}
                      >
                        <Icon icon={PlusIcon} />
                        <span className="tw:sr-only">{m.admin_mark_delivered()}</span>
                      </Button>
                    </div>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
            {!canManageEntranceActions && registration.checkedIn && registration.strapIssued && (
              <div className="tw:text-sm tw:text-subtle tw:mt-2">
                <Icon icon={InfoIcon} className="tw:me-1" />
                {m.checkin_actions_login_required()}
              </div>
            )}
          </div>
        )}
      </Card.Body>

      {!isCancelled && (!registration.checkedIn || !registration.strapIssued) && (
        <Card.Footer className="bg-dark border-secondary tw:grid tw:gap-2">
          {!registration.checkedIn && (
            <Button
              variant="warning"
              className="tw:w-full"
              onClick={onCheckIn}
              disabled={isCheckingIn}
            >
              {isCheckingIn ? (
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                  className="tw:me-2"
                />
              ) : (
                <Icon icon={UserCheckIcon} className="tw:me-2" />
              )}
              {m.checkin_do_checkin()}
            </Button>
          )}
          {registration.checkedIn && !registration.strapIssued && (
            <Button
              variant="info"
              className="tw:w-full"
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
                  className="tw:me-2"
                />
              ) : (
                <Icon icon={ContactRoundIcon} className="tw:me-2" />
              )}
              {m.admin_issue_strap()}
            </Button>
          )}
          {!canManageEntranceActions && (
            <div className="tw:text-sm tw:text-subtle">{m.checkin_actions_login_required()}</div>
          )}
        </Card.Footer>
      )}
    </Card>
  );
}

export default function CheckInPage() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const isOnline = useOnlineStatus();
  const { id: urlRegistrationId } = useSearch({
    from: "/admin-layout/check-in",
  });
  const navigate = useNavigate({ from: "/check-in" });
  const location = useLocation();
  const [fragmentCheckInToken, setFragmentCheckInToken] = useState(() => {
    const value = new URLSearchParams(location.hash.replace(/^#/, "")).get("token");
    return value ?? undefined;
  });
  // An in-page scan overrides the URL-driven id/token so the scanner can hand
  // off to the existing lookup flow without a navigation or app switch.
  const [scannedCredentials, setScannedCredentials] = useState<ScannedCheckInCredentials | null>(
    null,
  );
  const registrationId = scannedCredentials?.id ?? urlRegistrationId;
  const checkInToken = scannedCredentials?.token ?? fragmentCheckInToken;
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

  useEffect(() => {
    if (fragmentCheckInToken) {
      window.history.replaceState(window.history.state, "", returnTo);
    }
  }, [fragmentCheckInToken, returnTo]);

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

  // A fresh QR scan brings a new registrationId/checkInToken pair — reset the
  // local UI state for it. Adjust during render (comparing against the
  // previous scan) rather than in an effect, since this only needs to react
  // to that identity actually changing.
  const scanKey = `${registrationId ?? ""}:${checkInToken ?? ""}`;
  const [prevScanKey, setPrevScanKey] = useState(scanKey);
  if (scanKey !== prevScanKey) {
    setPrevScanKey(scanKey);
    if (hasQrCredentials) {
      setManualRegistration(null);
      setSuccess(false);
      setAlreadyCheckedIn(false);
      setSearchTerm("");
      setDebouncedSearchTerm("");
    }
  }

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
      orderItems,
      strapIssued,
    }: {
      targetRegistration: CheckInData;
      orderItems?: CheckInData["orderItems"];
      strapIssued?: boolean;
    }) =>
      updateVolunteerRegistration(targetRegistration.id, { orderItems, strapIssued }, authHeaders),
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
      ? formatEntranceActionError(volunteerCheckInMutation.error.message)
      : updateRegistrationMutation.isError
        ? formatEntranceActionError(updateRegistrationMutation.error.message)
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

  const handleSetOrderItemQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (!registration || !Number.isFinite(quantity)) return;
      const updatedOrders = registration.orderItems.map((item) => {
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
        orderItems: updatedOrders,
      });
    },
    [registration, updateRegistrationMutation],
  );

  const handleAdjustOrderItem = useCallback(
    (productId: string, delta: number) => {
      if (!registration) return;
      const item = registration.orderItems.find((order) => order.productId === productId);
      if (!item) return;
      handleSetOrderItemQuantity(productId, item.deliveredQuantity + delta);
    },
    [handleSetOrderItemQuantity, registration],
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

  const handleScanDecode = useCallback((result: ScannedCheckInCredentials) => {
    setScannedCredentials(result);
  }, []);

  const handleReturnToScanner = useCallback(() => {
    setScannedCredentials(null);
    setFragmentCheckInToken(undefined);
    setManualRegistration(null);
    setSuccess(false);
    setAlreadyCheckedIn(false);
    if (urlRegistrationId) {
      void navigate({ search: {}, replace: true });
    }
  }, [navigate, urlRegistrationId]);

  // Once nothing is left for the volunteer to do on this guest, clear the
  // card automatically so the next scan can start right away. A pending
  // strap issuance keeps the card up until it's handled (or "Scan next" is
  // pressed explicitly) so entrance actions are never skipped silently.
  const canAutoReturnToScanner =
    success &&
    (!canManageEntranceActions ||
      registration?.status === "cancelled" ||
      (registration?.strapIssued ?? false));
  useEffect(() => {
    if (!canAutoReturnToScanner) return;
    const timer = window.setTimeout(handleReturnToScanner, AUTO_RETURN_TO_SCANNER_MS);
    return () => window.clearTimeout(timer);
  }, [canAutoReturnToScanner, handleReturnToScanner]);

  return (
    <section id="check-in" className="tw:py-12" aria-labelledby="checkin-title">
      <div className="site-container tw:mx-auto tw:w-full">
        <h2 id="checkin-title" className="tw:text-center tw:mb-6 tw:text-highlight">
          <Icon icon={ScanQrCodeIcon} className="tw:me-2" />
          {m.checkin_title()}
        </h2>

        {!isOnline && (
          <Alert variant="danger" className="tw:w-20 tw:text-center" role="status">
            <Icon icon={WifiOffIcon} className="tw:me-2" />
            {m.checkin_offline_banner()}
          </Alert>
        )}

        {auth.authError ? (
          <Alert variant="danger" dismissible onClose={auth.clearAuthError}>
            <Alert.Heading as="h3" className="tw:text-base tw:font-medium tw:leading-tight">
              {m.auth_error_title()}
            </Alert.Heading>
            <p className="tw:mb-0">{auth.authError}</p>
          </Alert>
        ) : null}

        {shouldShowAuthLoadingGate ? (
          <div className="tw:text-center tw:py-6">
            <Spinner animation="border" variant="warning" role="status">
              <span className="tw:sr-only">{m.admin_loading()}</span>
            </Spinner>
            <p className="tw:mt-2 tw:text-subtle">{m.admin_loading()}</p>
          </div>
        ) : (
          <div className="tw:flex tw:flex-wrap tw:-mx-3 tw:*:w-full tw:*:px-column-gutter tw:justify-center">
            <div className="tw:w-full tw:site-sm:w-10/12 tw:site-md:w-8/12 tw:site-lg:w-6/12">
              {!hasQrCredentials && (
                <>
                  <CheckInScanner onDecode={handleScanDecode} />

                  <Alert variant="warning" className="tw:w-20 tw:text-center">
                    <Icon icon={InfoIcon} className="tw:me-2" />
                    {m.checkin_scan_prompt()}
                  </Alert>

                  <Collapsible open={searchOpen} onOpenChange={setSearchOpen}>
                    <Card bg="dark" text="white" border="secondary" className="tw:mb-4">
                      <Card.Header className="bg-dark border-secondary tw:p-0">
                        <CollapsibleTrigger
                          render={<SearchButton variant="ghost" />}
                          className="tw:flex tw:w-full tw:items-center tw:justify-between tw:p-4 tw:text-left tw:text-warning"
                          aria-expanded={searchOpen}
                          aria-controls="manual-checkin-search"
                        >
                          <span>
                            <Search className="tw:mr-2 tw:inline tw:size-4" aria-hidden="true" />
                            {m.checkin_manual_search_title()}
                          </span>
                          {searchOpen ? (
                            <ChevronUp aria-hidden="true" className="tw:size-4" />
                          ) : (
                            <ChevronDown aria-hidden="true" className="tw:size-4" />
                          )}
                        </CollapsibleTrigger>
                      </Card.Header>
                      <CollapsibleContent id="manual-checkin-search" keepMounted>
                        <Card.Body>
                          {!auth.isAuthenticated && (
                            <Alert
                              variant="info"
                              className="tw:flex tw:justify-between tw:items-center tw:gap-4 tw:flex-wrap"
                            >
                              <span>{m.checkin_manual_search_login_required()}</span>
                              <Button
                                variant="outline-warning"
                                size="sm"
                                onClick={() => auth.login(returnTo)}
                                disabled={auth.isSigningIn}
                              >
                                {auth.isSigningIn ? (
                                  <>
                                    <Spinner
                                      as="span"
                                      animation="border"
                                      size="sm"
                                      className="tw:me-2"
                                      aria-hidden="true"
                                    />
                                    {m.auth_signing_in()}
                                  </>
                                ) : (
                                  m.admin_login_button()
                                )}
                              </Button>
                            </Alert>
                          )}
                          {auth.isAuthenticated && !canManageEntranceActions && (
                            <Alert variant="warning">
                              {m.checkin_manual_search_unauthorized()}
                            </Alert>
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
                            <Form.Text className="tw:text-subtle">
                              {m.checkin_manual_search_help()}
                            </Form.Text>
                          </Form.Group>

                          {showSearchHint && (
                            <div className="tw:text-subtle tw:mt-4">
                              {m.checkin_manual_search_min_chars()}
                            </div>
                          )}

                          {volunteerSearchQuery.isFetching && (
                            <div
                              className="tw:text-subtle tw:mt-4"
                              role="status"
                              aria-live="polite"
                            >
                              <Spinner
                                as="span"
                                animation="border"
                                size="sm"
                                role="status"
                                aria-hidden="true"
                                className="tw:me-2"
                              />
                              {m.checkin_manual_search_loading()}
                            </div>
                          )}

                          {volunteerSearchQuery.isError && (
                            <Alert variant="danger" className="tw:mt-4 tw:mb-0" role="alert">
                              <Icon icon={TriangleAlertIcon} className="tw:me-2" />
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
                              <div className="tw:text-subtle tw:mt-4">
                                {m.checkin_manual_search_no_results()}
                              </div>
                            )}

                          {searchResults.length > 0 && (
                            <ListGroup className="tw:mt-4">
                              {searchResults.map((result) => (
                                <ListGroup.Item
                                  key={result.id}
                                  action
                                  variant="dark"
                                  className="border-secondary tw:flex tw:justify-between tw:items-center tw:gap-4"
                                  onClick={() => handleSelectManualRegistration(result)}
                                >
                                  <span>
                                    <span className="tw:font-semibold tw:block">{result.name}</span>
                                    <span className="tw:text-subtle tw:text-sm">
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
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                </>
              )}

              {isLoading && (
                <div className="tw:text-center tw:py-6">
                  <Spinner animation="border" variant="warning" role="status">
                    <span className="tw:sr-only">{m.checkin_looking_up()}</span>
                  </Spinner>
                  <p className="tw:mt-2 tw:text-subtle">{m.checkin_looking_up()}</p>
                </div>
              )}

              {(mutationError || queryError) && (
                <Alert variant="danger" role="alert">
                  <Icon icon={TriangleAlertIcon} className="tw:me-2" />
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
                  onAdjustOrderItem={handleAdjustOrderItem}
                  onSetOrderItemQuantity={handleSetOrderItemQuantity}
                  onIssueStrap={handleIssueStrap}
                  onReturnToScanner={handleReturnToScanner}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
