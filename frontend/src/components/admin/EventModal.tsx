import { useEffect, useMemo } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { m } from "@/paraglide/messages";
import type { Event, EventFormData } from "@/types/event";
import type { Edition } from "./editionTypes";

interface EventModalProps {
  show: boolean;
  edition: Edition;
  initial: Event | null;
  onSave: (formData: EventFormData) => void;
  onHide: () => void;
}

const EMPTY_FORM: EventFormData = {
  editionId: "",
  title: "",
  description: "",
  date: "",
  startTime: "",
  endTime: "",
  category: "other",
  registrationRequired: false,
  registrationsOpenFrom: "",
  maxCapacity: "",
  sortOrder: "",
  active: true,
};

export default function EventModal({ show, edition, initial, onSave, onHide }: EventModalProps) {
  const isFestival = edition.editionType === "festival";
  const derivedStandaloneDate = useMemo(
    () => edition.dates[0] ?? initial?.date ?? "",
    [edition.dates, initial?.date],
  );

  const form = useForm({
    defaultValues: EMPTY_FORM,
    onSubmit: ({ value }) => {
      const submitDate = isFestival ? value.date : value.date || derivedStandaloneDate;
      onSave({ ...value, date: submitDate });
    },
  });

  useEffect(() => {
    if (!show) return;
    form.reset(
      initial
        ? {
            editionId: initial.editionId,
            title: initial.title,
            description: initial.description,
            date: initial.date,
            startTime: initial.startTime,
            endTime: initial.endTime ?? "",
            category: initial.category,
            registrationRequired: initial.registrationRequired,
            registrationsOpenFrom: initial.registrationsOpenFrom ?? "",
            maxCapacity: initial.maxCapacity != null ? String(initial.maxCapacity) : "",
            sortOrder: initial.sortOrder != null ? String(initial.sortOrder) : "",
            active: initial.active,
          }
        : {
            ...EMPTY_FORM,
            editionId: edition.id,
            date: isFestival ? (edition.dates[0] ?? "") : derivedStandaloneDate,
          },
    );
  }, [derivedStandaloneDate, edition.id, edition.dates, initial, isFestival, form, show]);

  // Keep standalone date field in sync with derived date
  useEffect(() => {
    if (!isFestival && derivedStandaloneDate) {
      form.setFieldValue("date", derivedStandaloneDate);
    }
  }, [derivedStandaloneDate, isFestival, form]);

  const dateValue = useStore(form.store, (s) => s.values.date);
  const registrationRequired = useStore(form.store, (s) => s.values.registrationRequired);

  const effectiveDate = isFestival ? dateValue : dateValue || derivedStandaloneDate;

  const isEdit = !!initial;

  return (
    <Modal show={show} onHide={onHide} centered size="lg" data-bs-theme="dark" dialogClassName="admin-dialog">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          {isEdit ? m.admin_content_edition_edit_event() : m.admin_content_edition_add_event()}
        </Modal.Title>
      </Modal.Header>
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        noValidate
      >
        <Modal.Body className="bg-dark">
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Group controlId="event-title" style={{ minWidth: "240px", flex: "2 1 240px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_title()}
              </Form.Label>
              <form.Field
                name="title"
                validators={{
                  onChange: ({ value }) =>
                    !value?.trim() ? m.admin_event_title_required() : undefined,
                }}
              >
                {(field) => {
                  const showErr = field.state.meta.isTouched && field.state.meta.errors.length > 0;
                  return (
                    <>
                      <Form.Control
                        size="sm"
                        className="bg-dark text-light border-secondary"
                        autoFocus
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        isInvalid={showErr}
                      />
                      {showErr && (
                        <Form.Control.Feedback type="invalid">
                          {field.state.meta.errors[0]}
                        </Form.Control.Feedback>
                      )}
                    </>
                  );
                }}
              </form.Field>
            </Form.Group>
            <Form.Group controlId="event-category" style={{ minWidth: "160px", flex: "1 1 160px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_category()}
              </Form.Label>
              <form.Field name="category">
                {(field) => (
                  <Form.Control
                    size="sm"
                    className="bg-dark text-light border-secondary"
                    placeholder={m.admin_event_category_placeholder()}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </Form.Group>
          </div>

          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Group controlId="event-date" style={{ maxWidth: "180px" }}>
              <Form.Label className="text-secondary small mb-1">{m.admin_event_date()}</Form.Label>
              <form.Field
                name="date"
                validators={{
                  onChange: ({ value }) => (!value ? m.admin_event_date_required() : undefined),
                }}
              >
                {(field) => {
                  const showErr = field.state.meta.isTouched && field.state.meta.errors.length > 0;
                  return (
                    <>
                      <Form.Control
                        type="date"
                        size="sm"
                        className="bg-dark text-light border-secondary"
                        readOnly={!isFestival && Boolean(derivedStandaloneDate)}
                        isInvalid={showErr}
                        value={effectiveDate}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                      {showErr && (
                        <Form.Control.Feedback type="invalid">
                          {field.state.meta.errors[0]}
                        </Form.Control.Feedback>
                      )}
                    </>
                  );
                }}
              </form.Field>
            </Form.Group>
            <Form.Group controlId="event-start-time" style={{ maxWidth: "140px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_start_time()}
              </Form.Label>
              <form.Field
                name="startTime"
                validators={{
                  onChange: ({ value }) =>
                    !value ? m.admin_event_start_time_required() : undefined,
                }}
              >
                {(field) => {
                  const showErr = field.state.meta.isTouched && field.state.meta.errors.length > 0;
                  return (
                    <>
                      <Form.Control
                        type="time"
                        size="sm"
                        className="bg-dark text-light border-secondary"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        isInvalid={showErr}
                      />
                      {showErr && (
                        <Form.Control.Feedback type="invalid">
                          {field.state.meta.errors[0]}
                        </Form.Control.Feedback>
                      )}
                    </>
                  );
                }}
              </form.Field>
            </Form.Group>
            <Form.Group controlId="event-end-time" style={{ maxWidth: "140px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_end_time()}
              </Form.Label>
              <form.Field name="endTime">
                {(field) => (
                  <Form.Control
                    type="time"
                    size="sm"
                    className="bg-dark text-light border-secondary"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </Form.Group>
            <Form.Group controlId="event-max-capacity" style={{ maxWidth: "160px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_event_max_capacity()}
              </Form.Label>
              <form.Field
                name="maxCapacity"
                validators={{
                  onChange: ({ value }) =>
                    value && Number(value) < 0 ? m.admin_event_capacity_min() : undefined,
                }}
              >
                {(field) => {
                  const showErr = field.state.meta.isTouched && field.state.meta.errors.length > 0;
                  return (
                    <>
                      <Form.Control
                        type="number"
                        min={0}
                        size="sm"
                        className="bg-dark text-light border-secondary"
                        disabled={!registrationRequired}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        isInvalid={showErr}
                      />
                      {showErr && (
                        <Form.Control.Feedback type="invalid">
                          {field.state.meta.errors[0]}
                        </Form.Control.Feedback>
                      )}
                    </>
                  );
                }}
              </form.Field>
            </Form.Group>
          </div>

          <Form.Group controlId="event-description" className="mb-3">
            <Form.Label className="text-secondary small mb-1">
              {m.admin_content_event_description()}
            </Form.Label>
            <form.Field name="description">
              {(field) => (
                <Form.Control
                  as="textarea"
                  size="sm"
                  rows={2}
                  className="bg-dark text-light border-secondary"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          </Form.Group>

          <form.Field name="registrationRequired">
            {(field) => (
              <Form.Check
                type="checkbox"
                id="modal-event-registration"
                label={m.admin_content_event_requires_registration()}
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
                className="text-light mb-2"
              />
            )}
          </form.Field>
          {registrationRequired && (
            <Form.Group className="mb-2" style={{ maxWidth: "280px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_edition_registration_opens()}
              </Form.Label>
              <form.Field name="registrationsOpenFrom">
                {(field) => (
                  <Form.Control
                    type="datetime-local"
                    size="sm"
                    className="bg-dark text-light border-secondary"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </Form.Group>
          )}

          {!isFestival && (
            <div className="text-secondary small mt-2">{m.admin_event_standalone_help()}</div>
          )}
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="outline-secondary" size="sm" onClick={onHide}>
            {m.close()}
          </Button>
          <Button type="submit" variant="warning" size="sm">
            <i className="bi bi-floppy me-1" aria-hidden="true" />
            {m.admin_save()}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
