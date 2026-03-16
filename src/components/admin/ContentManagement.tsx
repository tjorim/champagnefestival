/**
 * ContentManagement — admin tab for editing producers, sponsors, and editions.
 *
 * Loads current content from the backend (falling back to placeholders), lets
 * the admin add, edit, and remove items, then saves via PUT /api/content/{key}.
 * Editions are managed via the /api/editions CRUD API.
 */

import React, { useCallback, useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Collapse from "react-bootstrap/Collapse";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Spinner from "react-bootstrap/Spinner";
import { m } from "../../paraglide/messages";
import { producerItems, sponsorItems } from "../../config/marqueeSlider";

interface ContentManagementProps {
  authHeaders: () => Record<string, string>;
}

type ContentKey = "producers" | "sponsors";

interface ItemDraft {
  id: number;
  name: string;
  image: string;
}

// ---------------------------------------------------------------------------
// ItemEditor — inline add-row
// ---------------------------------------------------------------------------

interface ItemEditorProps {
  onAdd: (item: ItemDraft) => void;
}

function ItemEditor({ onAdd }: ItemEditorProps) {
  const [name, setName] = useState("");
  const [image, setImage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !image.trim()) return;
    onAdd({ id: Date.now(), name: name.trim(), image: image.trim() });
    setName("");
    setImage("");
  }

  return (
    <Form onSubmit={handleSubmit} className="d-flex gap-2 mt-2 flex-wrap">
      <Form.Control
        size="sm"
        placeholder={m.admin_content_name_placeholder()}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="bg-dark text-light border-secondary"
        style={{ minWidth: "180px", flex: "1 1 180px" }}
        required
      />
      <Form.Control
        size="sm"
        placeholder={m.admin_content_image_url_placeholder()}
        value={image}
        onChange={(e) => setImage(e.target.value)}
        className="bg-dark text-light border-secondary"
        style={{ minWidth: "260px", flex: "2 1 260px" }}
        required
      />
      <Button type="submit" size="sm" variant="outline-warning">
        <i className="bi bi-plus-lg me-1" aria-hidden="true" />
        {m.admin_content_add_item()}
      </Button>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// ContentSection — one list (producers or sponsors)
// ---------------------------------------------------------------------------

interface ContentSectionProps {
  sectionKey: ContentKey;
  title: string;
  authHeaders: () => Record<string, string>;
}

function ContentSection({ sectionKey, title, authHeaders }: ContentSectionProps) {
  const fallback = sectionKey === "producers" ? [...producerItems] : [...sponsorItems];

  const [items, setItems] = useState<ItemDraft[]>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editImage, setEditImage] = useState("");

  // Load from backend; fall back to placeholder on 404 / error
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/content/${sectionKey}`);
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { value: ItemDraft[] };
          if (Array.isArray(data.value)) setItems(data.value);
        }
        // 404 = not saved yet → keep placeholder
      } catch {
        // network error → keep placeholder
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sectionKey]);

  const handleRemove = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSaveStatus("idle");
  }, []);

  const handleAdd = useCallback((item: ItemDraft) => {
    setItems((prev) => [...prev, item]);
    setSaveStatus("idle");
  }, []);

  const handleEditStart = useCallback((item: ItemDraft) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditImage(item.image);
  }, []);

  const handleEditSave = useCallback(
    (id: number) => {
      if (!editName.trim() || !editImage.trim()) return;
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, name: editName.trim(), image: editImage.trim() } : i)),
      );
      setEditingId(null);
      setSaveStatus("idle");
    },
    [editName, editImage],
  );

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch(`/api/content/${sectionKey}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ value: items }),
      });
      setSaveStatus(res.ok ? "saved" : "error");
    } catch {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  }, [sectionKey, items, authHeaders]);

  if (isLoading) {
    return (
      <div className="text-center py-3">
        <Spinner animation="border" size="sm" variant="warning" />
        <span className="ms-2 text-secondary">{m.admin_content_loading()}</span>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="mb-0 text-warning">
          {title}
          <Badge bg="secondary" className="ms-2">
            {items.length}
          </Badge>
        </h6>
        <Button variant="outline-warning" size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Spinner
              as="span"
              animation="border"
              size="sm"
              role="status"
              aria-hidden="true"
              className="me-1"
            />
          ) : (
            <i className="bi bi-floppy me-1" aria-hidden="true" />
          )}
          {m.admin_content_save_section()}
        </Button>
      </div>

      {saveStatus === "saved" && (
        <Alert variant="success" className="py-1 mb-2">
          {m.admin_content_saved()}
        </Alert>
      )}
      {saveStatus === "error" && (
        <Alert variant="danger" className="py-1 mb-2">
          {m.admin_content_error_save()}
        </Alert>
      )}

      <ListGroup variant="flush" className="mb-2">
        {items.length === 0 ? (
          <ListGroup.Item className="bg-dark text-secondary fst-italic">
            {m.admin_content_fallback_note()}
          </ListGroup.Item>
        ) : (
          items.map((item) =>
            editingId === item.id ? (
              <ListGroup.Item key={item.id} className="bg-dark border-secondary">
                <div className="d-flex gap-2 flex-wrap align-items-center">
                  <Form.Control
                    size="sm"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-dark text-light border-secondary"
                    style={{ minWidth: "160px", flex: "1 1 160px" }}
                    autoFocus
                  />
                  <Form.Control
                    size="sm"
                    value={editImage}
                    onChange={(e) => setEditImage(e.target.value)}
                    className="bg-dark text-light border-secondary"
                    style={{ minWidth: "260px", flex: "2 1 260px" }}
                  />
                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={() => handleEditSave(item.id)}
                    aria-label="Save"
                  >
                    <i className="bi bi-check-lg" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={handleEditCancel}
                    aria-label="Cancel"
                  >
                    <i className="bi bi-x-lg" aria-hidden="true" />
                  </Button>
                </div>
              </ListGroup.Item>
            ) : (
              <ListGroup.Item
                key={item.id}
                className="bg-dark text-light border-secondary d-flex justify-content-between align-items-center gap-2"
              >
                <span className="d-flex align-items-center gap-2 flex-grow-1 text-truncate">
                  {item.image && (
                    <span
                      className="d-inline-flex align-items-center justify-content-center"
                      style={{ width: 32, height: 32, flexShrink: 0 }}
                    >
                      {imageErrors.has(item.id) ? (
                        <span role="img" aria-label={`Image unavailable for ${item.name}`}>
                          🖼
                        </span>
                      ) : (
                        <img
                          src={item.image}
                          alt={item.name}
                          style={{ width: 32, height: 32, objectFit: "contain" }}
                          onError={() => setImageErrors((prev) => new Set(prev).add(item.id))}
                        />
                      )}
                    </span>
                  )}
                  <span className="text-truncate">{item.name}</span>
                  <small className="text-secondary text-truncate d-none d-md-inline">
                    {item.image}
                  </small>
                </span>
                <span className="d-flex gap-1 flex-shrink-0">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => handleEditStart(item)}
                    aria-label={`Edit ${item.name}`}
                  >
                    <i className="bi bi-pencil" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleRemove(item.id)}
                    aria-label={`${m.admin_delete()} ${item.name}`}
                  >
                    <i className="bi bi-trash" aria-hidden="true" />
                  </Button>
                </span>
              </ListGroup.Item>
            ),
          )
        )}
      </ListGroup>

      <ItemEditor onAdd={handleAdd} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types for the Editions API
