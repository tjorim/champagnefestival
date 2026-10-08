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
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect } from "react";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import {
  PublicDescription,
  PublicField,
  PublicInput,
  PublicLabel,
} from "@/components/PublicFields";
import { Alert, AlertHeading } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { PresentationList, PresentationListItem } from "@/components/ui/presentation-list";
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
    <Card tone={success ? "success" : isAlreadyCheckedIn ? "warning" : "secondary"}>
      <CardHeader
        className={cn(
          "flex items-center justify-between gap-4 flex-wrap",
          success ? "border-success" : isAlreadyCheckedIn ? "border-warning" : "border-border",
        )}
      >
        <span className="font-semibold text-xl">
          <Icon icon={UserIcon} className="me-2" />
          {registration.name}
        </span>
        <div className="flex gap-2 flex-wrap">
          {isCancelled && <Badge variant="danger">{m.admin_status_cancelled()}</Badge>}
          {registration.checkedIn && (
            <Badge variant="success">
              <Icon icon={CircleCheckIcon} className="me-1" />
              {m.admin_checked_in()}
            </Badge>
          )}
          {registration.strapIssued && (
            <Badge variant="info">
              <Icon icon={ContactRoundIcon} className="me-1" />
              {m.admin_strap_issued()}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div role="status" aria-live="polite">
          {success && (
            <Alert variant="success" className="mb-4">
              <div className="flex justify-between items-center gap-4 flex-wrap">
                <span>
                  <Icon icon={CircleCheckIcon} className="me-2" />
                  <strong>{m.checkin_success()}</strong>
                  {registration.strapIssued && (
                    <div className="mt-1">{m.checkin_strap_issued()}</div>
                  )}
                </span>
                <Button variant="outline-success" size="sm" onClick={onReturnToScanner}>
                  <Icon icon={ScanQrCodeIcon} />
                  {m.checkin_scan_next()}
                </Button>
              </div>
            </Alert>
          )}
        </div>
        {canManageEntranceActions && registration.editionId && registration.tableId && (
          <ButtonLink
            render={
              <Link
                to="/venue-plan"
                search={{ edition: registration.editionId, table: registration.tableId }}
              />
            }
            variant="outline-warning"
            className="w-full mb-4"
          >
            <Icon icon={MapIcon} />
            {m.venue_plan_show_table()}
          </ButtonLink>
        )}

        <div role="alert" aria-live="assertive">
          {isCancelled && (
            <Alert variant="danger" className="mb-4">
              <Icon icon={OctagonXIcon} className="me-2" />
              {m.admin_status_cancelled()}
            </Alert>
          )}
          {isAlreadyCheckedIn && !success && registration.checkedInAt && (
            <Alert variant="warning" className="mb-4">
              <Icon icon={CircleAlertIcon} className="me-2" />
              {m.checkin_already_in()} {new Date(registration.checkedInAt).toLocaleTimeString()}
            </Alert>
          )}
        </div>

        <PresentationList flush className="bg-card">
          <PresentationListItem className="flex justify-between gap-4">
            <span className="text-subtle">{m.checkin_event()}</span>
            <span className="text-right">{registration.eventTitle || registration.eventId}</span>
          </PresentationListItem>
          <PresentationListItem className="flex justify-between gap-4">
            <span className="text-subtle">{m.checkin_guests()}</span>
            <span>{registration.guestCount}</span>
          </PresentationListItem>
          {registration.tableName && (
            <PresentationListItem className="flex justify-between gap-4">
              <span className="text-subtle">{m.checkin_table()}</span>
              <span className="font-semibold text-highlight">{registration.tableName}</span>
            </PresentationListItem>
          )}
        </PresentationList>

        {registration.orderItems.length > 0 && (
          <div className="mt-4">
            <p className="font-semibold text-highlight mb-2">
              <Icon icon={ShoppingCartIcon} className="me-2" />
              {m.checkin_order_items()}
            </p>
            <PresentationList flush>
              {registration.orderItems.map((item, idx) => (
                <PresentationListItem
                  key={`${item.productId}-${idx}`}
                  className="flex justify-between items-center gap-4 flex-wrap"
                >
                  <span>
                    {item.name} <Badge variant="secondary">×{item.quantity}</Badge>
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={item.delivered ? "success" : "secondary"}>
                      {m.admin_bottle_delivered()}: {item.deliveredQuantity}/{item.quantity}
                    </Badge>
                    <Badge variant={item.remainingQuantity > 0 ? "warning" : "success"}>
                      {m.admin_bottle_not_delivered()}: {item.remainingQuantity}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onAdjustOrderItem(item.productId, -1)}
                        disabled={
                          !canUpdateEntrance ||
                          isUpdatingRegistration ||
                          item.deliveredQuantity <= 0
                        }
                        title={m.admin_mark_not_delivered()}
                      >
                        <Icon icon={MinusIcon} />
                        <span className="sr-only">{m.admin_mark_not_delivered()}</span>
                      </Button>
                      <PublicInput
                        key={item.deliveredQuantity}
                        aria-label={`${m.admin_bottle_delivered()} ${item.name}`}
                        className="w-20 text-center"
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
                        <span className="sr-only">{m.admin_mark_delivered()}</span>
                      </Button>
                    </div>
                  </div>
                </PresentationListItem>
              ))}
            </PresentationList>
            {!canManageEntranceActions && registration.checkedIn && registration.strapIssued && (
              <div className="text-sm text-subtle mt-2">
                <Icon icon={InfoIcon} className="me-1" />
                {m.checkin_actions_login_required()}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {!isCancelled && (!registration.checkedIn || !registration.strapIssued) && (
        <CardFooter className="grid gap-2">
          {!registration.checkedIn && (
            <Button
              variant="warning"
              className="w-full"
              onClick={onCheckIn}
              disabled={isCheckingIn}
            >
              {isCheckingIn ? (
                <Spinner size="sm" role="status" aria-hidden="true" />
              ) : (
                <Icon icon={UserCheckIcon} />
              )}
              {m.checkin_do_checkin()}
            </Button>
          )}
          {registration.checkedIn && !registration.strapIssued && (
            <Button
              variant="info"
              className="w-full"
              onClick={onIssueStrap}
              disabled={!canManageEntranceActions || isUpdatingRegistration}
            >
              {isUpdatingRegistration ? (
                <Spinner size="sm" role="status" aria-hidden="true" />
              ) : (
                <Icon icon={ContactRoundIcon} />
              )}
              {m.admin_issue_strap()}
            </Button>
          )}
          {!canManageEntranceActions && (
            <div className="text-sm text-subtle">{m.checkin_actions_login_required()}</div>
          )}
        </CardFooter>
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
    <section id="check-in" className="py-12" aria-labelledby="checkin-title">
      <div className="site-container mx-auto w-full">
        <h2 id="checkin-title" className="text-center mb-6 text-highlight">
          <Icon icon={ScanQrCodeIcon} className="me-2" />
          {m.checkin_title()}
        </h2>

        {!isOnline && (
          <Alert variant="danger" className="w-20 text-center" role="status">
            <Icon icon={WifiOffIcon} className="me-2" />
            {m.checkin_offline_banner()}
          </Alert>
        )}

        {auth.authError ? (
          <Alert variant="danger" onClose={auth.clearAuthError}>
            <AlertHeading as="h3" className="text-base font-medium leading-tight">
              {m.auth_error_title()}
            </AlertHeading>
            <p className="mb-0">{auth.authError}</p>
          </Alert>
        ) : null}

        {shouldShowAuthLoadingGate ? (
          <div className="text-center py-6">
            <Spinner variant="warning" role="status">
              <span className="sr-only">{m.admin_loading()}</span>
            </Spinner>
            <p className="mt-2 text-subtle">{m.admin_loading()}</p>
          </div>
        ) : (
          <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter justify-center">
            <div className="w-full site-sm:w-10/12 site-md:w-8/12 site-lg:w-6/12">
              {!hasQrCredentials && (
                <>
                  <CheckInScanner onDecode={handleScanDecode} />

                  <Alert variant="warning" className="w-20 text-center">
                    <Icon icon={InfoIcon} className="me-2" />
                    {m.checkin_scan_prompt()}
                  </Alert>

                  <Collapsible open={searchOpen} onOpenChange={setSearchOpen}>
                    <Card tone="secondary" className="mb-4">
                      <CardHeader className="p-0">
                        <CollapsibleTrigger
                          render={<Button variant="ghost" />}
                          className="flex w-full items-center justify-between p-4 text-left text-warning"
                          aria-expanded={searchOpen}
                          aria-controls="manual-checkin-search"
                        >
                          <span>
                            <Search className="mr-2 inline size-4" aria-hidden="true" />
                            {m.checkin_manual_search_title()}
                          </span>
                          {searchOpen ? (
                            <ChevronUp aria-hidden="true" className="size-4" />
                          ) : (
                            <ChevronDown aria-hidden="true" className="size-4" />
                          )}
                        </CollapsibleTrigger>
                      </CardHeader>
                      <CollapsibleContent id="manual-checkin-search" keepMounted>
                        <CardContent>
                          {!auth.isAuthenticated && (
                            <Alert
                              variant="info"
                              className="flex justify-between items-center gap-4 flex-wrap"
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
                                    <Spinner size="sm" className="me-2" aria-hidden="true" />
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

                          <PublicField controlId="manual-checkin-query">
                            <PublicLabel>{m.checkin_manual_search_label()}</PublicLabel>
                            <PublicInput
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
                            <PublicDescription>{m.checkin_manual_search_help()}</PublicDescription>
                          </PublicField>

                          {showSearchHint && (
                            <div className="text-subtle mt-4">
                              {m.checkin_manual_search_min_chars()}
                            </div>
                          )}

                          {volunteerSearchQuery.isFetching && (
                            <div className="text-subtle mt-4" role="status" aria-live="polite">
                              <Spinner
                                size="sm"
                                role="status"
                                aria-hidden="true"
                                className="me-2"
                              />
                              {m.checkin_manual_search_loading()}
                            </div>
                          )}

                          {volunteerSearchQuery.isError && (
                            <Alert variant="danger" className="mt-4 mb-0" role="alert">
                              <Icon icon={TriangleAlertIcon} className="me-2" />
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
                              <div className="text-subtle mt-4">
                                {m.checkin_manual_search_no_results()}
                              </div>
                            )}

                          {searchResults.length > 0 && (
                            <PresentationList className="mt-4">
                              {searchResults.map((result) => (
                                <PresentationListItem
                                  key={result.id}
                                  action

                                  className="flex justify-between items-center gap-4"
                                  onClick={() => handleSelectManualRegistration(result)}
                                >
                                  <span>
                                    <span className="font-semibold block">{result.name}</span>
                                    <span className="text-subtle text-sm">
                                      {result.eventTitle || result.eventId} · {m.checkin_guests()}:{" "}
                                      {result.guestCount}
                                    </span>
                                  </span>
                                  <Badge variant={result.checkedIn ? "success" : "secondary"}>
                                    {result.checkedIn
                                      ? m.admin_checked_in()
                                      : m.checkin_manual_not_checked_in()}
                                  </Badge>
                                </PresentationListItem>
                              ))}
                            </PresentationList>
                          )}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                </>
              )}

              {isLoading && (
                <div className="text-center py-6">
                  <Spinner variant="warning" role="status">
                    <span className="sr-only">{m.checkin_looking_up()}</span>
                  </Spinner>
                  <p className="mt-2 text-subtle">{m.checkin_looking_up()}</p>
                </div>
              )}

              {(mutationError || queryError) && (
                <Alert variant="danger" role="alert">
                  <Icon icon={TriangleAlertIcon} className="me-2" />
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
