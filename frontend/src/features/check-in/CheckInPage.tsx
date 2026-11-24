import { apiErrorMessage } from "@/lib/api/apiErrors";
import type { StampProgress } from "@/lib/editions/stampCards";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  InfoIcon,
  ScanQrCodeIcon,
  SearchIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { m } from "@/paraglide/messages";
import { useAuth } from "@/app/providers/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { queryKeys } from "@/lib/query/queryKeys";
import { SESSION_EXPIRED_ERROR, UNAUTHORIZED_ERROR } from "@/lib/api/adminApi";
import CheckInScanner, { type ScannedCheckInCredentials } from "./CheckInScanner";
import {
  CheckInError,
  fetchCheckInRegistration,
  submitCheckIn,
  type CheckInData,
} from "@/lib/api/publicRegistrationApi";
import {
  searchVolunteerRegistrations,
  submitVolunteerCheckIn,
  updateVolunteerRegistration,
} from "./volunteerApi";
import { CheckInCard } from "./CheckInCard";

const AUTO_RETURN_TO_SCANNER_MS = 4000;

function formatEntranceActionError(error: Error, fallback: string): string {
  const message = error.message;
  if (message === SESSION_EXPIRED_ERROR) {
    return m.checkin_actions_session_expired();
  }
  if (message === UNAUTHORIZED_ERROR) {
    return m.checkin_actions_unauthorized();
  }
  return apiErrorMessage(error, fallback);
}

