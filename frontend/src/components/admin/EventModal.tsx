import React, { useEffect, useMemo, useState } from "react";
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
  const [formData, setFormData] = useState<EventFormData>(EMPTY_FORM);
  const isFestival = edition.editionType === "festival";
  const derivedStandaloneDate = useMemo(
    () => edition.dates[0] ?? initial?.date ?? "",
    [edition.dates, initial?.date],
  );

  useEffect(() => {
    if (!show) return;
    setFormData(
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
            maxCapacity: initial.maxCapacity ? String(initial.maxCapacity) : "",
            sortOrder: initial.sortOrder ? String(initial.sortOrder) : "",
            active: initial.active,
          }
        : {
            ...EMPTY_FORM,
            editionId: edition.id,
            date: isFestival ? (edition.dates[0] ?? "") : derivedStandaloneDate,
          },
    );
  }, [derivedStandaloneDate, edition.id, edition.dates, initial, isFestival, show]);

  function updateField<K extends keyof EventFormData>(key: K, value: EventFormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  const effectiveDate = isFestival ? formData.date : formData.date || derivedStandaloneDate;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.title.trim() || !effectiveDate || !formData.startTime.trim()) return;

    onSave({ ...formData, date: effectiveDate });
  }

  const isEdit = !!initial;

  return (
    <Modal show={show} onHide={onHide} centered size="lg" data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">
          {isEdit ? m.admin_content_edition_edit_event() : m.admin_content_edition_add_event()}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body className="bg-dark">
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Group controlId="event-title" style={{ minWidth: "240px", flex: "2 1 240px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_title()}
              </Form.Label>
              <Form.Control
                size="sm"
                value={formData.title}
                onChange={(e) => updateField("title", e.target.value)}
                className="bg-dark text-light border-secondary"
                required
                autoFocus
              />
            </Form.Group>
            <Form.Group controlId="event-category" style={{ minWidth: "160px", flex: "1 1 160px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_category()}
              </Form.Label>
              <Form.Control
                size="sm"
                value={formData.category}
                onChange={(e) => updateField("category", e.target.value)}
                className="bg-dark text-light border-secondary"
                placeholder={m.admin_event_category_placeholder()}
                required
              />
            </Form.Group>
          </div>

          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Group controlId="event-date" style={{ maxWidth: "180px" }}>
              <Form.Label className="text-secondary small mb-1">{m.admin_event_date()}</Form.Label>
              <Form.Control
                type="date"
                size="sm"
                value={effectiveDate}
                onChange={(e) => updateField("date", e.target.value)}
                className="bg-dark text-light border-secondary"
                readOnly={!isFestival && Boolean(derivedStandaloneDate)}
                required
              />
            </Form.Group>
            <Form.Group controlId="event-start-time" style={{ maxWidth: "140px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_start_time()}
              </Form.Label>
              <Form.Control
                type="time"
                size="sm"
                value={formData.startTime}
                onChange={(e) => updateField("startTime", e.target.value)}
                className="bg-dark text-light border-secondary"
                required
              />
            </Form.Group>
            <Form.Group controlId="event-end-time" style={{ maxWidth: "140px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_end_time()}
              </Form.Label>
              <Form.Control
                type="time"
                size="sm"
                value={formData.endTime}
                onChange={(e) => updateField("endTime", e.target.value)}
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
            <Form.Group controlId="event-max-capacity" style={{ maxWidth: "160px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_event_max_capacity()}
              </Form.Label>
              <Form.Control
                type="number"
                min={1}
                size="sm"
                value={formData.maxCapacity}
                onChange={(e) => updateField("maxCapacity", e.target.value)}
                className="bg-dark text-light border-secondary"
                disabled={!formData.registrationRequired}
              />
            </Form.Group>
          </div>

          <Form.Group controlId="event-description" className="mb-3">
            <Form.Label className="text-secondary small mb-1">
              {m.admin_content_event_description()}
            </Form.Label>
            <Form.Control
              as="textarea"
              size="sm"
              rows={2}
              value={formData.description}
              onChange={(e) => updateField("description", e.target.value)}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>

          <Form.Check
            type="checkbox"
            id="modal-event-registration"
            label={m.admin_content_event_requires_registration()}
            checked={formData.registrationRequired}
            onChange={(e) => updateField("registrationRequired", e.target.checked)}
            className="text-light mb-2"
          />
          {formData.registrationRequired && (
            <Form.Group className="mb-2" style={{ maxWidth: "280px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_edition_registration_opens()}
              </Form.Label>
              <Form.Control
                type="datetime-local"
                size="sm"
                value={formData.registrationsOpenFrom}
                onChange={(e) => updateField("registrationsOpenFrom", e.target.value)}
                className="bg-dark text-light border-secondary"
              />
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
