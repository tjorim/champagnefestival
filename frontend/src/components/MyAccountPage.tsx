import MyExhibitorsSection, { type ManagedExhibitor } from "@/components/MyExhibitorsSection";
import { signOutVisitorSession, type GuestRegistration } from "@/utils/publicRegistrationApi";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PublicCheck, PublicField, PublicInput, PublicLabel } from "@/components/PublicFields";
import { m } from "@/paraglide/messages";
import { useAuth } from "@/contexts/AuthContext";
import { deleteMyAccount } from "@/utils/meApi";
import ConfirmModal from "@/components/ConfirmModal";
import MyRegistrationsPage from "@/components/MyRegistrationsPage";
import {
  formatEidNumber,
  formatNiss,
  isValidEidNumber,
  isValidNiss,
} from "@/utils/belgianIdentityNumbers";
import {
  getMyPollOptions,
  getMyVolunteerIdentity,
  registerMyVolunteerIdentity,
  replaceMyPollSelections,
  updateMyEidDocumentNumber,
  type MyPollSelections,
} from "@/utils/myVolunteerApi";

/**
 * Unified self-service for visitors, exhibitor contacts and OIDC accounts.
 * One emailed login supplies a verified identity; exhibitor access follows
 * current contact records. Staff and volunteer roles still use OIDC.
 */
