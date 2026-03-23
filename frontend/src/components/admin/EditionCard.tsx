import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import EditionModal from "./EditionModal";
import EventModal from "./EventModal";
import { parseEditionDate, type Edition } from "./editionTypes";
import type { Venue } from "@/types/admin";
import { apiToEvent, type Event, type EventFormData } from "@/types/event";

async function fetchEditionEvents(editionId: string, authHeaders: () => Record<string, string>): Promise<Event[]> {
  const response = await fetch(`/api/events?edition_id=${encodeURIComponent(editionId)}`, { headers: authHeaders() });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_content_error_load());
  }
  const payload = await response.json();
  return Array.isArray(payload)
    ? payload.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null).map(apiToEvent)
    : [];
}

async function persistEvent(method: "POST" | "PUT", url: string, body: Record<string, unknown>, authHeaders: () => Record<string, string>): Promise<Event> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_content_error_save());
  }
  return apiToEvent((await response.json()) as Record<string, unknown>);
}

async function deleteEvent(eventId: string, authHeaders: () => Record<string, string>): Promise<void> {
  const response = await fetch(`/api/events/${eventId}`, { method: "DELETE", headers: authHeaders() });
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_content_error_save());
  }
}

async function deleteEdition(editionId: string, authHeaders: () => Record<string, string>): Promise<string> {
  const response = await fetch(`/api/editions/${editionId}`, { method: "DELETE", headers: authHeaders() });
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? m.admin_content_error_save());
  }
  return editionId;
}

interface EditionCardProps {
  edition: Edition;
  venues: Venue[];
  authHeaders: () => Record<string, string>;
  onDeleted: (id: string) => void;
  onUpdated: (edition: Edition) => void;
  onEventMutation?: () => void;
}

function editionTypeBadge(type: Edition["editionType"]) {
  switch (type) {
    case "bourse":
      return { label: "Bourse", bg: "info" };
    case "capsule_exchange":
      return { label: "Capsule Exchange", bg: "primary" };
    default:
      return { label: "Festival", bg: "warning" };
  }
}

