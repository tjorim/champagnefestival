import { OrderAnswerInputs } from "@/components/OrderAnswers";
import type { OrderAnswer } from "@/utils/orderQuestions";
import {
  AdminCheck,
  AdminError,
  AdminField,
  AdminLabel,
  AdminSelect,
  AdminOption,
  AdminInput,
  AdminTextarea,
} from "@/components/admin/AdminFields";
import { HighlightedText } from "@/components/admin/HighlightedText";
import RegistrationNewPersonPanel from "@/components/admin/RegistrationNewPersonPanel";
import {
  CircleCheckIcon,
  LoaderCircleIcon,
  SaveIcon,
  TriangleAlertIcon,
  UserPlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useSelector } from "@tanstack/react-form";
import { Alert } from "@/components/ui/alert";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { activeEditionQueryKey } from "@/hooks/useActiveEdition";
import type { Registration } from "@/types/registration";
import { isDraftDirty, useDirtyDismiss } from "@/hooks/useDirtyDismiss";
import { m } from "@/paraglide/messages";
import { apiErrorMessage } from "@/utils/apiErrors";
import { queryKeys } from "@/utils/queryKeys";
import {
  draftTotal,
  isValidGuestCount,
  isValidQuantity,
  productDraftState,
  resolveQuantities,
  type ProductQuantities,
} from "@/utils/registrationDraft";
import {
  createAdminRegistration,
  fetchAdminPersonOptions,
  fetchRegistrableEvents,
  type CreateRegistrationPayload,
  type PersonOption,
} from "@/utils/adminRegistrationApi";

const adminActiveEditionEventsQueryKey = queryKeys.admin.activeEditionEvents;
const adminPersonOptionsQueryKey = queryKeys.admin.personOptions;

interface RegistrationCreateModalProps {
  show: boolean;
  authHeaders: () => Record<string, string>;
  /** Called as soon as the booking exists, so the caller can add it to its cached list. */
  onSaved: (registration: Registration) => void;
  /** Continues into the full booking (payment, seating) for a booking this dialog just created. */
  onOpenBooking: (registration: Registration) => void;
  onHide: () => void;
}

interface RegistrationCreateForm {
  eventId: string;
  guestCount: number;
  notes: string;
  personOption: PersonOption | null;
}

const BLANK_FORM: RegistrationCreateForm = {
  eventId: "",
  guestCount: 1,
  notes: "",
  personOption: null,
};

const formatMoney = (amount: number) => `€${amount.toFixed(2)}`;

const paymentStatusLabel = (status: Registration["paymentStatus"]) =>
  status === "paid"
    ? m.admin_payment_paid()
    : status === "partial"
      ? m.admin_payment_partial()
      : m.admin_payment_unpaid();

