import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
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

export default function RegistrationCreateModal({
  show,
  authHeaders,
  onSaved,
  onHide,
}: RegistrationCreateModalProps) {
  const queryClient = useQueryClient();
  const [guestCount, setGuestCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [eventId, setEventId] = useState("");
  const [personOption, setPersonOption] = useState<SingleValue<PersonOption>>(null);
  const [personQuery, setPersonQuery] = useState("");
  const [debouncedPersonQuery, setDebouncedPersonQuery] = useState("");

  const createRegistrationMutation = useMutation({
    mutationFn: (payload: CreateRegistrationPayload) => createAdminRegistration(payload, authHeaders),
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

    setGuestCount(1);
    setNotes("");
    setEventId("");
    setPersonOption(null);
    setPersonQuery("");
    setDebouncedPersonQuery("");
    resetCreateRegistrationMutation();
  }, [resetCreateRegistrationMutation, show]);

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

  const error =
    createRegistrationMutation.isError
      ? createRegistrationMutation.error instanceof Error
        ? createRegistrationMutation.error.message
        : m.admin_error_create_registration()
      : null;

  const events = eventsQuery.data ?? [];
  const sortedEvents = [...events].sort((a, b) => a.title.localeCompare(b.title));
  const personOptions = personOptionsQuery.data ?? [];
  const loadingEvents = eventsQuery.isPending;
  const loadingPersons = personOptionsQuery.isFetching;
  const hasValidEventSelection = events.some((event) => event.id === eventId);

  function handlePersonChange(opt: SingleValue<PersonOption>) {
    setPersonOption(opt);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personOption || !hasValidEventSelection) return;
    createRegistrationMutation.mutate({
      personId: personOption.value,
      eventId,
      guestCount,
      notes: notes.trim(),
    });
  }

  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">{m.admin_create_registration()}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
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
                value={eventId}
                onChange={(ev) => setEventId(ev.target.value)}
                className="bg-dark text-light border-secondary"
                required
              >
                <option value="">{m.admin_select_event_placeholder()}</option>
                {sortedEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {[ev.title, ev.edition?.editionType && ev.edition.editionType !== "festival" ? "Standalone" : null].filter(Boolean).join(" · ")}
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
            <Select<PersonOption, false>
              isClearable
              options={personOptions}
              value={personOption}
              onChange={handlePersonChange}
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
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">{m.admin_guests_count()}</Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={20}
              value={guestCount}
              onChange={(e) => setGuestCount(Number(e.target.value))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>

          <Form.Group>
            <Form.Label className="text-secondary small">{m.admin_notes()}</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-dark text-light border-secondary"
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
            disabled={createRegistrationMutation.isPending || !personOption || !hasValidEventSelection}
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
