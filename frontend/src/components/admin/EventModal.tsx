import React, { useEffect, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { m } from "@/paraglide/messages";
import type { ScheduleEvent } from "./editionTypes";

const EMPTY_EVENT: ScheduleEvent = {
  id: "",
  title: "",
  start_time: "",
  end_time: null,
  description: "",
  reservation: false,
  reservations_open_from: null,
  location: null,
  presenter: null,
  category: "other",
  day_id: 1,
};

interface EventModalProps {
  show: boolean;
  initial: ScheduleEvent | null; // null = new event
  onSave: (event: ScheduleEvent) => void;
  onHide: () => void;
}

export default function EventModal({ show, initial, onSave, onHide }: EventModalProps) {
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [dayId, setDayId] = useState(1);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [reservation, setReservation] = useState(false);
  const [reservationsOpenFrom, setReservationsOpenFrom] = useState("");
  const [location, setLocation] = useState("");
  const [presenter, setPresenter] = useState("");

  useEffect(() => {
    if (show) {
      const ev = initial ?? EMPTY_EVENT;
      setId(ev.id);
      setTitle(ev.title);
      setDayId(ev.day_id);
      setStartTime(ev.start_time);
      setEndTime(ev.end_time ?? "");
      setDescription(ev.description);
      setCategory(ev.category);
      setReservation(ev.reservation);
      setReservationsOpenFrom(ev.reservations_open_from ?? "");
      setLocation(ev.location ?? "");
      setPresenter(ev.presenter ?? "");
    }
  }, [show, initial]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim() || !title.trim() || !startTime.trim()) return;
    onSave({
      id: id.trim(),
      title: title.trim(),
      start_time: startTime.trim(),
      end_time: endTime.trim() || null,
      description: description.trim(),
      reservation,
      reservations_open_from: reservation ? reservationsOpenFrom.trim() || null : null,
      location: location.trim() || null,
      presenter: presenter.trim() || null,
      category: category.trim(),
      day_id: dayId,
    });
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
            <Form.Group controlId="event-id" style={{ minWidth: "140px", flex: "1 1 140px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_id()}
              </Form.Label>
              <Form.Control
                size="sm"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="bg-dark text-light border-secondary"
                placeholder={m.admin_event_id_placeholder()}
                required
                readOnly={isEdit}
              />
            </Form.Group>
            <Form.Group controlId="event-title" style={{ minWidth: "200px", flex: "2 1 200px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_title()}
              </Form.Label>
              <Form.Control
                size="sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-dark text-light border-secondary"
                required
                autoFocus={!isEdit}
              />
            </Form.Group>
          </div>
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Group controlId="event-day" style={{ maxWidth: "120px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_day()}
              </Form.Label>
              <Form.Select
                size="sm"
                value={dayId}
                onChange={(e) => setDayId(Number(e.target.value))}
                className="bg-dark text-light border-secondary"
              >
                <option value={1}>{m.admin_content_edition_friday()}</option>
                <option value={2}>{m.admin_content_edition_saturday()}</option>
                <option value={3}>{m.admin_content_edition_sunday()}</option>
              </Form.Select>
            </Form.Group>
            <Form.Group controlId="event-start-time" style={{ maxWidth: "120px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_start_time()}
              </Form.Label>
              <Form.Control
                size="sm"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-dark text-light border-secondary"
                placeholder="19:00"
                required
              />
            </Form.Group>
            <Form.Group controlId="event-end-time" style={{ maxWidth: "120px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_end_time()}
              </Form.Label>
              <Form.Control
                size="sm"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-dark text-light border-secondary"
                placeholder="21:30"
              />
            </Form.Group>
            <Form.Group controlId="event-category" style={{ minWidth: "140px", flex: "1 1 140px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_category()}
              </Form.Label>
              <Form.Control
                size="sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-dark text-light border-secondary"
                placeholder={m.admin_event_category_placeholder()}
                required
              />
            </Form.Group>
          </div>
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Group controlId="event-location" style={{ minWidth: "160px", flex: "1 1 160px" }}>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_location()}
              </Form.Label>
              <Form.Control
                size="sm"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="bg-dark text-light border-secondary"
              />
            </Form.Group>
            <Form.Group
              controlId="event-presenter"
              style={{ minWidth: "160px", flex: "1 1 160px" }}
            >
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_event_presenter()}
              </Form.Label>
              <Form.Control
                size="sm"
                value={presenter}
                onChange={(e) => setPresenter(e.target.value)}
                className="bg-dark text-light border-secondary"
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
          <Form.Check
            type="checkbox"
            id="modal-event-reservation"
            label={m.admin_content_event_requires_reservation()}
            checked={reservation}
            onChange={(e) => setReservation(e.target.checked)}
            className="text-light mb-2"
          />
          {reservation && (
            <Form.Group>
              <Form.Label className="text-secondary small mb-1">
                {m.admin_content_edition_reservation_opens()}
              </Form.Label>
              <Form.Control
                type="datetime-local"
                size="sm"
                value={reservationsOpenFrom}
                onChange={(e) => setReservationsOpenFrom(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ maxWidth: "240px" }}
              />
            </Form.Group>
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