export default function RegistrationCreateModal({
  show,
  authHeaders,
  onSaved,
  onOpenBooking,
  onHide,
}: RegistrationCreateModalProps) {
  const queryClient = useQueryClient();
  const [orderAnswers, setOrderAnswers] = useState<OrderAnswer[]>([]);
  const [quantityOverrides, setQuantityOverrides] = useState<ProductQuantities>({});
  const [exemptConfirmed, setExemptConfirmed] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  const [addedPerson, setAddedPerson] = useState<string | null>(null);
  const [created, setCreated] = useState<Registration | null>(null);
  const [personQuery, setPersonQuery] = useState("");
  const [debouncedPersonQuery, setDebouncedPersonQuery] = useState("");
  // One key per distinct booking request: a retry of the same request after a lost
  // response replays the first booking on the server, an edited request gets a new key.
  const [attempt, setAttempt] = useState<{ signature: string; key: string } | null>(null);

  const form = useForm({
    defaultValues: BLANK_FORM,
    onSubmit: async ({ value }) => {
      const event = events.find((candidate) => candidate.id === value.eventId);
      if (!value.personOption || !event) return;
      const orderItems = products
        .filter((product) => (quantities[product.id] ?? 0) > 0)
        .map((product) => ({ productId: product.id, quantity: quantities[product.id] ?? 0 }));
      const request = {
        personId: value.personOption.value,
        eventId: value.eventId,
        guestCount: value.guestCount,
        notes: value.notes.trim(),
        orderItems,
        orderAnswers: orderAnswers.filter((a) =>
          event.orderQuestions?.some((q) => q.id === a.question_id && q.active),
        ),
      };
      const signature = JSON.stringify(request);
      const idempotencyKey = attempt?.signature === signature ? attempt.key : crypto.randomUUID();
      setAttempt({ signature, key: idempotencyKey });
      try {
        await createRegistrationMutation.mutateAsync({
          ...request,
          idempotencyKey,
        });
      } catch {
        // Error is surfaced via createRegistrationMutation.isError
      }
    },
  });

  const createRegistrationMutation = useMutation({
    mutationFn: (payload: CreateRegistrationPayload) =>
      createAdminRegistration(payload, authHeaders),
    retry: false,
    onSuccess: async (registration) => {
      setAttempt(null);
      setCreated(registration);
      onSaved(registration);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminActiveEditionEventsQueryKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.personOptionsRoot }),
        queryClient.invalidateQueries({ queryKey: activeEditionQueryKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.activeEdition }),
      ]);
    },
  });
  const resetCreateRegistrationMutation = createRegistrationMutation.reset;

  const resetDraft = () => {
    form.reset(BLANK_FORM);
    setPersonQuery("");
    setOrderAnswers([]);
    setQuantityOverrides({});
    setExemptConfirmed(false);
    setSubmitAttempted(false);
    setAddingPerson(false);
    setAddedPerson(null);
    setCreated(null);
    setDebouncedPersonQuery("");
    setAttempt(null);
    resetCreateRegistrationMutation();
  };

  // Re-open should always start blank, discarding edits abandoned by closing the
  // modal. Reset during render rather than in an effect (the "adjusting state
  // when a prop changes" pattern) since this only needs to react to the
  // show=false->true transition, not to every render.
  const [wasShown, setWasShown] = useState(show);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) resetDraft();
  }

  useEffect(() => {
    if (!show) {
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedPersonQuery(personQuery.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [personQuery, show]);

  const eventsQuery = useQuery({
    queryKey: adminActiveEditionEventsQueryKey,
    queryFn: () => fetchRegistrableEvents(authHeaders),
    enabled: show,
    staleTime: 60 * 1000,
    retry: false,
  });

  const personOptionsQuery = useQuery({
    queryKey: adminPersonOptionsQueryKey(debouncedPersonQuery),
    queryFn: ({ signal }) => fetchAdminPersonOptions(debouncedPersonQuery, authHeaders, signal),
    enabled: show && debouncedPersonQuery.length > 0,
    staleTime: 30 * 1000,
    retry: false,
  });

  const error = createRegistrationMutation.isError
    ? apiErrorMessage(createRegistrationMutation.error, m.admin_error_create_registration())
    : null;

  const events = eventsQuery.data ?? [];
  const sortedEvents = [...events].sort((a, b) => a.title.localeCompare(b.title));
  const personOptions = personOptionsQuery.data ?? [];
  const loadingEvents = eventsQuery.isPending;
  const loadingPersons = personOptionsQuery.isFetching;

  const watchedEventId = useSelector(form.atom, (state) => state.values.eventId);
  const watchedPersonOption = useSelector(form.atom, (state) => state.values.personOption);
  const watchedGuestCount = useSelector(form.atom, (state) => state.values.guestCount);
  const isSubmitting = useSelector(form.atom, (state) => state.isSubmitting);
  const values = useSelector(form.atom, (state) => state.values);
  const selectedEvent = events.find((event) => event.id === watchedEventId);
  const products = (selectedEvent?.products ?? []).filter((product) => product.purchasable);
  const quantities = resolveQuantities(products, quantityOverrides, watchedGuestCount);
  const productState = productDraftState(products, quantities);
  const total = draftTotal(products, quantities);
  const suggestsQuantities = productState.required.length === 1 && products.length > 0;

  const issues = {
    event: selectedEvent ? undefined : m.admin_registration_event_required(),
    person: watchedPersonOption ? undefined : m.admin_registration_person_required(),
    guests: isValidGuestCount(watchedGuestCount)
      ? undefined
      : m.admin_registration_guests_invalid(),
    products: productState.missingRequired
      ? m.admin_registration_required_product_missing({
          products: productState.required.map((product) => product.name).join(", "),
        })
      : Object.values(quantities).some((quantity) => !isValidQuantity(quantity))
        ? m.admin_registration_guests_invalid()
        : undefined,
    exempt:
      productState.exempt && !exemptConfirmed ? m.admin_registration_exempt_required() : undefined,
  };
  const hasIssues = Object.values(issues).some(Boolean);
  const showIssues = submitAttempted;

  const { requestClose, confirmDialog } = useDirtyDismiss({
    dirty:
      created === null &&
      (isDraftDirty(values, BLANK_FORM) ||
        Object.keys(quantityOverrides).length > 0 ||
        orderAnswers.length > 0 ||
        addingPerson),
    busy: isSubmitting || createRegistrationMutation.isPending,
    onDismiss: onHide,
  });

  const setQuantity = (productId: string, quantity: number) => {
    setQuantityOverrides((current) => ({ ...current, [productId]: quantity }));
    setExemptConfirmed(false);
  };

  const selectPerson = (person: PersonOption | null) => {
    form.setFieldValue("personOption", person);
    setAddingPerson(false);
  };

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) void requestClose();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>
            {created ? m.admin_registration_created_title() : m.admin_create_registration()}
          </DialogTitle>
        </DialogHeader>
        {created ? (
          <>
            <DialogBody>
              <Alert variant="success" role="status" className="py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Icon icon={CircleCheckIcon} />
                  {m.admin_registration_created_summary({
                    person: created.person?.name ?? values.personOption?.label ?? "",
                    event: created.event?.title ?? selectedEvent?.title ?? "",
                    guests: created.guestCount,
                  })}
                </div>
                <div>
                  {m.admin_registration_created_total({
                    total: formatMoney(created.amountDue ?? 0),
                    status: paymentStatusLabel(created.paymentStatus),
                  })}
                </div>
              </Alert>
              <p className="text-sm">{m.admin_registration_created_next()}</p>
              <p className="text-subtle text-sm">
                {created.person?.email
                  ? m.admin_registration_email_queued({ email: created.person.email })
                  : m.admin_registration_email_none()}
              </p>
              <p className="text-subtle text-sm">{m.admin_registration_created_hidden()}</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={resetDraft}>
                {m.admin_registration_add_another()}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void requestClose()}>
                {m.close()}
              </Button>
              <Button variant="warning" size="sm" onClick={() => onOpenBooking(created)}>
                {m.admin_registration_open_booking()}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitAttempted(true);
              if (hasIssues) return;
              void form.handleSubmit();
            }}
          >
            <DialogBody>
              {error && (
                <Alert
                  variant="danger"
                  className="py-2 text-sm"
                  onClose={() => createRegistrationMutation.reset()}
                >
                  {error}
                </Alert>
              )}
              {showIssues && hasIssues && (
                <Alert variant="warning" className="py-2 text-sm">
                  {m.admin_registration_fix_before_create()}
                </Alert>
              )}

              <AdminField className="mb-4" controlId="registration-event">
                <AdminLabel className="text-subtle text-sm">{m.admin_event_label()} *</AdminLabel>
                {loadingEvents ? (
                  <div className="text-subtle text-sm">
                    <Spinner size="sm" className="me-2" />
                    {m.admin_loading_events()}
                  </div>
                ) : eventsQuery.isError ? (
                  <div className="text-destructive text-sm flex items-center gap-2">
                    <Icon icon={TriangleAlertIcon} />
                    {m.admin_error_load_events()}
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-highlight"
                      onClick={() => void eventsQuery.refetch()}
                    >
                      {m.admin_retry()}
                    </Button>
                  </div>
                ) : events.length > 0 ? (
                  <form.Field name="eventId">
                    {(field) => (
                      <>
                        <AdminSelect
                          className="bg-muted text-content border-input"
                          value={field.value}
                          aria-invalid={showIssues && Boolean(issues.event)}
                          onValueChange={(e) => {
                            field.handleChange(e);
                            setQuantityOverrides({});
                            setExemptConfirmed(false);
                          }}
                          onBlur={field.handleBlur}
                        >
                          <AdminOption value="">{m.admin_select_event_placeholder()}</AdminOption>
                          {sortedEvents.map((ev) => (
                            <AdminOption key={ev.id} value={ev.id}>
                              {[
                                ev.title,
                                ev.edition?.editionType && ev.edition.editionType !== "festival"
                                  ? m.admin_filter_edition_standalone()
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </AdminOption>
                          ))}
                        </AdminSelect>
                        {showIssues && issues.event && <AdminError>{issues.event}</AdminError>}
                      </>
                    )}
                  </form.Field>
                ) : (
                  <AdminSelect
                    value=""
                    className="bg-muted text-content border-input"
                    disabled
                    aria-label={m.admin_event_label()}
                  >
                    <AdminOption value="">{m.admin_content_edition_no_events()}</AdminOption>
                  </AdminSelect>
                )}
              </AdminField>

              {addingPerson ? (
                <RegistrationNewPersonPanel
                  authHeaders={authHeaders}
                  initialName={personQuery.trim()}
                  onCancel={() => setAddingPerson(false)}
                  onCreated={(person) => {
                    selectPerson(person);
                    setAddedPerson(person.label);
                  }}
                  onUseExisting={(person) => {
                    selectPerson(person);
                    setAddedPerson(null);
                  }}
                />
              ) : (
                <AdminField className="mb-4" controlId="registration-person">
                  <AdminLabel className="text-subtle text-sm">
                    {m.admin_person_label()} *
                  </AdminLabel>
                  <form.Field name="personOption">
                    {(field) => (
                      <Combobox
                        items={personOptions}
                        value={field.value}
                        onValueChange={(option) => {
                          field.handleChange(option);
                          setAddedPerson(null);
                        }}
                        onInputValueChange={setPersonQuery}
                        filter={null}
                        itemToStringLabel={(option: PersonOption) => option.label}
                        isItemEqualToValue={(a: PersonOption, b: PersonOption) =>
                          a.value === b.value
                        }
                      >
                        <ComboboxInput
                          id="registration-person"
                          aria-label={m.admin_person_label()}
                          aria-invalid={showIssues && Boolean(issues.person)}
                          showClear
                          onBlur={field.handleBlur}
                          placeholder={m.admin_search_person_placeholder()}
                          aria-busy={loadingPersons}
                        >
                          {loadingPersons && (
                            <LoaderCircleIcon
                              className="size-4 animate-spin text-muted-foreground"
                              aria-hidden="true"
                            />
                          )}
                        </ComboboxInput>
                        <ComboboxContent>
                          {!loadingPersons && (
                            <ComboboxEmpty className="flex-col items-center gap-2">
                              {m.admin_people_no_results()}
                              {personQuery.trim() && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setAddingPerson(true)}
                                >
                                  <Icon icon={UserPlusIcon} />
                                  {m.admin_registration_person_add({ name: personQuery.trim() })}
                                </Button>
                              )}
                            </ComboboxEmpty>
                          )}
                          <ComboboxList>
                            {(opt: PersonOption) => (
                              <ComboboxItem key={opt.value} value={opt}>
                                <div>
                                  <div>
                                    <HighlightedText
                                      text={opt.label}
                                      query={debouncedPersonQuery}
                                    />
                                  </div>
                                  <small className="text-muted-foreground">
                                    {[
                                      opt.email,
                                      opt.phone,
                                      m.admin_registration_person_bookings({
                                        count: opt.registrationCount,
                                      }),
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </small>
                                </div>
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    )}
                  </form.Field>
                  {showIssues && issues.person && <AdminError>{issues.person}</AdminError>}
                  {addedPerson && watchedPersonOption && (
                    <p role="status" className="text-subtle text-sm mb-0">
                      {m.admin_registration_new_person_added({ name: addedPerson })}
                    </p>
                  )}
                  {!watchedPersonOption && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="self-start p-0 text-highlight"
                      onClick={() => setAddingPerson(true)}
                    >
                      <Icon icon={UserPlusIcon} />
                      {m.admin_registration_person_add_generic()}
                    </Button>
                  )}
                </AdminField>
              )}

              <form.Field name="guestCount">
                {(field) => (
                  <AdminField className="mb-4" controlId="registration-guest-count">
                    <AdminLabel className="text-subtle text-sm">
                      {m.admin_guests_count()} *
                    </AdminLabel>
                    <AdminInput
                      type="number"
                      min={1}
                      max={20}
                      className="bg-muted text-content border-input"
                      value={field.value}
                      aria-invalid={showIssues && Boolean(issues.guests)}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      onBlur={field.handleBlur}
                    />
                    {showIssues && issues.guests && <AdminError>{issues.guests}</AdminError>}
                  </AdminField>
                )}
              </form.Field>

              {selectedEvent && (
                <fieldset className="mb-4" aria-describedby="registration-products-hint">
                  <legend className="text-subtle text-sm">
                    {m.admin_registration_products_heading()}
                  </legend>
                  {products.length === 0 ? (
                    <p id="registration-products-hint" className="text-subtle text-sm">
                      {m.admin_registration_products_none()}
                    </p>
                  ) : (
                    <>
                      <p id="registration-products-hint" className="text-subtle text-sm">
                        {productState.required.length > 0 &&
                          m.admin_registration_products_required_hint({
                            products: productState.required.map((p) => p.name).join(", "),
                          })}{" "}
                        {suggestsQuantities && m.admin_registration_products_suggested()}
                      </p>
                      <div className="flex flex-wrap -mx-2 *:w-full *:px-2 gap-y-3">
                        {products.map((product) => (
                          <AdminField className="site-sm:w-6/12" key={product.id}>
                            <AdminLabel>
                              {product.name} · {formatMoney(product.price)}
                              {product.required && ` · ${m.admin_products_required_badge()}`}
                            </AdminLabel>
                            <AdminInput
                              aria-label={`${m.admin_booking_quantity()} ${product.name}`}
                              type="number"
                              min={0}
                              max={1000}
                              className="bg-muted text-content border-input"
                              value={quantities[product.id] ?? 0}
                              aria-invalid={showIssues && Boolean(issues.products)}
                              onChange={(e) => setQuantity(product.id, Number(e.target.value))}
                            />
                          </AdminField>
                        ))}
                      </div>
                      <p className="text-sm mt-2 mb-0" aria-live="polite">
                        <strong>{m.admin_registration_total()}:</strong> {formatMoney(total)}
                      </p>
                      {issues.products && <AdminError>{issues.products}</AdminError>}
                      {productState.exempt && (
                        <Alert variant="warning" role="status" className="py-2 text-sm mt-2">
                          <p className="mb-2">{m.admin_registration_exempt_warning()}</p>
                          <AdminCheck
                            label={m.admin_registration_exempt_confirm()}
                            checked={exemptConfirmed}
                            onCheckedChange={(checked) => setExemptConfirmed(checked === true)}
                          />
                          {showIssues && issues.exempt && <AdminError>{issues.exempt}</AdminError>}
                        </Alert>
                      )}
                    </>
                  )}
                </fieldset>
              )}

              <OrderAnswerInputs
                admin
                questions={(selectedEvent?.orderQuestions ?? []).filter((q) => q.active)}
                answers={orderAnswers}
                onChange={setOrderAnswers}
                disabled={createRegistrationMutation.isPending}
              />
              <form.Field name="notes">
                {(field) => (
                  <AdminField controlId="registration-notes">
                    <AdminLabel className="text-subtle text-sm">{m.admin_notes()}</AdminLabel>
                    <AdminTextarea
                      rows={2}
                      className="bg-muted text-content border-input"
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </AdminField>
                )}
              </form.Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => void requestClose()}>
                {m.admin_action_cancel()}
              </Button>
              <Button
                type="submit"
                variant="warning"
                size="sm"
                disabled={isSubmitting || createRegistrationMutation.isPending}
              >
                {isSubmitting ? <Spinner size="sm" /> : <Icon icon={SaveIcon} />}
                {m.admin_create_action()}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
      {confirmDialog}
    </Dialog>
  );
}