// ---------------------------------------------------------------------------

interface ScheduleEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  description: string;
  reservation: boolean;
  reservations_open_from: string | null;
  location: string | null;
  presenter: string | null;
  category: string;
  day_id: number;
}

interface Edition {
  id: string;
  year: number;
  month: string;
  friday: string;
  saturday: string;
  sunday: string;
  venue_name: string;
  venue_address: string;
  venue_city: string;
  venue_postal_code: string;
  venue_country: string;
  venue_lat: number;
  venue_lng: number;
  schedule: ScheduleEvent[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

const DAY_LABELS: Record<number, string> = { 1: "Fri", 2: "Sat", 3: "Sun" };

function parseEditionDate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

// ---------------------------------------------------------------------------
// AddEventForm — inline form to add a schedule event to an edition
// ---------------------------------------------------------------------------

interface AddEventFormProps {
  onAdd: (event: ScheduleEvent) => void;
}

function AddEventForm({ onAdd }: AddEventFormProps) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [dayId, setDayId] = useState<number>(1);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [reservation, setReservation] = useState(false);
  const [reservationsOpenFrom, setReservationsOpenFrom] = useState("");
  const [location, setLocation] = useState("");
  const [presenter, setPresenter] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim() || !title.trim() || !startTime.trim() || !category.trim()) return;
    onAdd({
      id: id.trim(),
      title: title.trim(),
      start_time: startTime.trim(),
      end_time: endTime.trim() || null,
      description: description.trim(),
      reservation,
      reservations_open_from: reservationsOpenFrom.trim() || null,
      location: location.trim() || null,
      presenter: presenter.trim() || null,
      category: category.trim(),
      day_id: dayId,
    });
    setId("");
    setTitle("");
    setDayId(1);
    setStartTime("");
    setEndTime("");
    setDescription("");
    setCategory("other");
    setReservation(false);
    setReservationsOpenFrom("");
    setLocation("");
    setPresenter("");
    setOpen(false);
  }

  return (
    <div className="mt-2">
      <Button
        size="sm"
        variant="outline-secondary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <i className="bi bi-plus-lg me-1" aria-hidden="true" />
        {m.admin_content_edition_add_event()}
      </Button>
      <Collapse in={open}>
        <div>
          <Form onSubmit={handleSubmit} className="mt-2 p-2 border border-secondary rounded">
            <div className="d-flex gap-2 flex-wrap mb-2">
              <Form.Control
                size="sm"
                placeholder="ID (e.g. tasting-fri-1)"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "160px", flex: "1 1 160px" }}
                required
              />
              <Form.Control
                size="sm"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "200px", flex: "2 1 200px" }}
                required
              />
            </div>
            <div className="d-flex gap-2 flex-wrap mb-2">
              <Form.Select
                size="sm"
                value={dayId}
                onChange={(e) => setDayId(Number(e.target.value))}
                className="bg-dark text-light border-secondary"
                style={{ maxWidth: "120px" }}
              >
                <option value={1}>{m.admin_content_edition_friday()}</option>
                <option value={2}>{m.admin_content_edition_saturday()}</option>
                <option value={3}>{m.admin_content_edition_sunday()}</option>
              </Form.Select>
              <Form.Control
                size="sm"
                placeholder="Start time (e.g. 19:00)"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "160px", flex: "1 1 160px" }}
                required
              />
              <Form.Control
                size="sm"
                placeholder="End time (optional)"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "160px", flex: "1 1 160px" }}
              />
            </div>
            <div className="d-flex gap-2 flex-wrap mb-2">
              <Form.Control
                size="sm"
                placeholder="Category (e.g. tasting, dinner)"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "180px", flex: "1 1 180px" }}
                required
              />
              <Form.Control
                size="sm"
                placeholder="Location (optional)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "180px", flex: "1 1 180px" }}
              />
              <Form.Control
                size="sm"
                placeholder="Presenter (optional)"
                value={presenter}
                onChange={(e) => setPresenter(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "180px", flex: "1 1 180px" }}
              />
            </div>
            <Form.Control
              as="textarea"
              size="sm"
              rows={2}
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-dark text-light border-secondary mb-2"
            />
            <div className="d-flex gap-3 align-items-center flex-wrap mb-2">
              <Form.Check
                type="checkbox"
                id="event-reservation"
                label="Requires reservation"
                checked={reservation}
                onChange={(e) => setReservation(e.target.checked)}
                className="text-light"
              />
              {reservation && (
                <div className="d-flex align-items-center gap-2">
                  <Form.Label className="mb-0 text-secondary small">
                    {m.admin_content_edition_reservation_opens()}
                  </Form.Label>
                  <Form.Control
                    type="datetime-local"
                    size="sm"
                    value={reservationsOpenFrom}
                    onChange={(e) => setReservationsOpenFrom(e.target.value)}
                    className="bg-dark text-light border-secondary"
                    style={{ maxWidth: "220px" }}
                  />
                </div>
              )}
            </div>
            <Button type="submit" size="sm" variant="outline-warning">
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              {m.admin_content_edition_add_event()}
            </Button>
          </Form>
        </div>
      </Collapse>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditionCard — one edition row with expandable schedule
