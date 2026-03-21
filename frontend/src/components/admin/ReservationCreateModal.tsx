import React, { useCallback, useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Select, { type SingleValue, type StylesConfig } from "react-select";
import { getActiveEdition, type ScheduleEvent } from "@/config/editions";
import type { Reservation } from "@/types/reservation";
import { apiToReservation } from "@/types/reservationMapper";
import { m } from "@/paraglide/messages";
import { mapApiEditionToEdition, type ApiEdition } from "@/utils/editionApi";

interface PersonOption {
  value: string;
  label: string;
  sub: string;
  name: string;
  email: string;
  phone: string;
}

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

interface ReservationCreateModalProps {
  show: boolean;
  authHeaders: () => Record<string, string>;
  onSaved: (reservation: Reservation) => void;
  onHide: () => void;
}

export default function ReservationCreateModal({
  show,
  authHeaders,
  onSaved,
  onHide,
}: ReservationCreateModalProps) {
  const [guestCount, setGuestCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [eventId, setEventId] = useState("");
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [personOption, setPersonOption] = useState<SingleValue<PersonOption>>(null);
  const [personOptions, setPersonOptions] = useState<PersonOption[]>([]);
  const [personQuery, setPersonQuery] = useState("");
  const [loadingPersons, setLoadingPersons] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!show) return;
    setGuestCount(1);
    setNotes("");
    setEventId("");
    setEvents([]);
    setPersonOption(null);
    setPersonQuery("");
    setPersonOptions([]);
    setError(null);

    // Fetch active edition events
    setLoadingEvents(true);
    fetch("/api/editions/active", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.events) {
          const edition = mapApiEditionToEdition(data as ApiEdition, getActiveEdition().dates);
          setEvents(edition.schedule.filter((event) => event.reservation));
        } else {
          setEvents([]);
        }
      })
      .catch(() => {
        setEvents([]);
      })
      .finally(() => setLoadingEvents(false));
  }, [show, authHeaders]);

  const searchPersons = useCallback(
    async (q: string) => {
      if (!q) {
        abortRef.current?.abort();
        abortRef.current = null;
        setPersonOptions([]);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoadingPersons(true);
      try {
        const res = await fetch(`/api/people?q=${encodeURIComponent(q)}&active=true`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as {
            id: string;
            name: string;
            email: string;
            phone: string;
          }[];
          setPersonOptions(
            data.map((p) => ({
              value: p.id,
              label: p.name,
              sub: [p.email, p.phone].filter(Boolean).join(" · "),
              name: p.name,
              email: p.email,
              phone: p.phone,
            })),
          );
        } else {
          setPersonOptions([]);
        }
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setPersonOptions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingPersons(false);
        }
      }
    },
    [authHeaders],
  );

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => {
      searchPersons(personQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [personQuery, show, searchPersons]);

  function handlePersonChange(opt: SingleValue<PersonOption>) {
    setPersonOption(opt);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personOption || !eventId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/registrations/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          person_id: personOption.value,
          event_id: eventId,
          guest_count: guestCount,
          pre_orders: [],
          notes: notes.trim(),
          accessibility_note: "",
          status: "confirmed",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { detail?: string }).detail ?? m.admin_error_create_reservation());
        return;
      }
      const data = await res.json();
      onSaved(apiToReservation(data as Record<string, unknown>));
      onHide();
    } catch {
      setError(m.admin_error_create_reservation());
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">{m.admin_create_reservation()}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body className="bg-dark">
          {error && (
            <Alert
              variant="danger"
              className="py-2 small"
              dismissible
              onClose={() => setError(null)}
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
            ) : events.length > 0 ? (
              <Form.Select
                value={eventId}
                onChange={(ev) => setEventId(ev.target.value)}
                className="bg-dark text-light border-secondary"
                required
              >
                <option value="">{m.admin_select_event_placeholder()}</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </Form.Select>
            ) : (
              <Form.Control
                type="text"
                value={eventId}
                onChange={(ev) => setEventId(ev.target.value)}
                className="bg-dark text-light border-secondary"
                placeholder={m.admin_event_id_title_placeholder()}
                required
              />
            )}
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">{m.admin_person_label()} *</Form.Label>
            <Select<PersonOption, false>
              isClearable
              options={personOptions}
              value={personOption}
              onChange={handlePersonChange}
              onInputChange={(v) => setPersonQuery(v)}
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
            disabled={saving || !personOption || !eventId}
          >
            {saving ? (
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
