import React, { useCallback, useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Select, { type SingleValue, type StylesConfig } from "react-select";
import type { Reservation } from "../../types/reservation";

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
  menu: (base) => ({ ...base, backgroundColor: "#212529", border: "1px solid #6c757d", zIndex: 9999 }),
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

interface ScheduleEvent {
  id: string;
  title: string;
  day_id: number;
  reservation: boolean;
}

interface ReservationCreateModalProps {
  show: boolean;
  authHeaders: () => Record<string, string>;
  onSaved: (reservation: Reservation) => void;
  onHide: () => void;
}

function apiResToReservation(d: Record<string, unknown>): Reservation {
  const rawOrders = (d.pre_orders ?? []) as Record<string, unknown>[];
  return {
    id: d.id as string,
    personId: (d.person_id as string | null) ?? null,
    name: d.name as string,
    email: (d.email ?? "") as string,
    phone: (d.phone ?? "") as string,
    eventId: (d.event_id ?? "") as string,
    eventTitle: (d.event_title ?? "") as string,
    guestCount: (d.guest_count ?? 1) as number,
    preOrders: rawOrders.map((o) => ({
      productId: (o.product_id ?? "") as string,
      name: (o.name ?? "") as string,
      quantity: (o.quantity ?? 1) as number,
      price: (o.price ?? 0) as number,
      category: (o.category ?? "other") as import("../../types/reservation").OrderItemCategory,
      delivered: (o.delivered ?? false) as boolean,
    })),
    notes: (d.notes ?? "") as string,
    accessibilityNote: (d.accessibility_note ?? "") as string,
    tableId: (d.table_id as string | undefined) ?? undefined,
    status: (d.status ?? "confirmed") as import("../../types/reservation").ReservationStatus,
    paymentStatus: (d.payment_status ?? "unpaid") as import("../../types/reservation").PaymentStatus,
    checkedIn: (d.checked_in ?? false) as boolean,
    checkedInAt: (d.checked_in_at as string | undefined) ?? undefined,
    strapIssued: (d.strap_issued ?? false) as boolean,
    createdAt: (d.created_at ?? "") as string,
    updatedAt: (d.updated_at ?? "") as string,
  };
}

export default function ReservationCreateModal({
  show,
  authHeaders,
  onSaved,
  onHide,
}: ReservationCreateModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [eventId, setEventId] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [personOption, setPersonOption] = useState<SingleValue<PersonOption>>(null);
  const [personOptions, setPersonOptions] = useState<PersonOption[]>([]);
  const [personQuery, setPersonQuery] = useState("");
  const [loadingPersons, setLoadingPersons] = useState(false);

  useEffect(() => {
    if (!show) return;
    setName("");
    setEmail("");
    setPhone("");
    setGuestCount(1);
    setNotes("");
    setEventId("");
    setEventTitle("");
    setPersonOption(null);
    setPersonQuery("");
    setPersonOptions([]);
    setError(null);

    // Fetch active edition events
    setLoadingEvents(true);
    fetch("/api/editions/active", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.schedule) {
          setEvents(
            (data.schedule as ScheduleEvent[]).filter((e: ScheduleEvent) => e.reservation),
          );
        }
      })
      .catch(() => {
        // Non-critical — user can type manually
      })
      .finally(() => setLoadingEvents(false));
  }, [show, authHeaders]);

  const searchPersons = useCallback(
    async (q: string) => {
      setLoadingPersons(true);
      try {
        const res = await fetch(`/api/people?q=${encodeURIComponent(q)}&active=true`, {
          headers: authHeaders(),
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
        }
      } finally {
        setLoadingPersons(false);
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
    if (opt) {
      if (!name) setName(opt.name);
      if (!email) setEmail(opt.email);
      if (!phone) setPhone(opt.phone);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !eventId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reservations/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          person_id: personOption?.value ?? null,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          event_id: eventId,
          event_title: eventTitle,
          guest_count: guestCount,
          notes: notes.trim(),
          status: "confirmed",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { detail?: string }).detail ?? "Failed to create reservation.");
        return;
      }
      const data = await res.json();
      onSaved(apiResToReservation(data as Record<string, unknown>));
      onHide();
    } catch {
      setError("Failed to create reservation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onHide={onHide} centered data-bs-theme="dark">
      <Modal.Header closeButton className="bg-dark border-secondary">
        <Modal.Title className="text-warning fs-6">Create Reservation</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body className="bg-dark">
          {error && (
            <Alert variant="danger" className="py-2 small" dismissible onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">Event</Form.Label>
            {loadingEvents ? (
              <div className="text-secondary small">
                <Spinner animation="border" size="sm" className="me-2" />
                Loading events…
              </div>
            ) : events.length > 0 ? (
              <Form.Select
                value={eventId}
                onChange={(ev) => {
                  const selected = events.find((e) => e.id === ev.target.value);
                  setEventId(ev.target.value);
                  setEventTitle(selected?.title ?? ev.target.value);
                }}
                className="bg-dark text-light border-secondary"
                required
              >
                <option value="">— Select event —</option>
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
                onChange={(ev) => {
                  setEventId(ev.target.value);
                  setEventTitle(ev.target.value);
                }}
                className="bg-dark text-light border-secondary"
                placeholder="Event ID / title"
                required
              />
            )}
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">Person link (optional)</Form.Label>
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
              placeholder="Search by name, email, phone…"
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
            <Form.Label className="text-secondary small">Name *</Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-dark text-light border-secondary"
              required
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">Email *</Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-dark text-light border-secondary"
              required
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">Phone</Form.Label>
            <Form.Control
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="text-secondary small">Guests</Form.Label>
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
            <Form.Label className="text-secondary small">Notes</Form.Label>
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
            Cancel
          </Button>
          <Button
            type="submit"
            variant="warning"
            size="sm"
            disabled={saving || !name.trim() || !email.trim() || !eventId}
          >
            {saving ? (
              <Spinner as="span" animation="border" size="sm" className="me-1" />
            ) : (
              <i className="bi bi-floppy me-1" aria-hidden="true" />
            )}
            Create
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
