import { LoaderCircleIcon, SaveIcon, TriangleAlertIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useSelector } from "@tanstack/react-form";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import Spinner from "react-bootstrap/Spinner";
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
import { m } from "@/paraglide/messages";
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

export default function RegistrationCreateModal({
  show,
  authHeaders,
  onSaved,
  onHide,
}: RegistrationCreateModalProps) {
  const queryClient = useQueryClient();
  const [personQuery, setPersonQuery] = useState("");
  const [debouncedPersonQuery, setDebouncedPersonQuery] = useState("");

  const form = useForm({
    defaultValues: {
      eventId: "",
      guestCount: 1,
      notes: "",
      personOption: null,
    } as RegistrationCreateForm,
    onSubmit: async ({ value }) => {
      const isValidEvent = events.some((event) => event.id === value.eventId);
      if (!value.personOption || !isValidEvent) return;
      try {
        await createRegistrationMutation.mutateAsync({
          personId: value.personOption.value,
          eventId: value.eventId,
          guestCount: value.guestCount,
          notes: value.notes.trim(),
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
      form.reset({ eventId: "", guestCount: 1, notes: "", personOption: null });
      setPersonQuery("");
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
    ? createRegistrationMutation.error instanceof Error
      ? createRegistrationMutation.error.message
      : m.admin_error_create_registration()
    : null;

  const events = eventsQuery.data ?? [];
  const sortedEvents = [...events].sort((a, b) => a.title.localeCompare(b.title));
  const personOptions = personOptionsQuery.data ?? [];
  const loadingEvents = eventsQuery.isPending;
  const loadingPersons = personOptionsQuery.isFetching;

  const watchedEventId = useSelector(form.atom, (state) => state.values.eventId);
  const watchedPersonOption = useSelector(form.atom, (state) => state.values.personOption);
  const isSubmitting = useSelector(form.atom, (state) => state.isSubmitting);
  const hasValidEventSelection = events.some((event) => event.id === watchedEventId);

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent admin size="lg">
        <DialogHeader>
          <DialogTitle>{m.admin_create_registration()}</DialogTitle>
        </DialogHeader>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <DialogBody>
            {error && (
              <Alert
                variant="danger"
                className="py-2 small"
                dismissible
                onClose={() => createRegistrationMutation.reset()}
              >
                {error}
              </Alert>
            )}

            <Form.Group className="mb-3" controlId="registration-event">
              <Form.Label className="text-secondary small">{m.admin_event_label()}</Form.Label>
              {loadingEvents ? (
                <div className="text-secondary small">
                  <Spinner animation="border" size="sm" className="me-2" />
                  {m.admin_loading_events()}
                </div>
              ) : eventsQuery.isError ? (
                <div className="text-danger small d-flex align-items-center gap-2">
                  <Icon icon={TriangleAlertIcon} />
                  {m.admin_error_load_events()}
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 text-warning"
                    onClick={() => void eventsQuery.refetch()}
                  >
                    {m.admin_retry()}
                  </Button>
                </div>
              ) : events.length > 0 ? (
                <form.Field name="eventId">
                  {(field) => (
                    <Form.Select
                      className="bg-dark text-light border-secondary"
                      value={field.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    >
                      <option value="">{m.admin_select_event_placeholder()}</option>
                      {sortedEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {[
                            ev.title,
                            ev.edition?.editionType && ev.edition.editionType !== "festival"
                              ? m.admin_filter_edition_standalone()
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </option>
                      ))}
                    </Form.Select>
                  )}
                </form.Field>
              ) : (
                <Form.Select
                  value=""
                  className="bg-dark text-light border-secondary"
                  disabled
                  aria-label={m.admin_event_label()}
                >
                  <option value="">{m.admin_content_edition_no_events()}</option>
                </Form.Select>
              )}
            </Form.Group>

            <Form.Group className="mb-3" controlId="registration-person">
              <Form.Label className="text-secondary small">{m.admin_person_label()} *</Form.Label>
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
                          className="tw:size-4 tw:animate-spin tw:text-muted-foreground"
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
                                <small className="tw:text-muted-foreground">{opt.sub}</small>
                              )}
                            </div>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                )}
              </form.Field>
            </Form.Group>

            <form.Field name="guestCount">
              {(field) => (
                <Form.Group className="mb-3" controlId="registration-guest-count">
                  <Form.Label className="text-secondary small">{m.admin_guests_count()}</Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    max={20}
                    className="bg-dark text-light border-secondary"
                    value={field.value}
                    onChange={(e) => field.handleChange(Number(e.target.value))}
                    onBlur={field.handleBlur}
                  />
                </Form.Group>
              )}
            </form.Field>

            <form.Field name="notes">
              {(field) => (
                <Form.Group controlId="registration-notes">
                  <Form.Label className="text-secondary small">{m.admin_notes()}</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    className="bg-dark text-light border-secondary"
                    value={field.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </Form.Group>
              )}
            </form.Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline-secondary" size="sm" onClick={onHide}>
              {m.admin_action_cancel()}
            </Button>
            <Button
              type="submit"
              variant="warning"
              size="sm"
              disabled={isSubmitting || !watchedPersonOption || !hasValidEventSelection}
            >
              {isSubmitting ? (
                <Spinner as="span" animation="border" size="sm" className="me-1" />
              ) : (
                <Icon icon={SaveIcon} className="tw:me-1" />
              )}
              {m.admin_create_action()}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
