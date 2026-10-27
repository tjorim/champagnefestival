import { OrderAnswerInputs } from "@/components/OrderAnswers";
import type { OrderAnswer } from "@/utils/orderQuestions";
import {
  AdminField,
  AdminLabel,
  AdminSelect,
  AdminOption,
  AdminInput,
  AdminTextarea,
} from "@/components/admin/AdminFields";
import { LoaderCircleIcon, SaveIcon, TriangleAlertIcon } from "lucide-react";
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
  onSaved: (registration: Registration) => void;
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

export default function RegistrationCreateModal({
  show,
  authHeaders,
  onSaved,
  onHide,
}: RegistrationCreateModalProps) {
  const queryClient = useQueryClient();
  const [orderAnswers, setOrderAnswers] = useState<OrderAnswer[]>([]);
  const [personQuery, setPersonQuery] = useState("");
  const [debouncedPersonQuery, setDebouncedPersonQuery] = useState("");

  const form = useForm({
    defaultValues: BLANK_FORM,
    onSubmit: async ({ value }) => {
      const isValidEvent = events.some((event) => event.id === value.eventId);
      if (!value.personOption || !isValidEvent) return;
      try {
        await createRegistrationMutation.mutateAsync({
          personId: value.personOption.value,
          eventId: value.eventId,
          guestCount: value.guestCount,
          notes: value.notes.trim(),
          orderAnswers: orderAnswers.filter((a) =>
            events
              .find((e) => e.id === value.eventId)
              ?.orderQuestions?.some((q) => q.id === a.question_id && q.active),
          ),
        });
      } catch {
        // Error is surfaced via createRegistrationMutation.isError
      }
    },
  });

  const selectedEventId = useSelector(form.atom, (s) => s.values.eventId);
  const createRegistrationMutation = useMutation({
    mutationFn: (payload: CreateRegistrationPayload) =>
      createAdminRegistration(payload, authHeaders),
    retry: false,
    onSuccess: async (registration) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminActiveEditionEventsQueryKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.personOptionsRoot }),
        queryClient.invalidateQueries({ queryKey: activeEditionQueryKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.activeEdition }),
      ]);
      onSaved(registration);
      onHide();
    },
  });
  const resetCreateRegistrationMutation = createRegistrationMutation.reset;

  // Re-open should always start blank, discarding edits abandoned by closing the
  // modal. Reset during render rather than in an effect (the "adjusting state
  // when a prop changes" pattern) since this only needs to react to the
  // show=false->true transition, not to every render.
  const [wasShown, setWasShown] = useState(show);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      form.reset(BLANK_FORM);
      setPersonQuery("");
      setOrderAnswers([]);
      setDebouncedPersonQuery("");
      resetCreateRegistrationMutation();
    }
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
  const isSubmitting = useSelector(form.atom, (state) => state.isSubmitting);
  const values = useSelector(form.atom, (state) => state.values);
  const { requestClose, confirmDialog } = useDirtyDismiss({
    dirty: isDraftDirty(values, BLANK_FORM),
    busy: isSubmitting || createRegistrationMutation.isPending,
    onDismiss: onHide,
  });
  const hasValidEventSelection = events.some((event) => event.id === watchedEventId);

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) void requestClose();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>{m.admin_create_registration()}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
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

            <AdminField className="mb-4" controlId="registration-event">
              <AdminLabel className="text-subtle text-sm">{m.admin_event_label()}</AdminLabel>
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
                    <AdminSelect
                      className="bg-muted text-content border-input"
                      value={field.value}
                      onValueChange={(e) => field.handleChange(e)}
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

            <AdminField className="mb-4" controlId="registration-person">
              <AdminLabel className="text-subtle text-sm">{m.admin_person_label()} *</AdminLabel>
              <form.Field name="personOption">
                {(field) => (
                  <Combobox
                    items={personOptions}
                    value={field.value}
                    onValueChange={(option) => field.handleChange(option)}
                    onInputValueChange={setPersonQuery}
                    filter={null}
                    itemToStringLabel={(option: PersonOption) => option.label}
                    isItemEqualToValue={(a: PersonOption, b: PersonOption) => a.value === b.value}
                  >
                    <ComboboxInput
                      id="registration-person"
                      aria-label={m.admin_person_label()}
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
                        <ComboboxEmpty>{m.admin_people_no_results()}</ComboboxEmpty>
                      )}
                      <ComboboxList>
                        {(opt: PersonOption) => (
                          <ComboboxItem key={opt.value} value={opt}>
                            <div>
                              <div>{opt.label}</div>
                              {opt.sub && (
                                <small className="text-muted-foreground">{opt.sub}</small>
                              )}
                            </div>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                )}
              </form.Field>
            </AdminField>

            <form.Field name="guestCount">
              {(field) => (
                <AdminField className="mb-4" controlId="registration-guest-count">
                  <AdminLabel className="text-subtle text-sm">{m.admin_guests_count()}</AdminLabel>
                  <AdminInput
                    type="number"
                    min={1}
                    max={20}
                    className="bg-muted text-content border-input"
                    value={field.value}
                    onChange={(e) => field.handleChange(Number(e.target.value))}
                    onBlur={field.handleBlur}
                  />
                </AdminField>
              )}
            </form.Field>

            <OrderAnswerInputs
              admin
              questions={(
                events.find((e) => e.id === selectedEventId)?.orderQuestions ?? []
              ).filter((q) => q.active)}
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
              disabled={isSubmitting || !watchedPersonOption || !hasValidEventSelection}
            >
              {isSubmitting ? <Spinner size="sm" /> : <Icon icon={SaveIcon} />}
              {m.admin_create_action()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  );
}