export default function CheckInPage() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const isOnline = useOnlineStatus();
  const lookupButtonRef = useRef<HTMLButtonElement>(null);
  const scanButtonRef = useRef<HTMLButtonElement>(null);
  const [lookupMode, setLookupMode] = useState<"scan" | "manual">("scan");
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
  const check_in_token = scannedCredentials?.token ?? fragmentCheckInToken;
  const [success, setSuccess] = useState(false);
  const [stamp_progress, setStampProgress] = useState<StampProgress | null>(null);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [searchOpen, setSearchOpen] = useState(true);
  const [scannerUnavailable, setScannerUnavailable] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [manualRegistration, setManualRegistration] = useState<CheckInData | null>(null);
  const hasQrCredentials = Boolean(registrationId && check_in_token);
  const checkInQueryKey = queryKeys.checkInRegistration(registrationId ?? "", check_in_token ?? "");
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

  // A fresh QR scan brings a new registrationId/check_in_token pair — reset the
  // local UI state for it. Adjust during render (comparing against the
  // previous scan) rather than in an effect, since this only needs to react
  // to that identity actually changing.
  const scanKey = `${registrationId ?? ""}:${check_in_token ?? ""}`;
  const [prevScanKey, setPrevScanKey] = useState(scanKey);
  if (scanKey !== prevScanKey) {
    setPrevScanKey(scanKey);
    if (hasQrCredentials) {
      setManualRegistration(null);
      setSuccess(false);
      setStampProgress(null);
      setAlreadyCheckedIn(false);
      setSearchTerm("");
      setDebouncedSearchTerm("");
    }
  }

  const registrationQuery = useQuery({
    queryKey: checkInQueryKey,
    queryFn: () => fetchCheckInRegistration(registrationId!, check_in_token!),
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
    mutationFn: () => submitCheckIn(registrationId!, check_in_token!),
    retry: false,
    networkMode: "always",
    onMutate: () => {
      setSuccess(false);
      setStampProgress(null);
      setAlreadyCheckedIn(false);
    },
    onSuccess: ({
      registration: updatedRegistration,
      already_checked_in: mutationAlreadyCheckedIn,
      stamp_progress: stampProgress,
    }) => {
      queryClient.setQueryData(checkInQueryKey, updatedRegistration);
      setSuccess(true);
      setStampProgress(stampProgress);
      setAlreadyCheckedIn(mutationAlreadyCheckedIn || updatedRegistration.checked_in);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: checkInQueryKey });
    },
  });

  const volunteerCheckInMutation = useMutation({
    mutationFn: (regId: string) => submitVolunteerCheckIn(regId, authHeaders),
    retry: false,
    networkMode: "always",
    onMutate: () => {
      setSuccess(false);
      setStampProgress(null);
      setAlreadyCheckedIn(false);
    },
    onSuccess: ({
      registration: updatedRegistration,
      already_checked_in: mutationAlreadyCheckedIn,
      stamp_progress: stampProgress,
    }) => {
      setManualRegistration(updatedRegistration);
      setSuccess(true);
      setStampProgress(stampProgress);
      setAlreadyCheckedIn(mutationAlreadyCheckedIn || updatedRegistration.checked_in);
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
      order_items,
      strap_issued,
    }: {
      targetRegistration: CheckInData;
      order_items?: CheckInData["order_items"];
      strap_issued?: boolean;
    }) =>
      updateVolunteerRegistration(
        targetRegistration.id,
        { order_items, strap_issued },
        authHeaders,
      ),
    retry: false,
    networkMode: "always",
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
      ? formatEntranceActionError(volunteerCheckInMutation.error, m.checkin_error())
      : updateRegistrationMutation.isError
        ? formatEntranceActionError(
            updateRegistrationMutation.error,
            m.admin_error_update_registration(),
          )
        : "";
  const isAlreadyCheckedIn = success ? alreadyCheckedIn : (registration?.checked_in ?? false);
  const searchResults = debouncedSearchTerm.length >= 2 ? (volunteerSearchQuery.data ?? []) : [];
  const showSearchHint =
    !hasQrCredentials && searchTerm.trim().length > 0 && searchTerm.trim().length < 2;
  const shouldShowAuthLoadingGate = !hasQrCredentials && auth.isLoading;

  const handleCheckIn = useCallback(() => {
    if (!isOnline) return;
    if (hasQrCredentials) {
      checkInMutation.mutate();
      return;
    }
    if (!manualRegistration) return;
    volunteerCheckInMutation.mutate(manualRegistration.id);
  }, [checkInMutation, hasQrCredentials, isOnline, manualRegistration, volunteerCheckInMutation]);

  const handleSetOrderItemQuantity = useCallback(
    (product_id: string, quantity: number) => {
      if (!isOnline || !registration || !Number.isFinite(quantity)) return;
      const updatedOrders = registration.order_items.map((item) => {
        if (item.product_id !== product_id) return item;
        const delivered_quantity = Math.max(0, Math.min(item.quantity, Math.trunc(quantity)));
        return {
          ...item,
          delivered_quantity,

          delivered: delivered_quantity === item.quantity,
        };
      });
      updateRegistrationMutation.mutate({
        targetRegistration: registration,
        order_items: updatedOrders,
      });
    },
    [isOnline, registration, updateRegistrationMutation],
  );

  const handleAdjustOrderItem = useCallback(
    (product_id: string, delta: number) => {
      if (!registration) return;
      const item = registration.order_items.find((order) => order.product_id === product_id);
      if (!item) return;
      handleSetOrderItemQuantity(product_id, item.delivered_quantity + delta);
    },
    [handleSetOrderItemQuantity, registration],
  );

  const handleIssueStrap = useCallback(() => {
    if (!isOnline || !registration) return;
    updateRegistrationMutation.mutate({ targetRegistration: registration, strap_issued: true });
  }, [isOnline, registration, updateRegistrationMutation]);

  const handleSelectManualRegistration = useCallback((selected: CheckInData) => {
    setManualRegistration(selected);
    setSuccess(false);
    setStampProgress(null);
    setAlreadyCheckedIn(selected.checked_in);
    setSearchOpen(false);
  }, []);

  const handleScanDecode = useCallback((result: ScannedCheckInCredentials) => {
    setScannedCredentials(result);
  }, []);

  const handleReturnToScanner = useCallback(() => {
    setLookupMode("scan");
    setSearchOpen(true);
    setScannedCredentials(null);
    setFragmentCheckInToken(undefined);
    setManualRegistration(null);
    setSuccess(false);
    setStampProgress(null);
    setAlreadyCheckedIn(false);
    requestAnimationFrame(() => scanButtonRef.current?.focus());
    if (urlRegistrationId) {
      void navigate({ search: {}, replace: true });
    }
  }, [navigate, urlRegistrationId]);

  const guestWorkspaceRef = useRef<HTMLDivElement>(null);
  const selectedGuestId = registration?.id;
  useEffect(() => {
    if (selectedGuestId) guestWorkspaceRef.current?.focus();
  }, [selectedGuestId]);

  // Once nothing is left for the volunteer to do on this guest, clear the
  // card automatically so the next scan can start right away. A pending
  // strap issuance keeps the card up until it's handled (or "Scan next" is
  // pressed explicitly) so entrance actions are never skipped silently.
  const canAutoReturnToScanner =
    success &&
    !stamp_progress?.reward_earned &&
    (!canManageEntranceActions ||
      registration?.status === "cancelled" ||
      (registration?.strap_issued ?? false));
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

        {stamp_progress && (
          <Alert variant={stamp_progress.reward_earned ? "success" : "info"} role="status">
            {m.stamp_progress({ count: stamp_progress.stamps, total: stamp_progress.box_count })}
            {stamp_progress.reward_earned && (
              <strong className="ms-2">{m.stamp_reward_earned()}</strong>
            )}
          </Alert>
        )}
        {!isOnline && (
          <Alert variant="danger" className="w-full text-center" role="status">
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
              {!hasQrCredentials && !registration && (
                <>
                  <ToggleGroup
                    value={[lookupMode]}
                    onValueChange={(values) => {
                      const mode = values[0];
                      if (mode !== "scan" && mode !== "manual") return;
                      setLookupMode(mode);
                      setSearchOpen(mode === "manual");
                      if (mode === "manual")
                        requestAnimationFrame(() => {
                          const input = document.getElementById("manual-checkin-query");
                          input?.focus();
                          input?.scrollIntoView({ block: "nearest" });
                        });
                    }}
                    variant="outline"
                    className="mb-4 w-full"
                    aria-label={m.checkin_lookup_method()}
                  >
                    <ToggleGroupItem
                      ref={scanButtonRef}
                      value="scan"
                      className="h-auto w-full min-w-0 whitespace-normal aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground aria-pressed:hover:text-background site-sm:w-auto site-sm:flex-1"
                    >
                      <ScanQrCodeIcon className="size-4 shrink-0" aria-hidden="true" />
                      {m.checkin_scan_method()}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      ref={lookupButtonRef}
                      value="manual"
                      className="h-auto w-full min-w-0 whitespace-normal aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground aria-pressed:hover:text-background site-sm:w-auto site-sm:flex-1"
                    >
                      <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
                      {m.checkin_manual_search_title()}
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {lookupMode === "scan" && (
                    <CheckInScanner
                      onDecode={handleScanDecode}
                      onUnavailableChange={setScannerUnavailable}
                    />
                  )}

                  {lookupMode === "scan" && !scannerUnavailable && (
                    <Alert variant="warning" className="w-full text-center">
                      <Icon icon={InfoIcon} className="me-2" />
                      {m.checkin_scan_prompt()}
                    </Alert>
                  )}

                  <Collapsible open={searchOpen} onOpenChange={setSearchOpen}>
                    <Card tone="secondary" className="mb-4">
                      <CardHeader className="p-0">
                        <CollapsibleTrigger
                          render={<Button variant="ghost" />}
                          className="flex h-auto w-full items-center justify-between p-4 text-left whitespace-normal text-warning"
                          aria-expanded={searchOpen}
                          aria-controls="manual-checkin-search"
                        >
                          <span>
                            <SearchIcon className="mr-2 inline size-4" aria-hidden="true" />
                            {m.checkin_manual_search_heading()}
                          </span>
                          {searchOpen ? (
                            <ChevronUpIcon aria-hidden="true" className="size-4" />
                          ) : (
                            <ChevronDownIcon aria-hidden="true" className="size-4" />
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
                              onFocus={() => setLookupMode("manual")}
                              value={searchTerm}
                              onChange={(event) => {
                                setSearchTerm(event.currentTarget.value);
                                setManualRegistration(null);
                                setSuccess(false);
                                setStampProgress(null);
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
                                  : apiErrorMessage(
                                      volunteerSearchQuery.error,
                                      m.checkin_search_error(),
                                    )}
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
                                      {result.event_title || result.event_id} · {m.checkin_guests()}
                                      : {result.guest_count}
                                    </span>
                                  </span>
                                  <Badge variant={result.checked_in ? "success" : "secondary"}>
                                    {result.checked_in
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
                <div ref={guestWorkspaceRef} tabIndex={-1} aria-label={registration.name}>
                  <CheckInCard
                    registration={registration}
                    success={success}
                    isAlreadyCheckedIn={isAlreadyCheckedIn}
                    isCheckingIn={isCheckingIn}
                    isOnline={isOnline}
                    isUpdatingRegistration={isUpdatingRegistration}
                    canManageEntranceActions={canManageEntranceActions}
                    onCheckIn={handleCheckIn}
                    onAdjustOrderItem={handleAdjustOrderItem}
                    onSetOrderItemQuantity={handleSetOrderItemQuantity}
                    onIssueStrap={handleIssueStrap}
                    onReturnToScanner={handleReturnToScanner}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