export default function MyAccountPage() {
  const {
    isAuthenticated,
    isSigningOut,
    accountLabel,
    accountId,
    hasRole,
    getAccessToken,
    authError,
    clearAuthError,
    logout,
  } = useAuth();
  const instanceId = useId();
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const sessionEpochRef = useRef(0);
  const [emailRegistrations, setEmailRegistrations] = useState<GuestRegistration[] | null>(null);
  const [selectedTab, setSelectedTab] = useState("registrations");
  const onEmailSessionChange = useCallback(
    (registrations: GuestRegistration[] | null) => {
      // Discard a late result from the component replaced after sign-out.
      if (sessionEpochRef.current === sessionEpoch) setEmailRegistrations(registrations);
    },
    [sessionEpoch],
  );
  const exhibitorsQuery = useQuery({
    queryKey: ["me-exhibitors", instanceId, sessionEpoch, accountId ?? null, isAuthenticated],
    enabled: isAuthenticated || emailRegistrations !== null,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }): Promise<ManagedExhibitor[]> => {
      const accessToken = getAccessToken();
      const response = await fetch("/api/me/exhibitors", {
        signal,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!response.ok) throw new Error(m.manager_error());
      return response.json();
    },
  });
  const exhibitors =
    !isAuthenticated && emailRegistrations === null ? [] : (exhibitorsQuery.data ?? []);
  const emailSignOut = useMutation({
    mutationFn: signOutVisitorSession,
    retry: false,
    onSuccess: () => {
      sessionEpochRef.current += 1;
      setSessionEpoch(sessionEpochRef.current);
      setEmailRegistrations(null);
      setSelectedTab("registrations");
    },
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isVolunteer = isAuthenticated && hasRole("volunteer");

  const [registerValidationError, setRegisterValidationError] = useState("");
  const [correctionValidationError, setCorrectionValidationError] = useState("");

  const handleDelete = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error(m.my_account_delete_error());
    await deleteMyAccount(accessToken);
    logout();
  };

  const identityMutation = useMutation({
    mutationFn: () => getMyVolunteerIdentity(getAccessToken() ?? ""),
    retry: false,
  });

  const registerForm = useForm({
    defaultValues: { name: "", nationalRegisterNumber: "", eidDocumentNumber: "" },
    onSubmit: async ({ value }) => {
      if (!isValidNiss(value.nationalRegisterNumber)) {
        setRegisterValidationError(m.my_eid_invalid_niss());
        return;
      }
      if (!isValidEidNumber(value.eidDocumentNumber)) {
        setRegisterValidationError(m.my_eid_invalid_eid());
        return;
      }
      setRegisterValidationError("");
      registerMutation.mutate(value);
    },
  });

  const registerMutation = useMutation({
    mutationFn: (vars: {
      name: string;
      nationalRegisterNumber: string;
      eidDocumentNumber: string;
    }) => registerMyVolunteerIdentity(getAccessToken() ?? "", vars),
    retry: false,
  });

  // getAccessToken is only a new reference when the underlying OIDC user
  // object changes (login, silent renewal, or a different account), so this
  // re-runs exactly on those transitions rather than once on mount — a
  // loaded-once ref would otherwise keep showing a previous account's
  // NISS/eID after the OIDC user changes underneath this still-mounted page
  // (#1037 review).
  useEffect(() => {
    if (!isVolunteer) return;
    identityMutation.reset();
    registerMutation.reset();
    identityMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVolunteer, getAccessToken]);

  const correctionForm = useForm({
    defaultValues: { newEidDocumentNumber: "" },
    onSubmit: async ({ value }) => {
      if (!isValidEidNumber(value.newEidDocumentNumber)) {
        setCorrectionValidationError(m.my_eid_invalid_eid());
        return;
      }
      setCorrectionValidationError("");
      correctionMutation.mutate(value.newEidDocumentNumber);
    },
  });

  const correctionMutation = useMutation({
    mutationFn: (eidDocumentNumber: string) =>
      updateMyEidDocumentNumber(getAccessToken() ?? "", eidDocumentNumber),
    retry: false,
    onSuccess: () => {
      correctionForm.reset();
    },
  });

  const identity =
    correctionMutation.data ?? registerMutation.data ?? identityMutation.data ?? null;

  const pollOptionsMutation = useMutation({
    mutationFn: () => getMyPollOptions(getAccessToken() ?? ""),
    retry: false,
  });

  const pollSelectionsMutation = useMutation({
    mutationFn: (selections: MyPollSelections) =>
      replaceMyPollSelections(getAccessToken() ?? "", selections),
    retry: false,
  });

  const poll = pollSelectionsMutation.data ?? pollOptionsMutation.data ?? null;

  useEffect(() => {
    // Same rationale as the identity effect above (#1037 review): without
    // resetting, a previous account's saved poll picks would keep showing
    // as this account's own until it explicitly resaves.
    pollOptionsMutation.reset();
    pollSelectionsMutation.reset();
    if (!isVolunteer || !identity?.linked) return;
    pollOptionsMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVolunteer, identity?.linked, getAccessToken]);

  const savePollSelections = (next: MyPollSelections) => pollSelectionsMutation.mutate(next);

  const volunteerSection = (
    <>
      {identityMutation.isPending ? (
        <div className="flex items-center justify-center gap-2 text-subtle mb-4">
          <Spinner label={m.loading()} size="sm" />
        </div>
      ) : identityMutation.isError && !identity ? (
        <Alert variant="danger">{m.my_eid_load_error()}</Alert>
      ) : identity?.linked ? (
        <>
          <Alert variant="secondary">
            <h3 className="text-base font-medium leading-tight">{m.my_eid_identity_heading()}</h3>
            <dl className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter mb-0 text-sm">
              <dt className="w-5/12">{m.my_eid_niss_label()}</dt>
              <dd className="w-7/12">
                {identity.nationalRegisterNumber
                  ? formatNiss(identity.nationalRegisterNumber)
                  : "—"}
              </dd>
              <dt className="w-5/12 mb-0">{m.my_eid_eid_label()}</dt>
              <dd className="w-7/12 mb-0">
                {identity.eidDocumentNumber ? formatEidNumber(identity.eidDocumentNumber) : "—"}
              </dd>
            </dl>
          </Alert>

          {pollOptionsMutation.isError && !poll && (
            <Alert variant="danger">{m.my_poll_load_error()}</Alert>
          )}

          {!pollOptionsMutation.isPending && poll && poll.options.length > 0 && (
            <Alert variant="secondary">
              <h3 className="text-base font-medium leading-tight">{m.my_poll_heading()}</h3>
              <p className="text-sm mb-4">{m.my_poll_description()}</p>
              {(["dish", "soup"] as const).map((kind) => {
                const kindOptions = poll.options.filter((o) => o.kind === kind);
                if (kindOptions.length === 0) return null;
                const selectedId =
                  kind === "dish" ? poll.selections.dishOptionId : poll.selections.soupOptionId;
                return (
                  <PublicField key={kind} className="mb-4" controlId={`my-poll-${kind}`}>
                    <FieldTitle id={`my-poll-${kind}-label`} className="font-semibold">
                      {kind === "dish" ? m.my_poll_dish_label() : m.my_poll_soup_label()}
                    </FieldTitle>
                    <RadioGroup
                      aria-labelledby={`my-poll-${kind}-label`}
                      name={`my-poll-${kind}`}
                      value={selectedId}
                      disabled={pollSelectionsMutation.isPending}
                      onValueChange={(optionId) =>
                        savePollSelections({
                          dishOptionId: kind === "dish" ? optionId : poll.selections.dishOptionId,
                          soupOptionId: kind === "soup" ? optionId : poll.selections.soupOptionId,
                          dinnerOptionIds: poll.selections.dinnerOptionIds,
                        })
                      }
                    >
                      {kindOptions.map((option) => (
                        <div key={option.id} className="flex items-center gap-2">
                          <RadioGroupItem id={`my-poll-${kind}-${option.id}`} value={option.id} />
                          <FieldLabel
                            htmlFor={`my-poll-${kind}-${option.id}`}
                            className="font-normal"
                          >
                            {option.label}
                          </FieldLabel>
                        </div>
                      ))}
                    </RadioGroup>
                  </PublicField>
                );
              })}
              {poll.options.some((o) => o.kind === "dinner") && (
                <PublicField
                  className="mb-2"
                  controlId="my-poll-dinner"
                  aria-labelledby="my-poll-dinner-label"
                >
                  <FieldTitle id="my-poll-dinner-label" className="font-semibold">
                    {m.my_poll_dinner_label()}
                  </FieldTitle>
                  {poll.options
                    .filter((o) => o.kind === "dinner")
                    .map((option) => {
                      const checked = poll.selections.dinnerOptionIds.includes(option.id);
                      return (
                        <PublicCheck
                          key={option.id}
                          id={`my-poll-dinner-${option.id}`}
                          label={option.label}
                          checked={checked}
                          disabled={pollSelectionsMutation.isPending}
                          onCheckedChange={() =>
                            savePollSelections({
                              dishOptionId: poll.selections.dishOptionId,
                              soupOptionId: poll.selections.soupOptionId,
                              dinnerOptionIds: checked
                                ? poll.selections.dinnerOptionIds.filter((id) => id !== option.id)
                                : [...poll.selections.dinnerOptionIds, option.id],
                            })
                          }
                        />
                      );
                    })}
                </PublicField>
              )}
              {pollSelectionsMutation.isError && (
                <Alert variant="danger" className="py-2 text-sm mb-0">
                  {pollSelectionsMutation.error instanceof Error
                    ? pollSelectionsMutation.error.message
                    : m.my_poll_save_error()}
                </Alert>
              )}
            </Alert>
          )}

          <Alert variant="secondary">
            <h3 className="text-base font-medium leading-tight">{m.my_eid_correction_heading()}</h3>
            <p className="text-sm mb-4">{m.my_eid_correction_description()}</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void correctionForm.handleSubmit();
              }}
            >
              <PublicField className="mb-4" controlId="my-eid-new-number">
                <PublicLabel>{m.my_eid_new_number_label()}</PublicLabel>
                <correctionForm.Field name="newEidDocumentNumber">
                  {(field) => (
                    <PublicInput
                      value={field.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={(event) => {
                        field.handleBlur();
                        if (isValidEidNumber(event.target.value)) {
                          field.handleChange(formatEidNumber(event.target.value));
                        }
                      }}
                      maxLength={50}
                      required
                    />
                  )}
                </correctionForm.Field>
              </PublicField>
              {(correctionValidationError || correctionMutation.isError) && (
                <Alert variant="danger" className="py-2 text-sm">
                  {correctionValidationError ||
                    (correctionMutation.error instanceof Error
                      ? correctionMutation.error.message
                      : m.my_eid_correction_error())}
                </Alert>
              )}
              {correctionMutation.isSuccess && (
                <Alert variant="success" className="py-2 text-sm mb-4">
                  {m.my_eid_correction_success()}
                </Alert>
              )}
              <Button
                type="submit"
                variant="outline-primary"
                size="sm"
                disabled={correctionMutation.isPending}
              >
                {correctionMutation.isPending
                  ? m.my_eid_submitting()
                  : m.my_eid_submit_correction()}
              </Button>
            </form>
          </Alert>
        </>
      ) : (
        <Alert variant="secondary">
          <h3 className="text-base font-medium leading-tight">{m.my_eid_register_heading()}</h3>
          <p className="text-sm mb-4">{m.my_eid_register_description()}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void registerForm.handleSubmit();
            }}
          >
            <PublicField className="mb-4" controlId="my-eid-name">
              <PublicLabel>{m.my_eid_name_label()}</PublicLabel>
              <registerForm.Field name="name">
                {(field) => (
                  <PublicInput
                    value={field.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    maxLength={200}
                    required
                  />
                )}
              </registerForm.Field>
            </PublicField>
            <PublicField className="mb-4" controlId="my-eid-niss">
              <PublicLabel>{m.my_eid_niss_label()}</PublicLabel>
              <registerForm.Field name="nationalRegisterNumber">
                {(field) => (
                  <PublicInput
                    value={field.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={(event) => {
                      field.handleBlur();
                      if (isValidNiss(event.target.value))
                        field.handleChange(formatNiss(event.target.value));
                    }}
                    maxLength={20}
                    required
                  />
                )}
              </registerForm.Field>
            </PublicField>
            <PublicField className="mb-4" controlId="my-eid-eid">
              <PublicLabel>{m.my_eid_eid_label()}</PublicLabel>
              <registerForm.Field name="eidDocumentNumber">
                {(field) => (
                  <PublicInput
                    value={field.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={(event) => {
                      field.handleBlur();
                      if (isValidEidNumber(event.target.value)) {
                        field.handleChange(formatEidNumber(event.target.value));
                      }
                    }}
                    maxLength={50}
                    required
                  />
                )}
              </registerForm.Field>
            </PublicField>
            {(registerValidationError || registerMutation.isError) && (
              <Alert variant="danger" className="py-2 text-sm">
                {registerValidationError ||
                  (registerMutation.error instanceof Error
                    ? registerMutation.error.message
                    : m.my_eid_register_error())}
              </Alert>
            )}
            <Button
              type="submit"
              variant="outline-primary"
              size="sm"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? m.my_eid_submitting() : m.my_eid_register_button()}
            </Button>
          </form>
        </Alert>
      )}
    </>
  );

  const accountSection = (
    <Alert variant="secondary">
      <h3 className="text-base font-medium leading-tight">{m.my_account_delete_heading()}</h3>
      <p className="text-sm mb-4">{m.my_account_delete_description()}</p>
      <Button variant="outline-danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
        {m.my_account_delete_button()}
      </Button>
    </Alert>
  );

  const tabs: { key: string; title: string; content: React.ReactNode }[] = [
    {
      key: "registrations",
      title: m.my_registrations_title(),
      content: (
        <MyRegistrationsPage key={sessionEpoch} onEmailSessionChange={onEmailSessionChange} />
      ),
    },
  ];
  if (exhibitors.length > 0)
    tabs.push({
      key: "exhibitors",
      title: m.manager_title(),
      content: <MyExhibitorsSection exhibitors={exhibitors} />,
    });
  if (isVolunteer)
    tabs.push({ key: "volunteer", title: m.my_eid_title(), content: volunteerSection });
  if (isAuthenticated)
    tabs.push({ key: "account", title: m.my_account_title(), content: accountSection });

  const visibleTabs = tabs.filter(
    (tab) =>
      tab.key !== "registrations" ||
      isAuthenticated ||
      emailRegistrations === null ||
      emailRegistrations.length > 0 ||
      exhibitors.length === 0,
  );
  const activeTab = visibleTabs.some((tab) => tab.key === selectedTab)
    ? selectedTab
    : visibleTabs[0]?.key;

  return (
    <div className="site-container mx-auto w-full max-w-account py-12">
      <h1 id="my-account-title" className="text-2xl font-medium leading-tight mb-6 text-center">
        {m.my_account_title()}
      </h1>

      {authError && (
        <Alert variant="danger" onClose={clearAuthError}>
          {authError}
        </Alert>
      )}

      {isSigningOut ? (
        <div className="flex items-center justify-center gap-2 text-subtle">
          <Spinner size="sm" />
          {m.auth_signing_out()}
        </div>
      ) : (
        <>
          {accountLabel && (
            <p className="text-center text-subtle mb-6">
              {m.my_account_signed_in_as({ account: accountLabel })}
            </p>
          )}

          {emailRegistrations !== null && (
            <div className="mb-4">
              <Button
                variant="outline"
                size="sm"
                disabled={emailSignOut.isPending}
                onClick={() => emailSignOut.mutate()}
              >
                {m.my_registrations_sign_out()}
              </Button>
              {emailSignOut.isError && (
                <Alert variant="danger" role="alert">
                  {m.my_registrations_error()}
                </Alert>
              )}
            </div>
          )}
          {exhibitorsQuery.isError && (isAuthenticated || emailRegistrations !== null) && (
            <Alert variant="danger" role="alert">
              {m.manager_error()}
            </Alert>
          )}
          <Tabs value={activeTab} onValueChange={(value) => setSelectedTab(String(value))}>
            {visibleTabs.length > 1 && (
              <TabsList className="mb-3">
                {visibleTabs.map((tab) => (
                  <TabsTrigger key={tab.key} value={tab.key}>
                    {tab.title}
                  </TabsTrigger>
                ))}
              </TabsList>
            )}
            {tabs.map((tab) => (
              <TabsContent key={tab.key} value={tab.key} keepMounted>
                <div className="pt-3">{tab.content}</div>
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}

      <ConfirmModal
        show={showDeleteConfirm}
        title={m.my_account_delete_heading()}
        body={m.my_account_delete_confirm()}
        errorFallback={m.my_account_delete_error()}
        onConfirm={handleDelete}
        onHide={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