// ---------------------------------------------------------------------------

interface EditionCardProps {
  edition: Edition;
  authHeaders: () => Record<string, string>;
  onDeleted: (id: string) => void;
  onUpdated: (edition: Edition) => void;
}

function EditionCard({ edition, authHeaders, onDeleted, onUpdated }: EditionCardProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edition-level editing
  const [editingEdition, setEditingEdition] = useState(false);
  const [editYear, setEditYear] = useState(edition.year);
  const [editMonth, setEditMonth] = useState(edition.month);
  const [editFriday, setEditFriday] = useState(edition.friday);
  const [editSaturday, setEditSaturday] = useState(edition.saturday);
  const [editSunday, setEditSunday] = useState(edition.sunday);
  const [editVenueName, setEditVenueName] = useState(edition.venue_name);
  const [editVenueAddress, setEditVenueAddress] = useState(edition.venue_address);
  const [editVenueCity, setEditVenueCity] = useState(edition.venue_city);
  const [editVenuePostalCode, setEditVenuePostalCode] = useState(edition.venue_postal_code);
  const [editVenueCountry, setEditVenueCountry] = useState(edition.venue_country);
  const [editActive, setEditActive] = useState(edition.active);

  function startEditEdition() {
    setEditYear(edition.year);
    setEditMonth(edition.month);
    setEditFriday(edition.friday);
    setEditSaturday(edition.saturday);
    setEditSunday(edition.sunday);
    setEditVenueName(edition.venue_name);
    setEditVenueAddress(edition.venue_address);
    setEditVenueCity(edition.venue_city);
    setEditVenuePostalCode(edition.venue_postal_code);
    setEditVenueCountry(edition.venue_country);
    setEditActive(edition.active);
    setEditingEdition(true);
  }

  async function commitEditEdition() {
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch(`/api/editions/${edition.id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          year: editYear,
          month: editMonth.trim(),
          friday: editFriday,
          saturday: editSaturday,
          sunday: editSunday,
          venue_name: editVenueName.trim(),
          venue_address: editVenueAddress.trim(),
          venue_city: editVenueCity.trim(),
          venue_postal_code: editVenuePostalCode.trim(),
          venue_country: editVenueCountry.trim(),
          active: editActive,
        }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Edition;
        onUpdated(updated);
        setEditingEdition(false);
      } else {
        setSaveError(true);
      }
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  // Inline event editing
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDayId, setEditDayId] = useState(1);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editReservation, setEditReservation] = useState(false);
  const [editReservationsOpenFrom, setEditReservationsOpenFrom] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editPresenter, setEditPresenter] = useState("");

  function startEditEvent(ev: ScheduleEvent) {
    setEditingEventId(ev.id);
    setEditTitle(ev.title);
    setEditDayId(ev.day_id);
    setEditStartTime(ev.start_time);
    setEditEndTime(ev.end_time ?? "");
    setEditDescription(ev.description);
    setEditCategory(ev.category);
    setEditReservation(ev.reservation);
    setEditReservationsOpenFrom(ev.reservations_open_from ?? "");
    setEditLocation(ev.location ?? "");
    setEditPresenter(ev.presenter ?? "");
  }

  function commitEditEvent() {
    if (!editingEventId) return;
    const newSchedule = edition.schedule.map((ev) =>
      ev.id === editingEventId
        ? {
            ...ev,
            title: editTitle.trim(),
            day_id: editDayId,
            start_time: editStartTime.trim(),
            end_time: editEndTime.trim() || null,
            description: editDescription.trim(),
            category: editCategory.trim(),
            reservation: editReservation,
            reservations_open_from: editReservationsOpenFrom.trim() || null,
            location: editLocation.trim() || null,
            presenter: editPresenter.trim() || null,
          }
        : ev,
    );
    setEditingEventId(null);
    saveSchedule(newSchedule);
  }

  const friday = parseEditionDate(edition.friday);
  const sunday = parseEditionDate(edition.sunday);

  async function saveSchedule(newSchedule: ScheduleEvent[]) {
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch(`/api/editions/${edition.id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ schedule: newSchedule }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Edition;
        onUpdated(updated);
      } else {
        setSaveError(true);
      }
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  function handleAddEvent(event: ScheduleEvent) {
    const newSchedule = [...edition.schedule, event];
    saveSchedule(newSchedule);
  }

  function handleRemoveEvent(eventId: string) {
    const newSchedule = edition.schedule.filter((ev) => ev.id !== eventId);
    saveSchedule(newSchedule);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/editions/${edition.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok || res.status === 204) {
        onDeleted(edition.id);
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const collapseId = `edition-collapse-${edition.id}`;

  return (
    <Card bg="dark" border="secondary" className="mb-2">
      <Card.Header className="d-flex justify-content-between align-items-center gap-2 flex-wrap py-2">
        <Button
          variant="link"
          className="text-warning text-decoration-none p-0 text-start fw-semibold"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={collapseId}
        >
          <i
            className={`bi bi-chevron-${open ? "down" : "right"} me-2`}
            aria-hidden="true"
          />
          {edition.id}
        </Button>
        <span className="text-secondary small">
          {friday.toLocaleDateString()} – {sunday.toLocaleDateString()}
        </span>
        <Badge bg={edition.active ? "success" : "secondary"}>
          {edition.active ? m.admin_content_edition_active() : m.admin_content_edition_inactive()}
        </Badge>
        <Badge bg="secondary">{edition.schedule.length} events</Badge>
        {saving && <Spinner animation="border" size="sm" variant="warning" />}
        {saveError && (
          <span className="text-danger small">
            <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
            {m.admin_content_error_save()}
          </span>
        )}
        {confirmDelete ? (
          <span className="d-flex align-items-center gap-1">
            <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1" />
              ) : null}
              Confirm delete
            </Button>
            <Button size="sm" variant="outline-secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <span className="d-flex gap-1">
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => { startEditEdition(); setOpen(true); }}
              aria-label={`Edit edition ${edition.id}`}
            >
              <i className="bi bi-pencil" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="outline-danger"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete edition ${edition.id}`}
            >
              <i className="bi bi-trash" aria-hidden="true" />
            </Button>
          </span>
        )}
      </Card.Header>
      <Collapse in={open}>
        <div id={collapseId}>
          <Card.Body className="pt-2 pb-2">
            {/* Edition edit form */}
            {editingEdition ? (
              <div className="border border-secondary rounded p-2 mb-3">
                <div className="d-flex gap-2 flex-wrap mb-2">
                  <Form.Control
                    size="sm"
                    type="number"
                    placeholder="Year"
                    value={editYear}
                    onChange={(e) => setEditYear(Number(e.target.value))}
                    className="bg-dark text-light border-secondary"
                    style={{ maxWidth: "90px" }}
                  />
                  <Form.Control
                    size="sm"
                    placeholder="Month (e.g. march)"
                    value={editMonth}
                    onChange={(e) => setEditMonth(e.target.value)}
                    className="bg-dark text-light border-secondary"
                    style={{ minWidth: "130px", flex: "1 1 130px" }}
                  />
                  <Form.Check
                    type="checkbox"
                    id={`edit-active-${edition.id}`}
                    label={m.admin_content_edition_active()}
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                    className="text-light align-self-center"
                  />
                </div>
                <div className="d-flex gap-2 flex-wrap mb-2">
                  <div>
                    <Form.Label className="text-secondary small mb-0">{m.admin_content_edition_friday()}</Form.Label>
                    <Form.Control size="sm" type="date" value={editFriday} onChange={(e) => setEditFriday(e.target.value)} className="bg-dark text-light border-secondary" />
                  </div>
                  <div>
                    <Form.Label className="text-secondary small mb-0">{m.admin_content_edition_saturday()}</Form.Label>
                    <Form.Control size="sm" type="date" value={editSaturday} onChange={(e) => setEditSaturday(e.target.value)} className="bg-dark text-light border-secondary" />
                  </div>
                  <div>
                    <Form.Label className="text-secondary small mb-0">{m.admin_content_edition_sunday()}</Form.Label>
                    <Form.Control size="sm" type="date" value={editSunday} onChange={(e) => setEditSunday(e.target.value)} className="bg-dark text-light border-secondary" />
                  </div>
                </div>
                <h6 className="text-secondary small mb-1">{m.admin_content_edition_venue()}</h6>
                <div className="d-flex gap-2 flex-wrap mb-2">
                  <Form.Control size="sm" placeholder="Venue name" value={editVenueName} onChange={(e) => setEditVenueName(e.target.value)} className="bg-dark text-light border-secondary" style={{ minWidth: "180px", flex: "2 1 180px" }} />
                  <Form.Control size="sm" placeholder="Address" value={editVenueAddress} onChange={(e) => setEditVenueAddress(e.target.value)} className="bg-dark text-light border-secondary" style={{ minWidth: "180px", flex: "2 1 180px" }} />
                </div>
                <div className="d-flex gap-2 flex-wrap mb-2">
                  <Form.Control size="sm" placeholder="City" value={editVenueCity} onChange={(e) => setEditVenueCity(e.target.value)} className="bg-dark text-light border-secondary" style={{ minWidth: "120px", flex: "1 1 120px" }} />
                  <Form.Control size="sm" placeholder="Postal code" value={editVenuePostalCode} onChange={(e) => setEditVenuePostalCode(e.target.value)} className="bg-dark text-light border-secondary" style={{ maxWidth: "110px" }} />
                  <Form.Control size="sm" placeholder="Country" value={editVenueCountry} onChange={(e) => setEditVenueCountry(e.target.value)} className="bg-dark text-light border-secondary" style={{ minWidth: "110px", flex: "1 1 110px" }} />
                </div>
                <div className="d-flex gap-2">
                  <Button size="sm" variant="outline-success" onClick={commitEditEdition} disabled={saving}>
                    {saving ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1" /> : <i className="bi bi-check-lg me-1" aria-hidden="true" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline-secondary" onClick={() => setEditingEdition(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* Venue info (read-only) */
              (edition.venue_name || edition.venue_city) && (
                <p className="text-secondary small mb-2">
                  <i className="bi bi-geo-alt me-1" aria-hidden="true" />
                  {[edition.venue_name, edition.venue_address, edition.venue_city, edition.venue_country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )
            )}

            {/* Schedule */}
            <h6 className="text-warning mb-1 small">{m.admin_content_edition_schedule()}</h6>
            {edition.schedule.length === 0 ? (
              <p className="text-secondary fst-italic small">
                {m.admin_content_edition_no_events()}
              </p>
            ) : (
              <ListGroup variant="flush" className="mb-1">
                {edition.schedule.map((ev) =>
                  editingEventId === ev.id ? (
                    <ListGroup.Item key={ev.id} className="bg-dark border-secondary px-0 py-2">
                      <div className="d-flex gap-2 flex-wrap mb-2">
                        <Form.Control
                          size="sm"
                          placeholder="Title"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="bg-dark text-light border-secondary"
                          style={{ minWidth: "200px", flex: "2 1 200px" }}
                          autoFocus
                        />
                        <Form.Select
                          size="sm"
                          value={editDayId}
                          onChange={(e) => setEditDayId(Number(e.target.value))}
                          className="bg-dark text-light border-secondary"
                          style={{ maxWidth: "110px" }}
                        >
                          <option value={1}>{m.admin_content_edition_friday()}</option>
                          <option value={2}>{m.admin_content_edition_saturday()}</option>
                          <option value={3}>{m.admin_content_edition_sunday()}</option>
                        </Form.Select>
                        <Form.Control
                          size="sm"
                          placeholder="Start time"
                          value={editStartTime}
                          onChange={(e) => setEditStartTime(e.target.value)}
                          className="bg-dark text-light border-secondary"
                          style={{ maxWidth: "110px" }}
                        />
                        <Form.Control
                          size="sm"
                          placeholder="End time"
                          value={editEndTime}
                          onChange={(e) => setEditEndTime(e.target.value)}
                          className="bg-dark text-light border-secondary"
                          style={{ maxWidth: "110px" }}
                        />
                        <Form.Control
                          size="sm"
                          placeholder="Category"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="bg-dark text-light border-secondary"
                          style={{ maxWidth: "130px" }}
                        />
                      </div>
                      <div className="d-flex gap-2 flex-wrap mb-2">
                        <Form.Control
                          size="sm"
                          placeholder="Location (optional)"
                          value={editLocation}
                          onChange={(e) => setEditLocation(e.target.value)}
                          className="bg-dark text-light border-secondary"
                          style={{ minWidth: "160px", flex: "1 1 160px" }}
                        />
                        <Form.Control
                          size="sm"
                          placeholder="Presenter (optional)"
                          value={editPresenter}
                          onChange={(e) => setEditPresenter(e.target.value)}
                          className="bg-dark text-light border-secondary"
                          style={{ minWidth: "160px", flex: "1 1 160px" }}
                        />
                      </div>
                      <Form.Control
                        as="textarea"
                        size="sm"
                        rows={2}
                        placeholder="Description (optional)"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="bg-dark text-light border-secondary mb-2"
                      />
                      <div className="d-flex gap-3 align-items-center flex-wrap mb-2">
                        <Form.Check
                          type="checkbox"
                          id={`edit-reservation-${ev.id}`}
                          label="Requires reservation"
                          checked={editReservation}
                          onChange={(e) => setEditReservation(e.target.checked)}
                          className="text-light"
                        />
                        {editReservation && (
                          <div className="d-flex align-items-center gap-2">
                            <Form.Label className="mb-0 text-secondary small">
                              {m.admin_content_edition_reservation_opens()}
                            </Form.Label>
                            <Form.Control
                              type="datetime-local"
                              size="sm"
                              value={editReservationsOpenFrom}
                              onChange={(e) => setEditReservationsOpenFrom(e.target.value)}
                              className="bg-dark text-light border-secondary"
                              style={{ maxWidth: "220px" }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="d-flex gap-2">
                        <Button size="sm" variant="outline-success" onClick={commitEditEvent}>
                          <i className="bi bi-check-lg me-1" aria-hidden="true" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          onClick={() => setEditingEventId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </ListGroup.Item>
                  ) : (
                  <ListGroup.Item
                    key={ev.id}
                    className="bg-dark text-light border-secondary d-flex justify-content-between align-items-center gap-2 py-1 px-0"
                  >
                    <span className="d-flex align-items-center gap-2 flex-wrap">
                      <Badge bg="secondary" className="text-uppercase" style={{ fontSize: "0.65rem" }}>
                        {DAY_LABELS[ev.day_id] ?? ev.day_id}
                      </Badge>
                      <span className="text-secondary small">{ev.start_time}</span>
                      <span>{ev.title}</span>
                      <Badge bg="info" text="dark" className="text-capitalize" style={{ fontSize: "0.65rem" }}>
                        {ev.category}
                      </Badge>
                      {ev.reservation && (
                        <Badge bg="warning" text="dark" style={{ fontSize: "0.65rem" }}>
                          reservation
                        </Badge>
                      )}
                    </span>
                    <span className="d-flex gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => startEditEvent(ev)}
                        aria-label={`Edit event ${ev.title}`}
                      >
                        <i className="bi bi-pencil" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => handleRemoveEvent(ev.id)}
                        aria-label={`Delete event ${ev.title}`}
                        className="flex-shrink-0"
                      >
                        <i className="bi bi-trash" aria-hidden="true" />
                      </Button>
                    </span>
                  </ListGroup.Item>
                  ),
                )}
              </ListGroup>
            )}
            <AddEventForm onAdd={handleAddEvent} />
          </Card.Body>
        </div>
      </Collapse>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AddEditionForm — inline form to create a new edition
// ---------------------------------------------------------------------------

interface AddEditionFormProps {
  authHeaders: () => Record<string, string>;
  onCreated: (edition: Edition) => void;
}

function AddEditionForm({ authHeaders, onCreated }: AddEditionFormProps) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState("");
  const [friday, setFriday] = useState("");
  const [saturday, setSaturday] = useState("");
  const [sunday, setSunday] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venuePostalCode, setVenuePostalCode] = useState("");
  const [venueCountry, setVenueCountry] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim() || !month.trim() || !friday || !saturday || !sunday) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/editions", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          id: id.trim(),
          year,
          month: month.trim(),
          friday,
          saturday,
          sunday,
          venue_name: venueName.trim(),
          venue_address: venueAddress.trim(),
          venue_city: venueCity.trim(),
          venue_postal_code: venuePostalCode.trim(),
          venue_country: venueCountry.trim(),
          active,
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as Edition;
        onCreated(created);
        setId("");
        setMonth("");
        setFriday("");
        setSaturday("");
        setSunday("");
        setVenueName("");
        setVenueAddress("");
        setVenueCity("");
        setVenuePostalCode("");
        setVenueCountry("");
        setActive(true);
        setOpen(false);
      } else {
        const body = await res.json().catch(() => ({}));
        setError((body as { detail?: string }).detail ?? m.admin_content_error_save());
      }
    } catch {
      setError(m.admin_content_error_save());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-3">
      <Button
        size="sm"
        variant="outline-warning"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <i className="bi bi-plus-lg me-1" aria-hidden="true" />
        {m.admin_content_edition_add()}
      </Button>
      <Collapse in={open}>
        <div>
          <Form onSubmit={handleSubmit} className="mt-2 p-2 border border-secondary rounded">
            {error && (
              <Alert variant="danger" className="py-1 mb-2 small">
                {error}
              </Alert>
            )}
            <div className="d-flex gap-2 flex-wrap mb-2">
              <Form.Control
                size="sm"
                placeholder="ID (e.g. 2026-march)"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "180px", flex: "1 1 180px" }}
                required
              />
              <Form.Control
                size="sm"
                type="number"
                placeholder="Year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="bg-dark text-light border-secondary"
                style={{ maxWidth: "100px" }}
                required
              />
              <Form.Control
                size="sm"
                placeholder="Month (e.g. march)"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "140px", flex: "1 1 140px" }}
                required
              />
            </div>
            <div className="d-flex gap-2 flex-wrap mb-2">
              <div>
                <Form.Label className="text-secondary small mb-0">
                  {m.admin_content_edition_friday()}
                </Form.Label>
                <Form.Control
                  size="sm"
                  type="date"
                  value={friday}
                  onChange={(e) => setFriday(e.target.value)}
                  className="bg-dark text-light border-secondary"
                  required
                />
              </div>
              <div>
                <Form.Label className="text-secondary small mb-0">
                  {m.admin_content_edition_saturday()}
                </Form.Label>
                <Form.Control
                  size="sm"
                  type="date"
                  value={saturday}
                  onChange={(e) => setSaturday(e.target.value)}
                  className="bg-dark text-light border-secondary"
                  required
                />
              </div>
              <div>
                <Form.Label className="text-secondary small mb-0">
                  {m.admin_content_edition_sunday()}
                </Form.Label>
                <Form.Control
                  size="sm"
                  type="date"
                  value={sunday}
                  onChange={(e) => setSunday(e.target.value)}
                  className="bg-dark text-light border-secondary"
                  required
                />
              </div>
            </div>
            <h6 className="text-secondary small mb-1">
              {m.admin_content_edition_venue()} (optional)
            </h6>
            <div className="d-flex gap-2 flex-wrap mb-2">
              <Form.Control
                size="sm"
                placeholder="Venue name"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "180px", flex: "2 1 180px" }}
              />
              <Form.Control
                size="sm"
                placeholder="Address"
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "180px", flex: "2 1 180px" }}
              />
            </div>
            <div className="d-flex gap-2 flex-wrap mb-2">
              <Form.Control
                size="sm"
                placeholder="City"
                value={venueCity}
                onChange={(e) => setVenueCity(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "140px", flex: "1 1 140px" }}
              />
              <Form.Control
                size="sm"
                placeholder="Postal code"
                value={venuePostalCode}
                onChange={(e) => setVenuePostalCode(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ maxWidth: "120px" }}
              />
              <Form.Control
                size="sm"
                placeholder="Country"
                value={venueCountry}
                onChange={(e) => setVenueCountry(e.target.value)}
                className="bg-dark text-light border-secondary"
                style={{ minWidth: "120px", flex: "1 1 120px" }}
              />
            </div>
            <Form.Check
              type="checkbox"
              id="edition-active"
              label={m.admin_content_edition_active()}
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="text-light mb-2"
            />
            <Button type="submit" size="sm" variant="outline-warning" disabled={saving}>
              {saving ? (
                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1" />
              ) : (
                <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              )}
              {m.admin_content_edition_add()}
            </Button>
          </Form>
        </div>
      </Collapse>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditionsSection — full CRUD
// ---------------------------------------------------------------------------

interface EditionsSectionProps {
  authHeaders: () => Record<string, string>;
}

function EditionsSection({ authHeaders }: EditionsSectionProps) {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(false);
      try {
        const res = await fetch("/api/editions");
        if (res.ok && !cancelled) {
          const data = (await res.json()) as Edition[];
          setEditions(data);
        } else if (!cancelled) {
          setLoadError(true);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreated = useCallback((edition: Edition) => {
    setEditions((prev) => [...prev, edition]);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setEditions((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleUpdated = useCallback((updated: Edition) => {
    setEditions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }, []);

  return (
    <div className="mb-4">
      <h6 className="mb-2 text-warning">{m.admin_content_editions_section()}</h6>

      {isLoading && (
        <div className="text-center py-3">
          <Spinner animation="border" size="sm" variant="warning" />
          <span className="ms-2 text-secondary">{m.admin_content_loading()}</span>
        </div>
      )}

      {!isLoading && loadError && (
        <Alert variant="danger" className="py-2 small">
          {m.admin_content_error_load()}
        </Alert>
      )}

      {!isLoading && !loadError && (
        <>
          <AddEditionForm authHeaders={authHeaders} onCreated={handleCreated} />
          {editions.length === 0 ? (
            <p className="text-secondary fst-italic small">No editions yet.</p>
          ) : (
            editions.map((ed) => (
              <EditionCard
                key={ed.id}
                edition={ed}
                authHeaders={authHeaders}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContentManagement — top-level component
// ---------------------------------------------------------------------------

export default function ContentManagement({ authHeaders }: ContentManagementProps) {
  return (
    <div>
      <Card bg="dark" text="white" border="secondary" className="mb-3">
        <Card.Body>
          <ContentSection
            sectionKey="producers"
            title={m.admin_content_producers_section()}
            authHeaders={authHeaders}
          />
          <hr className="border-secondary" />
          <ContentSection
            sectionKey="sponsors"
            title={m.admin_content_sponsors_section()}
            authHeaders={authHeaders}
          />
          <hr className="border-secondary" />
          <EditionsSection authHeaders={authHeaders} />
        </Card.Body>
      </Card>
    </div>
  );
}