export default function EditionCard({ edition, venues, authHeaders, onDeleted, onUpdated, onEventMutation }: EditionCardProps) {
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [editionModalOpen, setEditionModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const eventsQuery = useQuery({
    queryKey: ["admin", "edition-events", edition.id],
    queryFn: () => fetchEditionEvents(edition.id, authHeaders),
    staleTime: 30 * 1000,
    retry: false,
  });

  const deleteEditionMutation = useMutation({ mutationFn: () => deleteEdition(edition.id, authHeaders), retry: false });
  const saveEventMutation = useMutation({
    mutationFn: ({ formData }: { event: Event; formData: EventFormData }) =>
      persistEvent(
        editingEvent ? "PUT" : "POST",
        editingEvent ? `/api/events/${editingEvent.id}` : "/api/events",
        {
          edition_id: edition.id,
          title: formData.title.trim(),
          description: formData.description.trim(),
          date: formData.date,
          start_time: formData.startTime,
          end_time: formData.endTime || null,
          category: formData.category.trim(),
          registration_required: formData.registrationRequired,
          registrations_open_from: formData.registrationRequired && formData.registrationsOpenFrom ? formData.registrationsOpenFrom : null,
          max_capacity: formData.registrationRequired && formData.maxCapacity ? Number(formData.maxCapacity) : null,
          active: formData.active,
        },
        authHeaders,
      ),
    retry: false,
  });
  const deleteEventMutation = useMutation({ mutationFn: (eventId: string) => deleteEvent(eventId, authHeaders), retry: false });

  const events = eventsQuery.data ?? edition.events ?? [];
  const sortedEvents = useMemo(() => [...events].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)), [events]);
  const dates = edition.dates.length > 0 ? edition.dates : sortedEvents.map((event) => event.date);
  const startDate = dates[0] ? parseEditionDate(dates[0]) : null;
  const endDateIso = dates.length > 0 ? dates[dates.length - 1] : undefined;
  const endDate = endDateIso ? parseEditionDate(endDateIso) : null;
  const typeDisplay = editionTypeBadge(edition.editionType);

  function openAddEvent() {
    setEditingEvent(null);
    setEventModalOpen(true);
  }

  function openEditEvent(event: Event) {
    setEditingEvent(event);
    setEventModalOpen(true);
  }

  async function handleEventSaved(event: Event, formData: EventFormData) {
    setSaveError("");
    try {
      await saveEventMutation.mutateAsync({ event, formData });
      setEventModalOpen(false);
      await eventsQuery.refetch();
      onEventMutation?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : m.admin_content_error_save());
    }
  }

  async function handleRemoveEvent(eventId: string) {
    setSaveError("");
    try {
      await deleteEventMutation.mutateAsync(eventId);
      await eventsQuery.refetch();
      onEventMutation?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : m.admin_content_error_save());
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteEditionMutation.mutateAsync();
      setConfirmDelete(false);
      onDeleted(edition.id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : m.admin_content_error_save());
    } finally {
      setDeleting(false);
    }
  }

  const collapseId = `edition-collapse-${edition.id}`;

  return (
    <Card bg="dark" border="secondary" className="mb-2">
      <Card.Header className="d-flex justify-content-between align-items-center gap-2 flex-wrap py-2">
        <Button variant="link" className="text-warning text-decoration-none p-0 text-start fw-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={collapseId}>
          <i className={`bi bi-chevron-${open ? "down" : "right"} me-2`} aria-hidden="true" />
          {edition.id}
        </Button>
        <span className="d-flex align-items-center gap-2 flex-wrap">
          <Badge bg={typeDisplay.bg}>{typeDisplay.label}</Badge>
          {startDate && endDate ? <span className="text-secondary small">{startDate.toLocaleDateString()} {startDate.getTime() !== endDate.getTime() ? `– ${endDate.toLocaleDateString()}` : ''}</span> : <span className="text-secondary small">Dates defined by events</span>}
        </span>
        <Badge bg={edition.active ? "success" : "secondary"}>{edition.active ? m.admin_content_edition_active() : m.admin_content_edition_inactive()}</Badge>
        <Badge bg="secondary">{sortedEvents.length} {m.admin_edition_events()}</Badge>
        {(edition.producers?.length ?? 0) > 0 && <Badge bg="secondary">{edition.producers!.length} {m.admin_edition_producers()}</Badge>}
        {(edition.sponsors?.length ?? 0) > 0 && <Badge bg="secondary">{edition.sponsors!.length} {m.admin_edition_sponsors()}</Badge>}
        {eventsQuery.isFetching && <Spinner animation="border" size="sm" variant="warning" />}
        {saveError && <span className="text-danger small"><i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />{saveError}</span>}
        {deleteError && <span className="text-danger small"><i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />{deleteError}</span>}
        {confirmDelete ? (
          <span className="d-flex align-items-center gap-1">
            <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>{deleting && <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1" />}{m.admin_action_confirm()}</Button>
            <Button size="sm" variant="outline-secondary" onClick={() => setConfirmDelete(false)}>{m.admin_action_cancel()}</Button>
          </span>
        ) : (
          <span className="d-flex gap-1">
            <Button size="sm" variant="outline-secondary" onClick={() => setEditionModalOpen(true)} aria-label={`${m.admin_edit()} ${edition.id}`}><i className="bi bi-pencil" aria-hidden="true" /></Button>
            <Button size="sm" variant="outline-danger" onClick={() => setConfirmDelete(true)} aria-label={`${m.admin_delete()} ${edition.id}`}><i className="bi bi-trash" aria-hidden="true" /></Button>
          </span>
        )}
      </Card.Header>

      {open && (
        <Card.Body id={collapseId} className="pt-2 pb-2">
          {(() => {
            const venue = venues.find((value) => value.id === edition.venue.id);
            if (!venue) return null;
            return <p className="text-secondary small mb-2"><i className="bi bi-geo-alt me-1" aria-hidden="true" />{[venue.name, venue.address, venue.city, venue.country].filter(Boolean).join(", ")}{!venue.active && <Badge bg="secondary" className="ms-2 fs-3xs">{m.admin_venue_archived_badge()}</Badge>}</p>;
          })()}

          {edition.editionType !== "festival" && (edition.externalPartner || edition.externalContactName || edition.externalContactEmail) && (
            <div className="text-secondary small mb-3">
              <div className="text-light mb-1">External partner</div>
              <div>{edition.externalPartner || '—'}</div>
              {(edition.externalContactName || edition.externalContactEmail) && <div>{[edition.externalContactName, edition.externalContactEmail].filter(Boolean).join(' · ')}</div>}
            </div>
          )}

          <div className="d-flex justify-content-between align-items-center mb-1">
            <h6 className="text-warning mb-0 small">{m.admin_content_edition_schedule()}</h6>
            <Button size="sm" variant="outline-secondary" onClick={openAddEvent}><i className="bi bi-plus-lg me-1" aria-hidden="true" />{m.admin_content_edition_add_event()}</Button>
          </div>

          {eventsQuery.isPending ? (
            <div className="text-secondary small py-2"><Spinner animation="border" size="sm" className="me-2" />Loading events…</div>
          ) : sortedEvents.length === 0 ? (
            <p className="text-secondary fst-italic small">{m.admin_content_edition_no_events()}</p>
          ) : (
            <ListGroup variant="flush" className="mb-1">
              {sortedEvents.map((event) => (
                <ListGroup.Item key={event.id} className="bg-dark text-light border-secondary d-flex justify-content-between align-items-center gap-2 py-1 px-0">
                  <span className="d-flex align-items-center gap-2 flex-wrap">
                    <Badge bg="secondary" className="fs-3xs">{event.date}</Badge>
                    <span className="text-secondary small">{event.startTime}{event.endTime ? `–${event.endTime}` : ''}</span>
                    <span>{event.title}</span>
                    <Badge bg="info" text="dark" className="text-capitalize fs-3xs">{event.category}</Badge>
                    {event.registrationRequired && <Badge bg="warning" text="dark" className="fs-3xs">{m.schedule_registration()}</Badge>}
                    {event.maxCapacity !== undefined && <Badge bg="secondary" className="fs-3xs">Cap {event.maxCapacity}</Badge>}
                  </span>
                  <span className="d-flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="outline-secondary" onClick={() => openEditEvent(event)} aria-label={`Edit event ${event.title}`}><i className="bi bi-pencil" aria-hidden="true" /></Button>
                    <Button size="sm" variant="outline-danger" onClick={() => handleRemoveEvent(event.id)} aria-label={`Delete event ${event.title}`}><i className="bi bi-trash" aria-hidden="true" /></Button>
                  </span>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Card.Body>
      )}

      <EditionModal show={editionModalOpen} initial={edition} venues={venues} authHeaders={authHeaders} onSaved={(updated) => { onUpdated(updated); setEditionModalOpen(false); }} onHide={() => setEditionModalOpen(false)} />
      <EventModal show={eventModalOpen} edition={edition} initial={editingEvent} onSave={handleEventSaved} onHide={() => setEventModalOpen(false)} />
    </Card>
  );
}
