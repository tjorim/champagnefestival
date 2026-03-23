import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { useForm, Controller } from "react-hook-form";
import Select, { type SingleValue, type StylesConfig } from "react-select";
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

const darkSelectStyles: StylesConfig<PersonOption, false> = {
  control: (base) => ({
    ...base,
    backgroundColor: "#212529",
    borderColor: "#6c757d",
    color: "#f8f9fa",
    minHeight: "34px",
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "#212529",
    border: "1px solid #6c757d",
    zIndex: 9999,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#343a40" : "#212529",
    color: "#f8f9fa",
    cursor: "pointer",
  }),
  singleValue: (base) => ({ ...base, color: "#f8f9fa" }),
  input: (base) => ({ ...base, color: "#f8f9fa" }),
  placeholder: (base) => ({ ...base, color: "#6c757d" }),
  indicatorSeparator: (base) => ({ ...base, backgroundColor: "#6c757d" }),
  dropdownIndicator: (base) => ({ ...base, color: "#6c757d" }),
  clearIndicator: (base) => ({ ...base, color: "#6c757d" }),
  noOptionsMessage: (base) => ({ ...base, color: "#adb5bd" }),
};

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
  personOption: SingleValue<PersonOption>;
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

  const { register, handleSubmit, reset, control, watch } = useForm<RegistrationCreateForm>({
    defaultValues: {
      eventId: "",
      guestCount: 1,
      notes: "",
      personOption: null,
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
      ]);
      onSaved(registration);
      onHide();
    },
  });
  const resetCreateRegistrationMutation = createRegistrationMutation.reset;

  useEffect(() => {
    if (!show) {
      return;
    }

    reset({ eventId: "", guestCount: 1, notes: "", personOption: null });
    setPersonQuery("");
    setDebouncedPersonQuery("");
    resetCreateRegistrationMutation();
  }, [reset, resetCreateRegistrationMutation, show]);

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

  const watchedEventId = watch("eventId");
  const watchedPersonOption = watch("personOption");
  const hasValidEventSelection = events.some((event) => event.id === watchedEventId);

  function onSubmit(data: RegistrationCreateForm) {
    if (!data.personOption || !hasValidEventSelection) return;
    createRegistrationMutation.mutate({
      personId: data.personOption.value,
      eventId: data.eventId,
      guestCount: data.guestCount,
      notes: data.notes.trim(),
    });
  }

  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">{m.admin_create_registration()}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body className="bg-dark">
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

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">{m.admin_event_label()}</Form.Label>
            {loadingEvents ? (
              <div className="text-secondary small">
                <Spinner animation="border" size="sm" className="me-2" />
                {m.admin_loading_events()}
              </div>
            ) : eventsQuery.isError ? (
              <div className="text-danger small d-flex align-items-center gap-2">
                <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
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
              <Form.Select
                className="bg-dark text-light border-secondary"
                {...register("eventId")}
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

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">{m.admin_person_label()} *</Form.Label>
            <Controller
              name="personOption"
              control={control}
              render={({ field }) => (
                <Select<PersonOption, false>
                  isClearable
                  options={personOptions}
                  value={field.value}
                  onChange={field.onChange}
                  onInputChange={(value) => setPersonQuery(value)}
                  inputValue={personQuery}
                  isLoading={loadingPersons}
                  filterOption={null}
                  styles={darkSelectStyles}
                  placeholder={m.admin_search_person_placeholder()}
                  classNamePrefix="rs"
                  formatOptionLabel={(opt) => (
                    <div>
                      <div>{opt.label}</div>
                      {opt.sub && <small className="text-secondary">{opt.sub}</small>}
                    </div>
                  )}
                />
              )}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">{m.admin_guests_count()}</Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={20}
              className="bg-dark text-light border-secondary"
              {...register("guestCount", { valueAsNumber: true })}
            />
          </Form.Group>

          <Form.Group>
            <Form.Label className="text-secondary small">{m.admin_notes()}</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              className="bg-dark text-light border-secondary"
              {...register("notes")}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" size="sm" onClick={onHide}>
            {m.admin_action_cancel()}
          </Button>
          <Button
            type="submit"
            variant="warning"
            size="sm"
            disabled={
              createRegistrationMutation.isPending ||
              !watchedPersonOption ||
              !hasValidEventSelection
            }
          >
            {createRegistrationMutation.isPending ? (
              <Spinner as="span" animation="border" size="sm" className="me-1" />
            ) : (
              <i className="bi bi-floppy me-1" aria-hidden="true" />
            )}
            {m.admin_create_action()}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
